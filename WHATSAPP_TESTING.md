# 🧪 Twilio WhatsApp Testing Guide

**Last Updated:** November 1, 2025

## 📋 Testing Modes

### 1. **Debug Mode (No Twilio credentials)**
- ✅ **Works immediately** with Firebase emulators
- ✅ Logs all notifications to `debugNotifications` collection
- ✅ Tests phone number formatting and message creation
- ✅ No actual WhatsApp messages sent

### 2. **Twilio Sandbox Mode (Free testing)**
- ✅ **Real WhatsApp messages** to your test phone
- ✅ Uses Twilio's free sandbox environment
- ✅ No template approval needed
- ⚠️ Requires Twilio account setup

### 3. **Production Mode (Business WhatsApp)**
- ✅ **Real WhatsApp Business** messages
- ⚠️ Requires WhatsApp Business account and approved templates
- ⚠️ Costs money per message

## 🚀 Quick Start Testing

### Step 1: Test Debug Mode (Immediate)
```bash
# In functions folder
npm run build
node lib/scripts/testWhatsApp.js
```

### Step 2: Set up Twilio Sandbox (5 minutes)
1. Create free Twilio account: https://console.twilio.com
2. Go to Programmable Messaging → Try WhatsApp
3. Join sandbox by sending code to Twilio number
4. Update `.env.local` with your credentials:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TEST_PHONE_NUMBER=+919876543210  # Your WhatsApp number
```

### Step 3: Test Real WhatsApp
```bash
npm run build
node lib/scripts/testWhatsApp.js
```

## 📱 Integration with Your App

### Test with Patient Flow
```bash
# Start emulators
firebase emulators:start

# In another terminal, run patient simulation
cd functions
node lib/scripts/phase2Test.js
```

This will:
1. Create test patients
2. Simulate queue progression  
3. Trigger actual WhatsApp notifications
4. Log everything to debugNotifications

## 🔍 Monitoring & Debugging

### View Notifications
- **Firebase Emulator UI**: http://localhost:4000
- **Firestore** → `debugNotifications` collection
- **Function Logs**: Shows Twilio success/failures

### Check Phone Number Formatting
```javascript
// Example: Indian number formatting
"9876543210" → "+919876543210"
"+919876543210" → "+919876543210"
"09876543210" → "+919876543210"
```

## 📝 Message Examples

Your app will send these WhatsApp messages:

**Queue Joined:**
> Hello John Doe! You've successfully joined the queue with token #42. We'll notify you when it's your turn.

**Position Updates:**
> Hi John Doe, you're 3rd in line (Token #42). Estimated wait: 15 minutes.

**Your Turn:**
> 🔔 John Doe, it's YOUR TURN! Please proceed to the clinic immediately. Token #42

## 🛡️ Safety Features

- ✅ **Duplicate Prevention**: Won't spam patients
- ✅ **Graceful Fallback**: If Twilio fails, logs to database
- ✅ **Phone Validation**: Automatically formats numbers
- ✅ **Error Handling**: Comprehensive logging and error recovery

## ⚡ Next Steps

1. **Test Debug Mode** (works now)
2. **Get Twilio Sandbox** (5 minutes) 
3. **Test Real WhatsApp** (works immediately)
4. **Deploy and Test Production** (when ready)

Your notification system is production-ready! 🚀
