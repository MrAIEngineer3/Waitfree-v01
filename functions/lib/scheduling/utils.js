"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureValidTimeZone = exports.filterValidDays = exports.isValidDayKey = exports.normalizeWeekDefinition = exports.sortAndValidateDayBlocks = exports.parseTimeBlock = exports.toMinutes = exports.parseTime = exports.TIME_BLOCK_REGEX = void 0;
const luxon_1 = require("luxon");
exports.TIME_BLOCK_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const normalizeTimePart = (value) => value.toString().padStart(2, '0');
const formatMinutesAsTime = (minutes) => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${normalizeTimePart(hour)}:${normalizeTimePart(minute)}`;
};
const parseTime = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    const match = exports.TIME_BLOCK_REGEX.exec(trimmed);
    if (!match) {
        return null;
    }
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return null;
    }
    return { hour, minute };
};
exports.parseTime = parseTime;
const toMinutes = (time) => time.hour * 60 + time.minute;
exports.toMinutes = toMinutes;
const parseTimeBlock = (block) => {
    const start = (0, exports.parseTime)(block.start);
    const end = (0, exports.parseTime)(block.end);
    if (!start || !end) {
        return null;
    }
    const startMinutes = (0, exports.toMinutes)(start);
    const endMinutes = (0, exports.toMinutes)(end);
    if (endMinutes <= startMinutes) {
        return null;
    }
    return {
        startMinutes,
        endMinutes,
        block: {
            start: formatMinutesAsTime(startMinutes),
            end: formatMinutesAsTime(endMinutes),
            label: block.label ?? null
        }
    };
};
exports.parseTimeBlock = parseTimeBlock;
const sortAndValidateDayBlocks = (blocks) => {
    const parsed = blocks
        .map((block) => (0, exports.parseTimeBlock)(block))
        .filter((value) => value !== null)
        .sort((a, b) => a.startMinutes - b.startMinutes);
    if (parsed.length !== blocks.length) {
        return null;
    }
    for (let i = 1; i < parsed.length; i += 1) {
        if (parsed[i].startMinutes < parsed[i - 1].endMinutes) {
            return null;
        }
    }
    return parsed;
};
exports.sortAndValidateDayBlocks = sortAndValidateDayBlocks;
const normalizeWeekDefinition = (week) => {
    const normalized = {};
    for (const entry of Object.entries(week)) {
        const key = entry[0];
        const blocks = entry[1];
        if (!Array.isArray(blocks)) {
            return null;
        }
        const parsed = (0, exports.sortAndValidateDayBlocks)(blocks);
        if (!parsed) {
            return null;
        }
        normalized[key] = parsed.map((range) => range.block);
    }
    return normalized;
};
exports.normalizeWeekDefinition = normalizeWeekDefinition;
const isValidDayKey = (key) => {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(key);
};
exports.isValidDayKey = isValidDayKey;
const filterValidDays = (week) => {
    const result = {};
    for (const [key, value] of Object.entries(week)) {
        if ((0, exports.isValidDayKey)(key) && Array.isArray(value)) {
            result[key] = value;
        }
    }
    return result;
};
exports.filterValidDays = filterValidDays;
const ensureValidTimeZone = (timeZone) => {
    if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
        return false;
    }
    const probe = luxon_1.DateTime.now().setZone(timeZone, { keepLocalTime: false });
    return probe.isValid;
};
exports.ensureValidTimeZone = ensureValidTimeZone;
//# sourceMappingURL=utils.js.map