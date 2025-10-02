# Adapty Integration Setup Guide

This guide explains how to set up the secure Adapty integration for AIdrobe Firebase functions.

## 🔒 Security Improvements

### Problem
The previous implementation created new users in Firebase whenever an unknown `adapty_user_id` was provided, allowing malicious users to create infinite free accounts.

### Solution
1. **User Verification**: Before creating a new user, we verify the user exists in Adapty's database
2. **Automatic Quota Updates**: Webhook integration automatically updates user quotas when subscriptions change
3. **Manual Sync**: Users can manually sync their subscription status with Adapty

---

## 📋 Step-by-Step Setup

### Step 1: Get Your Adapty Secret API Key

1. Log in to [Adapty Dashboard](https://app.adapty.io/)
2. Go to **App Settings** → **General** → **API Keys**
3. Find your **Secret Key** (starts with `secret_live_` or `secret_test_`)
4. Copy this key - you'll need it in the next step

⚠️ **Important**: Never commit this key to your repository!

---

### Step 2: Add Adapty Secret Key to Firebase

Run this command in your terminal from the functions directory:

```bash
cd /home/berkay/AIdrobe-Firebase/functions
firebase functions:secrets:set ADAPTY_SECRET_KEY
```

When prompted, paste your Adapty Secret API Key.

To verify it was added successfully:
```bash
firebase functions:secrets:access ADAPTY_SECRET_KEY
```

---

### Step 3: Deploy Updated Functions

Deploy all the updated functions:

```bash
firebase deploy --only functions
```

This will deploy:
- ✅ `analyzeClothingImage` (with Adapty verification)
- ✅ `virtualTryOn` (with Adapty verification)
- ✅ `getOutfitSuggestion` (with Adapty verification)
- ✅ `getUserTier` (existing function)
- ✅ `syncUserWithAdapty` (new manual sync function)
- ✅ `adaptyWebhook` (new webhook endpoint)

---

### Step 4: Configure Adapty Webhook

After deployment, you'll get a webhook URL that looks like:
```
https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/adaptyWebhook
```

1. Go to [Adapty Dashboard](https://app.adapty.io/)
2. Navigate to **App Settings** → **Integrations**
3. Click **Add Integration** or find **Webhooks**
4. Add your Firebase function URL: `https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/adaptyWebhook`
5. Select the following events to send:
   - ✅ `subscription_initial_purchase`
   - ✅ `subscription_renewed`
   - ✅ `subscription_refunded`
   - ✅ `subscription_expired`
   - ✅ `subscription_cancelled`
6. Save the webhook configuration

---

## 🎯 How It Works

### 1. New User Creation (Secure)
```
User sends request → Check Adapty API → User exists? 
  ├─ YES: Create Firebase user with appropriate quotas
  └─ NO: Reject request (prevents fake users)
```

**Code Flow:**
- `checkOrUpdateQuota()` calls `createNewUser()` if user doesn't exist
- `createNewUser()` calls `getAdaptyProfile()` to verify user
- If user doesn't exist in Adapty, throws `permission-denied` error
- If user exists, calculates quotas based on subscription status

### 2. Automatic Quota Updates (via Webhook)
```
User buys premium → Adapty sends webhook → Firebase updates quotas
User cancels → Adapty sends webhook → Firebase reverts to free tier
```

**Supported Events:**
- `subscription_initial_purchase`: User buys premium → Set unlimited quotas
- `subscription_renewed`: Premium renewed → Reset unlimited quotas
- `subscription_expired`: Premium expired → Revert to free tier
- `subscription_cancelled`: User cancelled → Revert to free tier
- `subscription_refunded`: Refund issued → Revert to free tier

### 3. Manual Sync (User-Triggered)
```
User opens app → Call syncUserWithAdapty → Check Adapty → Update Firebase
```

Your iOS/Swift code can call this function:
```swift
// Call this when user opens the app or after purchase
functions.httpsCallable("syncUserWithAdapty").call(["adapty_user_id": userId]) { result, error in
    if let data = result?.data as? [String: Any] {
        let tier = data["tier"] as? String
        let tryOns = data["remainingTryOns"] as? Int
        // Update UI
    }
}
```

---

## 🔑 Quota Management

### Free Tier (freemium)
```javascript
{
  tier: "freemium",
  remainingTryOns: 10,
  remainingSuggestions: 0,
  remainingClothAnalysis: 10
}
```

### Premium Tier
```javascript
{
  tier: "premium",
  remainingTryOns: 100,
  remainingSuggestions: 100,
  remainingClothAnalysis: 100
}
```

### Ultra Premium Tier
```javascript
{
  tier: "ultra_premium",
  remainingTryOns: 500,
  remainingSuggestions: 500,
  remainingClothAnalysis: 500
}
```

**Note**: The tier is automatically determined by the user's active subscription in Adapty. Ultra Premium is identified by product IDs containing "ultra", "unlimited", or "pro".

---

## 🧪 Testing

### Test 1: Verify Fake User Rejection
Try calling a function with a non-existent Adapty user ID:
```javascript
// This should FAIL with "permission-denied"
analyzeClothingImage({
  adapty_user_id: "fake_user_12345",
  image_base_64: "..."
})
```

### Test 2: Test Manual Sync
```javascript
// Call with a real Adapty user ID
syncUserWithAdapty({
  adapty_user_id: "YOUR_REAL_ADAPTY_ID"
})
// Should return current tier and quotas
```

### Test 3: Test Webhook
1. Make a test purchase in Adapty (use Adapty's test mode)
2. Check Firebase Functions logs:
```bash
firebase functions:log --only adaptyWebhook
```
3. Verify user quotas were updated in Firestore

---

## 📊 Monitoring

### Check Function Logs
```bash
# All functions
firebase functions:log

# Specific function
firebase functions:log --only adaptyWebhook

# Real-time logs
firebase functions:log --follow
```

### Important Log Messages
- ✅ `User verified in Adapty, creating Firebase user...` - Successful verification
- ❌ `does not exist in Adapty - blocking creation` - Fake user blocked
- 🔄 `Webhook event type: subscription_renewed` - Automatic update
- 🔄 `User synced successfully with tier: premium` - Manual sync completed

---

## 🚨 Troubleshooting

### Error: "Geçersiz kullanıcı"
**Cause**: User doesn't exist in Adapty
**Solution**: Make sure the user has opened your iOS app and Adapty SDK has initialized

### Webhook Not Receiving Events
**Cause**: Webhook URL not configured correctly in Adapty
**Solution**: 
1. Check the URL in Adapty dashboard matches your deployed function URL
2. Verify the correct events are selected
3. Check Firebase logs for incoming requests

### Quotas Not Updating After Purchase
**Cause**: Webhook might be failing or not configured
**Solution**:
1. Check Adapty webhook logs in their dashboard
2. Call `syncUserWithAdapty` manually from your app after purchase
3. Check Firebase function logs for errors

---

## 🔐 Security Best Practices

1. ✅ **Never expose Secret Keys**: The Adapty secret key is stored in Firebase Secrets
2. ✅ **Verify Users**: All new users are verified against Adapty before creation
3. ✅ **Use HTTPS**: All API calls use secure HTTPS connections
4. ✅ **Validate Input**: All functions validate required parameters
5. ✅ **Error Handling**: Proper error handling prevents information leakage

---

## 🔄 Migration Guide (Existing Users)

If you already have users in Firebase without Adapty verification:

### Option 1: Clean Migration (Recommended)
```javascript
// Run this as a one-time script
async function migrateExistingUsers() {
  const usersSnapshot = await db.collection("users").get();
  
  for (const doc of usersSnapshot.docs) {
    const userId = doc.id;
    
    try {
      // Verify user exists in Adapty
      const adaptyProfile = await getAdaptyProfile(userId);
      
      if (!adaptyProfile) {
        // User doesn't exist in Adapty - mark for review
        await doc.ref.update({ needsVerification: true });
        console.log(`User ${userId} needs verification`);
      } else {
        // Sync quotas with Adapty
        const quotas = calculateQuotaFromAdapty(adaptyProfile);
        await doc.ref.update({
          ...quotas,
          verified: true,
          lastSyncedWithAdapty: new Date()
        });
        console.log(`User ${userId} verified and updated`);
      }
    } catch (error) {
      console.error(`Error migrating user ${userId}:`, error);
    }
  }
}
```

### Option 2: Gradual Migration
- Keep existing users as-is
- New users will be verified automatically
- Existing users will sync on next app open (when you call `syncUserWithAdapty`)

---

## 📱 iOS App Integration

Add this to your app to handle subscription updates:

```swift
// After successful purchase or on app launch
func syncWithBackend() {
    let functions = Functions.functions()
    
    functions.httpsCallable("syncUserWithAdapty").call([
        "adapty_user_id": Adapty.profileId
    ]) { result, error in
        if let error = error as NSError? {
            print("Sync error: \(error.localizedDescription)")
            return
        }
        
        if let data = result?.data as? [String: Any] {
            // Update local state
            let tier = data["tier"] as? String ?? "freemium"
            let tryOns = data["remainingTryOns"] as? Int ?? 0
            let suggestions = data["remainingSuggestions"] as? Int ?? 0
            let analysis = data["remainingClothAnalysis"] as? Int ?? 0
            
            // Update UI accordingly
            self.updateQuotaDisplay(
                tier: tier,
                tryOns: tryOns,
                suggestions: suggestions,
                analysis: analysis
            )
        }
    }
}
```

---

## ✅ Verification Checklist

- [ ] Adapty Secret Key added to Firebase Secrets
- [ ] All functions deployed successfully
- [ ] Webhook URL configured in Adapty Dashboard
- [ ] Webhook events selected correctly
- [ ] Tested with fake user ID (should reject)
- [ ] Tested with real user ID (should work)
- [ ] Tested purchase flow (quotas update)
- [ ] Tested cancellation flow (reverts to free)
- [ ] iOS app calls `syncUserWithAdapty` on launch
- [ ] Logs are showing expected behavior

---

## 📞 Support

If you encounter issues:
1. Check Firebase Functions logs
2. Check Adapty Dashboard webhook logs
3. Verify all secrets are set correctly
4. Ensure iOS app is using latest Adapty SDK

---

## 📝 Summary

**What Changed:**
1. ✅ Added Adapty user verification (prevents fake users)
2. ✅ Added automatic webhook for subscription updates
3. ✅ Added manual sync function for user-triggered updates
4. ✅ Quotas now calculated based on real Adapty subscription status

**What You Need To Do:**
1. Add Adapty Secret Key to Firebase
2. Deploy functions
3. Configure webhook in Adapty Dashboard
4. (Optional) Call `syncUserWithAdapty` from your iOS app on launch

**Result:**
- 🔒 Secure: No more fake user creation
- 🔄 Automatic: Subscriptions sync automatically
- 📊 Accurate: Quotas always match Adapty subscription status
