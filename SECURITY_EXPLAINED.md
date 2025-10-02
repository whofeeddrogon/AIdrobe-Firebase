# Understanding Adapty Integration & Security

## 🤔 Your Question: "Is my thinking correct?"

**YES! Your thinking is actually BETTER than the initial implementation.**

### Your Approach (Recommended):
```
User makes request
  ↓
Check Firebase database
  ↓
User exists? → ✅ Trust them, proceed
User doesn't exist? → 🔍 Check Adapty first, then create
```

### Why This Is Better:
1. ✅ **Fewer API Calls**: Only check Adapty for new users
2. ✅ **Faster**: Existing users don't need verification
3. ✅ **Cheaper**: Reduces Adapty API usage costs
4. ✅ **Still Secure**: New users are verified before creation

### Current Implementation:
The code I wrote already follows your approach! Look at the `checkOrUpdateQuota` function:

```javascript
async function checkOrUpdateQuota(userId, quotaType) {
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    // Only check Adapty for NEW users
    userData = await createNewUser(userId);  // ← This checks Adapty
  } else {
    // Existing users are trusted
    userData = userDoc.data();
  }
  // ... rest of quota logic
}
```

So yes, your thinking is correct and that's exactly what we implemented! 🎉

---

## 🔑 What is Adapty Secret Key?

### Simple Explanation:
It's like a **password** that lets your Firebase backend talk to Adapty's API securely.

### How It Works:
```
Your Firebase Function
      ↓ (uses secret key)
   Adapty API
      ↓ (verifies key)
   Returns user data
```

### Where To Get It:

1. **Login to Adapty Dashboard**
   - Go to: https://app.adapty.io/

2. **Navigate to API Keys**
   - Click: **App Settings** → **General** → **API Keys**

3. **Find Secret Key**
   - Look for: **Secret Key**
   - Format: `secret_live_xxxxxxxxxxxxx` (production)
   - Or: `secret_test_xxxxxxxxxxxxx` (testing)

4. **Copy & Store in Firebase**
   ```bash
   cd functions
   firebase functions:secrets:set ADAPTY_SECRET_KEY
   # Paste your key when prompted
   ```

### ⚠️ Security Warning:
- ❌ **NEVER** commit this key to GitHub
- ❌ **NEVER** put it in your code directly
- ✅ **ALWAYS** use Firebase Secrets (as we did)
- ✅ **ALWAYS** keep it private

---

## 📊 Updated Quota System

### Tier Structure:

| Tier | Try-Ons | Suggestions | Cloth Analysis |
|------|---------|-------------|----------------|
| **Freemium** | 10 | 0 | 10 |
| **Premium** | 100 | 100 | 100 |
| **Ultra Premium** | 500 | 500 | 500 |

### How Tiers Are Determined:

The `calculateQuotaFromAdapty()` function checks the user's active subscription:

```javascript
// 1. No active subscription → Freemium
if (no active subscription) {
  tier = "freemium"
  quotas = { tryOns: 10, suggestions: 0, analysis: 10 }
}

// 2. Has subscription with "ultra" in product_id → Ultra Premium
if (product_id includes "ultra" or "unlimited" or "pro") {
  tier = "ultra_premium"
  quotas = { tryOns: 500, suggestions: 500, analysis: 500 }
}

// 3. Has any other active subscription → Premium
else {
  tier = "premium"
  quotas = { tryOns: 100, suggestions: 100, analysis: 100 }
}
```

### Important: Configure Your Product IDs

You need to set up your Adapty product IDs to match this logic:

**In Adapty Dashboard:**
1. Go to **Products**
2. Create your subscription products:
   - Regular Premium: `com.yourapp.premium.monthly`
   - Ultra Premium: `com.yourapp.ultra.monthly` ← Must include "ultra"

**Or update the code** to match YOUR product IDs:

```javascript
// In calculateQuotaFromAdapty function, line ~75
if (productId.includes("ultra") || productId.includes("unlimited") || productId.includes("pro")) {
  // Change these keywords to match YOUR product IDs
  tier = "ultra_premium";
  // ...
}
```

---

## 🔒 Security Flow Diagram

### When New User Makes First Request:

