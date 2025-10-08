/**
 * Test script for Twilio WhatsApp integration
 * Run with: node lib/scripts/testWhatsApp.js
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Set up emulator environment
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
  console.log('[Test] FIRESTORE_EMULATOR_HOST set to localhost:8081');
}

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9098';
  console.log('[Test] FIREBASE_AUTH_EMULATOR_HOST set to localhost:9098');
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-test' });
}

// Import the notifier function
const { sendNotification } = require('../notifier');

async function testWhatsAppIntegration() {
  console.log('\n🧪 Testing Twilio WhatsApp Integration\n');
  
  // Check environment variables
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
  const testPhone = process.env.TEST_PHONE_NUMBER;
  
  console.log('Environment Check:');
  console.log(`✅ TWILIO_ACCOUNT_SID: ${twilioSid ? 'Set' : '❌ Missing'}`);
  console.log(`✅ TWILIO_AUTH_TOKEN: ${twilioToken ? 'Set' : '❌ Missing'}`);
  console.log(`✅ TWILIO_WHATSAPP_FROM: ${twilioFrom || '❌ Missing'}`);
  console.log(`✅ TEST_PHONE_NUMBER: ${testPhone || '❌ Missing'}\n`);
  
  if (!testPhone) {
    console.log('❌ Please set TEST_PHONE_NUMBER in .env.local to test actual WhatsApp sending');
    console.log('📝 Testing will only log to debugNotifications collection\n');
  }
  
  // Test different notification types
  const testNotifications = [
    {
      type: 'joined',
      payload: { name: 'John Doe', tokenNumber: 42 }
    },
    {
      type: 'pos3',
      payload: { name: 'John Doe', tokenNumber: 42, etaMinutes: 15, patientsAhead: 3 }
    },
    {
      type: 'pos1',
      payload: { name: 'John Doe', tokenNumber: 42, etaMinutes: 5, patientsAhead: 1 }
    },
    {
      type: 'now',
      payload: { name: 'John Doe', tokenNumber: 42 }
    }
  ];
  
  for (const notification of testNotifications) {
    console.log(`📤 Testing ${notification.type} notification...`);
    
    try {
      const result = await sendNotification({
        to: testPhone || '+919999999999', // Use test phone or dummy number
        type: notification.type,
        payload: notification.payload
      });
      
      console.log(`✅ ${notification.type}: ${result.ok ? 'Success' : 'Failed'}`);
      if (result.provider) console.log(`   Provider: ${result.provider}`);
      if (result.sid) console.log(`   Twilio SID: ${result.sid}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      
    } catch (error: any) {
      console.log(`❌ ${notification.type}: Failed with error`, error.message);
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Show debug notifications
  try {
    console.log('📋 Recent debug notifications:');
    const db = admin.firestore();
    const recent = await db.collection('debugNotifications')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    recent.forEach((doc: any, index: number) => {
      const data = doc.data();
      console.log(`${index + 1}. ${data.type} → ${data.formattedPhone || data.to}`);
      console.log(`   Message: ${data.message}`);
      console.log(`   Twilio: ${data.twilioAttempted ? 'Attempted' : 'Debug only'}`);
      console.log('');
    });
    
  } catch (error: any) {
    console.log('❌ Failed to fetch debug notifications:', error.message);
  }
  
  console.log('🎉 WhatsApp integration test completed!');
  console.log('\n📖 Next steps:');
  console.log('1. Check your WhatsApp for messages (if credentials configured)');
  console.log('2. View debugNotifications in Firestore emulator UI');
  console.log('3. Check function logs for detailed information');
}

// Run the test
testWhatsAppIntegration()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
