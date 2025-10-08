const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp({
    projectId: 'demo-project'
  });
}

const db = getFirestore();
db.settings({ host: 'localhost:8081', ssl: false });

async function checkRecentNotifications() {
  try {
    console.log('Checking recent notifications from debug-notifications collection...\n');
    
    const snapshot = await db.collection('debug-notifications')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    
    if (snapshot.empty) {
      console.log('No notifications found in debug-notifications collection');
      return;
    }
    
    console.log(`Found ${snapshot.size} recent notifications:\n`);
    
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. Type: ${data.type || 'unknown'}`);
      console.log(`   Phone: ${data.phoneNumber || 'unknown'}`);
      console.log(`   Status: ${data.status || 'unknown'}`);
      console.log(`   Timestamp: ${data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : 'unknown'}`);
      
      if (data.error) {
        console.log(`   Error: ${data.error}`);
      }
      
      if (data.twilioSid) {
        console.log(`   Twilio SID: ${data.twilioSid}`);
      }
      
      if (data.message) {
        console.log(`   Message: ${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Error checking notifications:', error.message);
  }
}

checkRecentNotifications();
