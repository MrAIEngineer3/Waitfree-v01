const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, connectFirestoreEmulator } = require('firebase/firestore');
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth');

// Initialize Firebase app for testing with emulator config
const app = initializeApp({
  projectId: 'demo-test',
  apiKey: 'demo-key',
  authDomain: 'demo-test.firebaseapp.com'
});

const db = getFirestore(app);
const auth = getAuth(app);

// Connect to emulators
connectFirestoreEmulator(db, 'localhost', 8080);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

async function testRules() {
  console.log('🔥 Testing Firestore Security Rules\n');

  // Test 1: Public read access to clinic (should ALLOW)
  console.log('Test 1: Public read access to clinic');
  try {
    const clinicRef = doc(db, 'clinics', 'test-clinic');
    await getDoc(clinicRef);
    console.log('✅ PASS: Public can read clinic documents\n');
  } catch (error) {
    console.log('❌ FAIL: Public cannot read clinic documents');
    console.log('Error:', error.message, '\n');
  }

  // Test 2: Public write access to clinic (should DENY)
  console.log('Test 2: Public write access to clinic');
  try {
    const clinicRef = doc(db, 'clinics', 'test-clinic');
    await setDoc(clinicRef, { name: 'Test Clinic' });
    console.log('❌ FAIL: Public should not be able to write clinic documents\n');
  } catch (error) {
    console.log('✅ PASS: Public correctly denied write access to clinic');
    console.log('Error:', error.code, '\n');
  }

  // Test 3: Public read access to doctor (should ALLOW)
  console.log('Test 3: Public read access to doctor');
  try {
    const doctorRef = doc(db, 'clinics', 'test-clinic', 'doctors', 'test-doctor');
    await getDoc(doctorRef);
    console.log('✅ PASS: Public can read doctor documents\n');
  } catch (error) {
    console.log('❌ FAIL: Public cannot read doctor documents');
    console.log('Error:', error.message, '\n');
  }

  // Test 4: Public read access to specific queue (should ALLOW)
  console.log('Test 4: Public read access to specific queue');
  try {
    const queueRef = doc(db, 'clinics', 'test-clinic', 'doctors', 'test-doctor', 'queues', 'test-queue');
    await getDoc(queueRef);
    console.log('✅ PASS: Public can read specific queue documents\n');
  } catch (error) {
    console.log('❌ FAIL: Public cannot read specific queue documents');
    console.log('Error:', error.message, '\n');
  }

  // Test 5: Authenticated user write access (should ALLOW)
  console.log('Test 5: Authenticated user write access');
  try {
    // Sign in anonymously to simulate authentication
    await signInAnonymously(auth);
    console.log('👤 Signed in as authenticated user');
    
    const clinicRef = doc(db, 'clinics', 'auth-test-clinic');
    await setDoc(clinicRef, { name: 'Authenticated Test Clinic' });
    console.log('✅ PASS: Authenticated user can write clinic documents\n');
  } catch (error) {
    console.log('❌ FAIL: Authenticated user cannot write clinic documents');
    console.log('Error:', error.message, '\n');
  }

  console.log('🎉 Rule testing completed!');
}

// Run the tests
testRules().catch(console.error);
