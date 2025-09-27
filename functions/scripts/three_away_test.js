// three_away_test.js
// Dev script: mark the first patient in today's queue as completed and find the 3-away patient.
// Usage (PowerShell):
// $env:FIRESTORE_EMULATOR_HOST='localhost:8081'; node functions/scripts/three_away_test.js

const admin = require('firebase-admin');

async function main() {
  // Initialize admin SDK for emulator
  admin.initializeApp({ projectId: 'waitfree-9b06e' });
  const db = admin.firestore();

  const clinicId = process.argv[2] || 'clinic-test';
  const doctorId = process.argv[3] || 'doctor-alpha';
  const today = new Date().toISOString().split('T')[0];
  const queueRef = db.collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(today);
  const patientsRef = queueRef.collection('patients');

  console.log('Listing patients...');
  const snaps = await patientsRef.orderBy('tokenNumber').get();
  if (snaps.empty) {
    console.log('No patients found in queue.');
    return;
  }

  const patients = [];
  snaps.forEach(s => patients.push({ id: s.id, ...s.data() }));
  console.log('Patients:', patients.map(p => ({ id: p.id, tokenNumber: p.tokenNumber })));

  // Pick the first patient (lowest tokenNumber)
  const first = patients[0];
  console.log('Completing patient:', first.id, 'tokenNumber:', first.tokenNumber);

  // For local smoke tests, perform non-transactional updates (read-then-write).
  // This avoids emulator transaction lock timeouts while still validating logic.
  try {
    const patientDocRef = patientsRef.doc(first.id);
    const patientSnap = await patientDocRef.get();
    if (!patientSnap.exists) throw new Error('patient doc missing');
    const patientData = patientSnap.data();

    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) throw new Error('queue doc missing');
    const qData = queueSnap.data();

    const newCompleted = (qData.completedPatients || 0) + 1;

    await patientDocRef.update({ status: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await queueRef.update({ completedPatients: newCompleted, currentToken: patientData.tokenNumber, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('Non-transactional update complete.');
  } catch (e) {
    console.error('Error during non-transactional update:', e);
    throw e;
  }

  console.log('Patient marked completed. Finding three-away...');
  const threeAwayToken = first.tokenNumber + 3;
  const qa = await patientsRef.where('tokenNumber', '==', threeAwayToken).limit(1).get();
  if (qa.empty) {
    console.log('No three-away patient found for token', threeAwayToken);
  } else {
    qa.forEach(s => console.log('Three-away patient:', s.id, s.data()));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
