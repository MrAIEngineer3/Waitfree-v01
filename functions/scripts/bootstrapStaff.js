
// This script grants staff privileges to a user when using the Firebase Emulator.
// Usage: node functions/scripts/bootstrapStaff.js <email> <clinicId>

const admin = require('firebase-admin');

// When this script is run in an environment where the Firebase Emulators are running,
// the Admin SDK will automatically connect to them. No service account key is needed.

const email = process.argv[2];
const clinicId = process.argv[3];

if (!email || !clinicId) {
  console.error('Usage: node functions/scripts/bootstrapStaff.js <email> <clinicId>');
  process.exit(1);
}

// Initialize the app without credentials. It will use the emulator hosts
// from the environment variables if they are running.
admin.initializeApp({
  projectId: 'waitfree-9b06e', // Use your project ID
});

(async () => {
  try {
    console.log(`Fetching user with email: ${email} from the Auth Emulator...`);
    const user = await admin.auth().getUserByEmail(email);

    console.log(`Found user: ${user.uid}. Setting custom claims...`);
    // Set the custom claim. The second argument forces a token refresh.
    await admin.auth().setCustomUserClaims(user.uid, { staff: true, clinicId: clinicId });

    console.log(`\n✅ Successfully set custom claims for ${email}.`);
    console.log('   The user must sign out and sign back in for the changes to take effect.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error bootstrapping staff user:', error.message);
    console.error('   Please ensure your Firebase emulators (Auth and Functions) are running.');
    process.exit(1);
  }
})();
