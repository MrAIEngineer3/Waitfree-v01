/**
 * Phase 1 local test harness.
 * Usage (PowerShell):
 *   cd functions
 *   npm run build
 *   node lib/scripts/phase1Test.js
 * Ensure emulators are running with PHASE1_NOTIFICATIONS=1 before executing.
 */
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

// Initialize only if not already
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-test' });
}

interface JoinResult { patientId: string; queueId: string; clinicId: string; doctorId: string; }

const host = process.env.FUNCTIONS_HOST || 'http://localhost:5002';
const region = 'asia-south1';
// Callable endpoint format: http://localhost:5002/{project}/{region}/{functionName}
const projectId = process.env.GCLOUD_PROJECT || 'demo-test';

async function callable(name: string, data: any) {
  const url = `${host}/${projectId}/${region}/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${JSON.stringify(json)}`);
  if (json.error) throw new Error(`${name} error wrapper: ${JSON.stringify(json)}`);
  return json.result || json; // emulator sometimes wraps in {result}
}

async function run() {
  console.log('Phase1 test start');
  const clinicName = 'Test Clinic';
  const doctorName = 'Test Doctor';
  const specialty = 'General';
  const bootstrap = await callable('bootstrapClinicAccount', { clinicName, doctorName, specialty });
  console.log('Bootstrap:', bootstrap);
  const { clinicId, doctorId, queueId } = bootstrap;

  const patients: JoinResult[] = [] as any;
  for (const p of ['Alice', 'Bob']) {
    const jr = await callable('joinQueue', { clinicId, doctorId, patientData: { name: p, age: 30, phone: '+1000' + p[0] } });
    console.log('Joined:', jr);
    patients.push(jr as any);
  }

  // Promote first patient to in-progress
  const first = patients[0];
  await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'in-progress' });
  console.log('Set in-progress');
  // Wait 2 seconds to simulate service time
  await new Promise(r => setTimeout(r, 2000));
  await callable('updatePatientStatus', { clinicId, doctorId, queueId, patientId: first.patientId, newStatus: 'completed' });
  console.log('Completed first patient');

  // Fetch patient doc to verify service fields
  const doc = await admin.firestore()
    .collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId)
    .collection('patients').doc(first.patientId).get();
  console.log('Patient service block:', doc.data()?.service);

  // Fetch queue metrics
  const qDoc = await admin.firestore()
    .collection('clinics').doc(clinicId)
    .collection('doctors').doc(doctorId)
    .collection('queues').doc(queueId).get();
  console.log('Queue metrics:', qDoc.data()?.metrics);

  // List debug notifications
  const notifs = await admin.firestore().collection('debugNotifications').orderBy('createdAt', 'desc').limit(10).get();
  console.log('Recent notifications:');
  notifs.forEach(n => console.log(n.id, n.data()));
  console.log('Phase1 test done');
}

run().catch(e => { console.error(e); process.exit(1); });
