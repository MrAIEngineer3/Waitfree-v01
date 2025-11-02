const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'waitfree-9b06e';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
}

admin.initializeApp({ projectId });

const db = admin.firestore();

async function main() {
  const queuePath = 'clinics/test/doctors/test/queues/2025-11-02';
  const queueDoc = await db.doc(queuePath).get();
  console.log('Queue:', queuePath);
  if (!queueDoc.exists) {
    console.log('  (missing)');
    return;
  }
  console.log(JSON.stringify(queueDoc.data(), null, 2));

  const patientsSnap = await db.collection(`${queuePath}/patients`).orderBy('tokenNumber').get();
  console.log('\nPatients:');
  patientsSnap.forEach((doc) => {
    console.log(`- ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
  });
}

main().catch((err) => {
  console.error('Failed to inspect Firestore state', err);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => process.exit(), 0);
});