```
┌─────────────────────────────────────────────────────────┐
│ User calls analyzeClothingImage with adapty_user_id    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ checkOrUpdateQuota(userId, "remainingClothAnalysis")   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Check Firebase: Does user exist in our database?       │
└─────────────────────────────────────────────────────────┘
                         ↓
                    ┌────┴────┐
                    │         │
              YES ──┤         ├── NO
                    │         │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         ↓                               ↓
  ✅ User Exists                   🔍 User Doesn't Exist
  Trust them!                      Need to verify!
         ↓                               ↓
  Get quota from                   Call createNewUser()
  Firebase                               ↓
         ↓                         Check Adapty API
  Decrement quota                        ↓
         ↓                         ┌─────┴─────┐
  Proceed with                     │           │
  request                    EXISTS │           │ NOT FOUND
         ↓                          │           │
  ✅ Success                        └─────┬─────┘
                                          │
                            ┌─────────────┼─────────────┐
                            ↓                           ↓
                      ✅ Verified!               ❌ BLOCKED!
                      Create Firebase user       Throw error
                      with appropriate tier      "Invalid user"
                            ↓                           ↓
                      Decrement quota            Request fails
                            ↓                     User can't abuse
                      Proceed with request              ↓
                            ↓                     🛡️ Security win!
                      ✅ Success
```

### Why This Prevents Abuse:

**Attacker tries to create fake users:**
```
Attacker → Fake adapty_user_id: "fake123"
           ↓
Firebase → Check Adapty API
           ↓
Adapty → "User not found" (404)
           ↓
Firebase → ❌ Reject request
           ↓
Attacker → Can't create fake accounts! 🛡️
```

**Legitimate user:**
```
Real User → Real adapty_user_id from Adapty SDK
            ↓
Firebase → Check Adapty API
            ↓
Adapty → ✅ "User found, tier: premium"
            ↓
Firebase → ✅ Create user with 100 quotas
            ↓
Real User → Can use features! 🎉
```

---

## 🎯 Complete Setup Checklist

### 1. Get Adapty Secret Key
- [ ] Login to https://app.adapty.io/
- [ ] Go to App Settings → General → API Keys
- [ ] Copy your Secret Key

### 2. Add Secret to Firebase
```bash
cd /home/berkay/AIdrobe-Firebase/functions
firebase functions:secrets:set ADAPTY_SECRET_KEY
# Paste your secret key when prompted
```

### 3. Verify Secrets
```bash
# Check both secrets are set
firebase functions:secrets:access ADAPTY_SECRET_KEY
firebase functions:secrets:access FAL_KEY
```

### 4. Configure Product IDs in Adapty
- [ ] Create products in Adapty Dashboard
- [ ] Premium products: any name works
- [ ] Ultra Premium: must include "ultra", "unlimited", or "pro" in product_id
- [ ] Or update code to match your naming scheme

### 5. Deploy Functions
```bash
firebase deploy --only functions
```

### 6. Get Webhook URL
After deployment, you'll see:
```
✔ functions[adaptyWebhook(us-central1)]: Successful create operation.
Function URL: https://us-central1-YOUR-PROJECT.cloudfunctions.net/adaptyWebhook
```

### 7. Configure Webhook in Adapty
- [ ] Go to Adapty Dashboard → Integrations
- [ ] Add webhook URL from step 6
- [ ] Select events:
  - subscription_initial_purchase
  - subscription_renewed
  - subscription_refunded
  - subscription_expired
  - subscription_cancelled

### 8. Test the Integration
```bash
# Watch logs
firebase functions:log --follow

# In another terminal, test your iOS app
# Try to use a feature and check logs
```

---

## 🧪 Testing Scenarios

### Test 1: Fake User (Should Fail)
```javascript
// Try calling from your iOS app with a fake ID
analyzeClothingImage({
  adapty_user_id: "fake_user_12345",
  image_base_64: "..."
})

// Expected Result: ❌
// Error: "Geçersiz kullanıcı. Lütfen uygulamaya giriş yaptığınızdan emin olun."
// Firebase logs: "User fake_user_12345 does not exist in Adapty - blocking creation"
```

### Test 2: Real Freemium User
```javascript
// Use real Adapty user ID from your app
analyzeClothingImage({
  adapty_user_id: "real_user_from_adapty",
  image_base_64: "..."
})

// Expected Result: ✅
// Success, user created with:
// - tier: "freemium"
// - remainingClothAnalysis: 9 (decremented from 10)
```

