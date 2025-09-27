// Temporary script to set custom claims in Auth emulator for local testing
const admin = require('firebase-admin');

// Initialize with default creds; when running against the emulator admin SDK connects fine.
admin.initializeApp({
  projectId: 'waitfree-9b06e',
});

async function main() {
  const uid = process.argv[2];
  const isStaff = process.argv[3] === 'true';
  if (!uid) {
    console.error('Usage: node setStaffClaimLocal.js <uid> <true|false>');
    process.exit(1);
  }

  try {
    await admin.auth().setCustomUserClaims(uid, { staff: isStaff });
    console.log('set custom claims for', uid, { staff: isStaff });
    process.exit(0);
  } catch (err) {
    console.error('error setting claims', err);
    process.exit(2);
  }
}

main();
