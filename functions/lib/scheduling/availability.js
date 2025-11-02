"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveManyDoctorAvailability = exports.resolveDoctorAvailability = void 0;
const luxon_1 = require("luxon");
const firestore_1 = require("./firestore");
const settings_1 = require("./settings");
const types_1 = require("./types");
const utils_1 = require("./utils");
const AVAILABILITY_CACHE_TTL_MS = 30 * 1000; // 30 seconds reuse window
const availabilityCache = new Map();
const buildAvailabilityCacheKey = (clinicId, doctorId) => `${clinicId}::${doctorId}`;
const getDayKey = (dt) => {
    const index = dt.weekday - 1; // Luxon weekday: 1 = Monday ... 7 = Sunday
    return types_1.DAY_OF_WEEK_ORDER[index] ?? 'monday';
};
const getMinuteOfDay = (dt) => dt.hour * 60 + dt.minute + dt.second / 60 + dt.millisecond / 60000;
const isWithinTimeRange = (localTime, range) => {
    const minuteOfDay = getMinuteOfDay(localTime);
    return minuteOfDay >= range.startMinutes && minuteOfDay < range.endMinutes;
};
const isOverrideActive = (override, referenceMillis) => {
    const startMillis = override.start.toMillis();
    const endMillis = override.end.toMillis();
    return startMillis <= referenceMillis && referenceMillis < endMillis;
};
const isBlockedAt = (overrides, targetMillis) => {
    return overrides.some((override) => {
        if (override.type !== 'blocker') {
            return false;
        }
        const startMillis = override.start.toMillis();
        const endMillis = override.end.toMillis();
        return startMillis <= targetMillis && targetMillis < endMillis;
    });
};
const findActiveBlocker = (overrides, referenceMillis) => {
    return overrides.find((override) => override.type === 'blocker' && isOverrideActive(override, referenceMillis));
};
const findActiveException = (overrides, referenceMillis) => {
    return overrides.find((override) => override.type === 'exception' && isOverrideActive(override, referenceMillis));
};
const findNextExceptionStart = (overrides, referenceMillis) => {
    const upcoming = overrides
        .filter((override) => override.type === 'exception' && override.start.toMillis() >= referenceMillis)
        .sort((a, b) => a.start.toMillis() - b.start.toMillis());
    for (const exception of upcoming) {
        const startMillis = exception.start.toMillis();
        if (!isBlockedAt(overrides, startMillis)) {
            return { date: exception.start.toDate(), override: exception };
        }
    }
    return null;
};
const findNextDefaultStart = (rota, localReference, overrides) => {
    const normalizedWeek = {};
    for (const dayKey of types_1.DAY_OF_WEEK_ORDER) {
        const blocks = rota.week?.[dayKey];
        if (!blocks) {
            continue;
        }
        const parsed = blocks
            .map((block) => (0, utils_1.parseTimeBlock)(block))
            .filter((range) => range !== null)
            .sort((a, b) => a.startMinutes - b.startMinutes);
        if (parsed.length > 0) {
            normalizedWeek[dayKey] = parsed;
        }
    }
    const currentMinuteOfDay = getMinuteOfDay(localReference);
    const startOfDay = localReference.startOf('day');
    for (let offset = 0; offset < 7; offset += 1) {
        const candidateDay = startOfDay.plus({ days: offset });
        const dayKey = getDayKey(candidateDay);
        const ranges = normalizedWeek[dayKey];
        if (!ranges || ranges.length === 0) {
            continue;
        }
        for (const range of ranges) {
            if (offset === 0 && range.startMinutes <= currentMinuteOfDay) {
                continue;
            }
            const candidate = candidateDay.plus({ minutes: range.startMinutes });
            const candidateMillis = candidate.toMillis();
            if (isBlockedAt(overrides, candidateMillis)) {
                continue;
            }
            return {
                date: candidate.toUTC().toJSDate(),
                day: dayKey,
                block: range
            };
        }
    }
    return null;
};
const buildReasonMessage = (code, options) => {
    if (code === 'REALTIME_OFFLINE') {
        return 'Temporarily offline. Please check back soon.';
    }
    if (code === 'REALTIME_AVAILABLE') {
        return 'Available now.';
    }
    if (code === 'BLOCKER') {
        if (options.override) {
            const end = options.override.end.toDate();
            const tz = options.rota?.timeZone ?? 'UTC';
            const formatted = luxon_1.DateTime.fromJSDate(end).setZone(tz).toLocaleString(luxon_1.DateTime.DATETIME_MED);
            return `On leave. Expected back: ${formatted}`;
        }
        return 'On leave.';
    }
    if (code === 'DEFAULT_OFFLINE') {
        if (options.next) {
            const tz = options.rota?.timeZone ?? 'UTC';
            const formatted = luxon_1.DateTime.fromJSDate(options.next).setZone(tz).toLocaleString(luxon_1.DateTime.DATETIME_MED);
            return `Offline. Expected back: ${formatted}`;
        }
        return 'Offline right now.';
    }
    if (code === 'DEFAULT_AVAILABLE' || code === 'EXCEPTION_AVAILABLE') {
        return 'Available now.';
    }
    if (code === 'NO_SCHEDULE') {
        return 'Schedule not configured.';
    }
    return undefined;
};
const resolveFromDefaultRota = (clinicId, doctorId, rota, overrides, reference) => {
    const computedAt = new Date();
    if (!rota || !rota.timeZone) {
        return {
            clinicId,
            doctorId,
            status: 'UNAVAILABLE',
            layer: 'NO_SCHEDULE_DATA',
            reasonCode: 'NO_SCHEDULE',
            computedAt,
            message: buildReasonMessage('NO_SCHEDULE', {})
        };
    }
    const localReference = luxon_1.DateTime.fromJSDate(reference).setZone(rota.timeZone);
    const dayKey = getDayKey(localReference);
    const blocks = rota.week?.[dayKey] ?? [];
    const parsedBlocks = blocks
        .map((block) => (0, utils_1.parseTimeBlock)(block))
        .filter((range) => range !== null);
    const isInsideDefaultBlock = parsedBlocks.some((range) => isWithinTimeRange(localReference, range));
    if (isInsideDefaultBlock) {
        return {
            clinicId,
            doctorId,
            status: 'AVAILABLE',
            layer: 'DEFAULT_ROTA',
            reasonCode: 'DEFAULT_AVAILABLE',
            computedAt,
            message: buildReasonMessage('DEFAULT_AVAILABLE', { rota })
        };
    }
    const referenceMillis = reference.getTime();
    const nextException = findNextExceptionStart(overrides, referenceMillis);
    const nextDefault = findNextDefaultStart(rota, localReference, overrides);
    let nextAvailableAt = null;
    let nextAvailabilitySource = null;
    if (nextException) {
        nextAvailableAt = nextException.date;
        nextAvailabilitySource = 'OVERRIDE_EXCEPTION';
    }
    if (nextDefault && (!nextAvailableAt || nextDefault.date.getTime() < nextAvailableAt.getTime())) {
        nextAvailableAt = nextDefault.date;
        nextAvailabilitySource = 'DEFAULT_ROTA';
    }
    const message = buildReasonMessage('DEFAULT_OFFLINE', {
        rota,
        next: nextAvailableAt ?? undefined,
        override: nextException?.override
    });
    return {
        clinicId,
        doctorId,
        status: 'UNAVAILABLE',
        layer: 'DEFAULT_ROTA',
        reasonCode: 'DEFAULT_OFFLINE',
        computedAt,
        nextAvailableAt,
        message,
        debug: {
            nextDefaultStart: nextDefault?.date.toISOString() ?? null,
            nextExceptionStart: nextException?.date.toISOString() ?? null,
            nextAvailabilitySource
        }
    };
};
const resolveDoctorAvailability = async (input) => {
    const { clinicId, doctorId } = input;
    const reference = input.reference ?? new Date();
    const computedAt = new Date();
    const cacheEligible = !input.settings && !input.reference;
    const cacheKey = cacheEligible ? buildAvailabilityCacheKey(clinicId, doctorId) : null;
    const now = Date.now();
    if (cacheKey) {
        const cached = availabilityCache.get(cacheKey);
        if (cached) {
            if (cached.expiresAt > now) {
                const cachedData = cached.data;
                return {
                    ...cachedData,
                    computedAt: new Date()
                };
            }
            availabilityCache.delete(cacheKey);
        }
    }
    const finalizeResult = (result) => {
        if (cacheKey) {
            availabilityCache.set(cacheKey, {
                data: result,
                expiresAt: now + AVAILABILITY_CACHE_TTL_MS
            });
        }
        return result;
    };
    const settings = input.settings ?? (await (0, settings_1.loadClinicSchedulingSettings)(clinicId));
    const manualCheckInRequired = settings.manualCheckInRequired === true;
    const allowOfflineSignups = settings.allowOfflineSignups === true;
    const settingsSource = input.settings ? 'caller' : 'firestore';
    const mergeDebug = (existing) => ({
        ...(existing ?? {}),
        manualCheckInRequired,
        allowOfflineSignups,
        settingsSource
    });
    const snapshot = await (0, firestore_1.loadDoctorSchedulingSnapshot)(clinicId, doctorId, {
        reference
    });
    const { document, overrides } = snapshot;
    const realTime = document.realTimeStatus ?? null;
    const realTimeOnline = realTime?.online === true;
    if (!realTimeOnline) {
        return finalizeResult({
            clinicId,
            doctorId,
            status: 'UNAVAILABLE',
            layer: 'REALTIME_TOGGLE',
            reasonCode: 'REALTIME_OFFLINE',
            computedAt,
            realTimeStatus: realTime ?? undefined,
            message: buildReasonMessage('REALTIME_OFFLINE', {}),
            debug: mergeDebug({ realTimePresent: !!realTime, realTimeOnline })
        });
    }
    const referenceMillis = reference.getTime();
    const activeBlocker = findActiveBlocker(overrides, referenceMillis);
    if (activeBlocker) {
        return finalizeResult({
            clinicId,
            doctorId,
            status: 'UNAVAILABLE',
            layer: 'OVERRIDE_BLOCKER',
            reasonCode: 'BLOCKER',
            computedAt,
            activeOverride: activeBlocker,
            realTimeStatus: realTime ?? undefined,
            nextAvailableAt: activeBlocker.end.toDate(),
            message: buildReasonMessage('BLOCKER', { rota: document.defaultRota, override: activeBlocker }),
            debug: mergeDebug({ activeBlocker: activeBlocker.id })
        });
    }
    const activeException = findActiveException(overrides, referenceMillis);
    if (activeException) {
        return finalizeResult({
            clinicId,
            doctorId,
            status: 'AVAILABLE',
            layer: 'OVERRIDE_EXCEPTION',
            reasonCode: 'EXCEPTION_AVAILABLE',
            computedAt,
            activeOverride: activeException,
            realTimeStatus: realTime ?? undefined,
            message: buildReasonMessage('EXCEPTION_AVAILABLE', { rota: document.defaultRota }),
            debug: mergeDebug({ activeException: activeException.id })
        });
    }
    const defaultResolution = resolveFromDefaultRota(clinicId, doctorId, document.defaultRota, overrides, reference);
    if (defaultResolution.status === 'AVAILABLE') {
        return finalizeResult({
            ...defaultResolution,
            realTimeStatus: realTime ?? undefined,
            debug: mergeDebug(defaultResolution.debug)
        });
    }
    return finalizeResult({
        clinicId,
        doctorId,
        status: 'AVAILABLE',
        layer: 'REALTIME_TOGGLE',
        reasonCode: 'REALTIME_AVAILABLE',
        computedAt,
        realTimeStatus: realTime ?? undefined,
        message: buildReasonMessage('REALTIME_AVAILABLE', { rota: document.defaultRota }),
        debug: mergeDebug({
            realTimeOverride: true,
            scheduleLayer: defaultResolution.layer,
            scheduleReason: defaultResolution.reasonCode
        })
    });
};
exports.resolveDoctorAvailability = resolveDoctorAvailability;
const resolveManyDoctorAvailability = async (input) => {
    const { clinicId, doctorIds, reference } = input;
    const settings = input.settings ?? (await (0, settings_1.loadClinicSchedulingSettings)(clinicId));
    const tasks = doctorIds.map((id) => (0, exports.resolveDoctorAvailability)({
        clinicId,
        doctorId: id,
        reference,
        settings
    }));
    return Promise.all(tasks);
};
exports.resolveManyDoctorAvailability = resolveManyDoctorAvailability;
//# sourceMappingURL=availability.js.map