### Test 3: Premium Purchase
```swift
// In your iOS app
Adapty.makePurchase(product: premiumProduct) { result in
    // After successful purchase
    syncUserWithAdapty(userId: userId) { tier in
        print(tier.tier) // "premium"
        print(tier.remainingTryOns) // 100
    }
}

// Expected Result: ✅
// User upgraded to premium tier
// All quotas set to 100
```

### Test 4: Ultra Premium Purchase
```swift
// Purchase ultra premium product
Adapty.makePurchase(product: ultraProduct) { result in
    syncUserWithAdapty(userId: userId) { tier in
        print(tier.tier) // "ultra_premium"
        print(tier.remainingTryOns) // 500
    }
}

// Expected Result: ✅
// User upgraded to ultra_premium tier
// All quotas set to 500
```

---

## 🔄 Quota Refresh Strategy

### Option 1: Monthly Reset (Recommended)
Add a Cloud Scheduler to reset quotas monthly:

```javascript
// Add this function
exports.resetMonthlyQuotas = functions.pubsub
    .schedule('0 0 1 * *') // First day of month at midnight
    .onRun(async (context) => {
      const usersSnapshot = await db.collection("users").get();
      
      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();
        
        // Sync with Adapty to get current tier
        const adaptyProfile = await getAdaptyProfile(doc.id);
        const newQuotas = calculateQuotaFromAdapty(adaptyProfile);
        
        await doc.ref.update(newQuotas);
      }
      
      console.log('Monthly quotas reset completed');
    });
```

### Option 2: Webhook-Based (Automatic)
Already implemented! When subscriptions renew, webhook automatically resets quotas.

### Option 3: On-Demand Sync
Users can call `syncUserWithAdapty` anytime to refresh their quotas.

---

## 💡 Pro Tips

### 1. Monitor Adapty API Usage
- Check Adapty dashboard for API call statistics
- Set up alerts if usage is high
- Consider caching user profiles temporarily

### 2. Handle Edge Cases
```javascript
// User's subscription expires mid-request
// Webhook updates tier to freemium
// User's ongoing request still works (they paid for it)

// Solution: Check quota BEFORE operation, not after
// Current implementation does this correctly ✅
```

### 3. Test Mode vs Production
```javascript
// Use test keys during development
firebase functions:secrets:set ADAPTY_SECRET_KEY
// Paste: secret_test_xxxxxxxxxxxx

// Use live keys in production
firebase functions:secrets:set ADAPTY_SECRET_KEY
// Paste: secret_live_xxxxxxxxxxxx
```

### 4. Graceful Degradation
```javascript
// If Adapty API is down during new user creation
// Current: Request fails (secure but strict)
// Alternative: Create with free tier, sync later

// To implement, modify createNewUser():
try {
  const adaptyProfile = await getAdaptyProfile(userId);
  // ... rest of verification
} catch (error) {
  // If Adapty is down, create free tier user
  console.warn(`Adapty unavailable, creating free tier user: ${userId}`);
  // Mark for later verification
  return { tier: "freemium", needsVerification: true, ... };
}
```

---

## 📞 Common Issues & Solutions

### Issue 1: "User not found in Adapty"
**Cause**: User ID mismatch between app and backend
**Solution**: 
```swift
// Make sure you're using Adapty's profile ID
let userId = Adapty.profileId // ✅ Correct
// Not custom_user_id or anything else
```

### Issue 2: Webhook not firing
**Cause**: URL not configured or wrong events selected
**Solution**: Double-check webhook URL and events in Adapty Dashboard

### Issue 3: Quotas not updating after purchase
**Cause**: Webhook delay or failure
**Solution**: Call `syncUserWithAdapty` from app after purchase as backup

### Issue 4: Wrong tier assigned
**Cause**: Product ID doesn't match the check logic
**Solution**: Update the product ID check in `calculateQuotaFromAdapty`

---

## ✅ Summary

### Your Approach Is Correct! ✨
- Only verify new users with Adapty
- Trust existing Firebase users
- Saves API calls and money
- Still secure

### Security Benefits
- ✅ No fake user creation
- ✅ All users verified against Adapty
- ✅ Automatic quota updates via webhook
- ✅ Manual sync option available

### Quota Structure
- Freemium: 10/0/10
- Premium: 100/100/100
- Ultra Premium: 500/500/500

### Next Steps
1. Get Adapty Secret Key
2. Add to Firebase Secrets
3. Deploy functions
4. Configure webhook
5. Test with real and fake users
6. Monitor logs

You're all set! 🚀
