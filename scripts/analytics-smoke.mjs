#!/usr/bin/env node

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const hasCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

if (!usingEmulator && !hasCredentials) {
  console.error('⚠️  Set FIRESTORE_EMULATOR_HOST or GOOGLE_APPLICATION_CREDENTIALS before running this script.');
  process.exit(1);
}

initializeApp({
  credential: hasCredentials ? applicationDefault() : undefined,
});

async function main() {
  const db = getFirestore();
  const docRef = db.collection('analyticsEvents').doc();
  await docRef.set({
    eventName: 'smoke_test_event',
    params: {
      source: 'scripts/analytics-smoke.mjs',
      timestampMs: Date.now(),
      emulator: usingEmulator,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await db
    .collection('analyticsEvents')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  console.log(`
✅ analyticsEvents collection check complete (${snapshot.size} docs sampled):
`);

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`${index + 1}. ${doc.id} -> ${JSON.stringify(data, null, 2)}`);
  });

  console.log('\nView these entries in the Firebase console Analytics DebugView or Firestore viewer to confirm ingestion.');
}

main().catch((error) => {
  console.error('Analytics smoke test failed:', error);
  process.exit(1);
});
