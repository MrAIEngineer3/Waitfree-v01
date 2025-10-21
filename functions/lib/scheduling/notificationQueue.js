"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldEnqueueForStatus = exports.dispatchDoctorOnlineNotifications = exports.enqueueDoctorOnlineNotification = void 0;
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const notifier_1 = require("../notifier");
const db = firebaseAdmin_1.admin.firestore();
const notificationsCollection = (clinicId, doctorId) => db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).collection('availabilityNotifications');
const formatPhone = (raw) => {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/[^+\d]/g, '');
    if (!cleaned.startsWith('+')) {
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.slice(1);
        }
        cleaned = `+91${cleaned}`;
    }
    return cleaned;
};
const computeContactKey = (channel, phone) => {
    const hash = (0, crypto_1.createHash)('sha256');
    hash.update(`${channel}::${phone}`);
    return hash.digest('hex');
};
const DEFAULT_CHANNEL = 'whatsapp';
const enqueueDoctorOnlineNotification = async (input) => {
    const clinicId = input.clinicId.trim();
    const doctorId = input.doctorId.trim();
    if (!clinicId || !doctorId) {
        throw new Error('clinicId and doctorId are required');
    }
    if (!input.phone || typeof input.phone !== 'string') {
        throw new Error('phone is required');
    }
    const channel = DEFAULT_CHANNEL;
    const phone = formatPhone(input.phone);
    const contactKey = computeContactKey(channel, phone);
    const colRef = notificationsCollection(clinicId, doctorId);
    const docRef = colRef.doc(contactKey);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const now = firestore_1.FieldValue.serverTimestamp();
        if (snap.exists) {
            const data = snap.data() || {};
            const currentStatus = data.status ?? 'pending';
            tx.set(docRef, {
                patientName: input.patientName ?? data.patientName ?? null,
                doctorName: input.doctorName ?? data.doctorName ?? null,
                status: 'pending',
                updatedAt: now,
                lastRequestedAt: now,
                requestCount: firestore_1.FieldValue.increment(1)
            }, { merge: true });
            return { alreadyQueued: currentStatus === 'pending', status: 'pending' };
        }
        tx.set(docRef, {
            clinicId,
            doctorId,
            contactKey,
            channel,
            phone,
            patientName: input.patientName ?? null,
            doctorName: input.doctorName ?? null,
            status: 'pending',
            source: input.source ?? 'patient-app',
            createdAt: now,
            updatedAt: now,
            requestCount: 1,
            lastRequestedAt: now
        });
        return { alreadyQueued: false, status: 'pending' };
    });
    return result;
};
exports.enqueueDoctorOnlineNotification = enqueueDoctorOnlineNotification;
const MAX_NOTIFICATIONS_PER_DISPATCH = 50;
const dispatchDoctorOnlineNotifications = async (input) => {
    const { clinicId, doctorId } = input;
    const colRef = notificationsCollection(clinicId, doctorId);
    const query = await colRef
        .where('status', '==', 'pending')
        .orderBy('lastRequestedAt', 'asc')
        .limit(MAX_NOTIFICATIONS_PER_DISPATCH)
        .get();
    if (query.empty) {
        return { notified: 0, attempted: 0 };
    }
    let doctorName = input.doctorName || null;
    if (!doctorName) {
        const doctorSnap = await db.collection('clinics').doc(clinicId).collection('doctors').doc(doctorId).get();
        doctorName = doctorSnap.data()?.name || 'Doctor';
    }
    let notified = 0;
    let attempted = 0;
    for (const doc of query.docs) {
        attempted += 1;
        const data = doc.data();
        const patientName = data.patientName || 'Patient';
        const phone = data.phone;
        const docDoctorName = data.doctorName;
        const messageDoctorName = docDoctorName || doctorName || 'Doctor';
        const result = await (0, notifier_1.sendNotification)({
            to: phone,
            type: 'doctor-online',
            payload: {
                name: patientName,
                clinicId,
                doctorId,
                doctorName: messageDoctorName
            }
        });
        const update = {
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            lastAttemptAt: firestore_1.FieldValue.serverTimestamp(),
            attemptCount: firestore_1.FieldValue.increment(1)
        };
        if (result.ok) {
            update.status = 'sent';
            update.notifiedAt = firestore_1.FieldValue.serverTimestamp();
            notified += 1;
        }
        else {
            update.status = 'pending';
            update.lastError = result.error ?? 'unknown-error';
        }
        await doc.ref.set(update, { merge: true });
    }
    return { notified, attempted };
};
exports.dispatchDoctorOnlineNotifications = dispatchDoctorOnlineNotifications;
const shouldEnqueueForStatus = (status, _options) => {
    if (!status || status.online === false) {
        return true;
    }
    return false;
};
exports.shouldEnqueueForStatus = shouldEnqueueForStatus;
//# sourceMappingURL=notificationQueue.js.map