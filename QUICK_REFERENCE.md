# 🚀 Quick Reference Card

## 📊 Quota Limits at a Glance

| Tier | Try-Ons | Suggestions | Cloth Analysis |
|------|---------|-------------|----------------|
| 🆓 Freemium | 10 | 0 | 10 |
| ⭐ Premium | 100 | 100 | 100 |
| 💎 Ultra Premium | 500 | 500 | 500 |

---

## 🔑 Getting Adapty Secret Key

```bash
# 1. Get from Adapty
https://app.adapty.io/ 
→ App Settings → General → API Keys 
→ Copy "Secret Key"

# 2. Add to Firebase
cd functions
firebase functions:secrets:set ADAPTY_SECRET_KEY
# Paste key when prompted

# 3. Verify
firebase functions:secrets:access ADAPTY_SECRET_KEY
```

---

## 🎯 Product ID Configuration

**Your Adapty products must match these rules:**

### Premium Products
```
✅ com.yourapp.premium.monthly
✅ com.yourapp.premium.yearly
✅ com.yourapp.subscription.basic
```
Any product_id works for regular premium (100 quotas)

### Ultra Premium Products
```
✅ com.yourapp.ultra.monthly      ← Contains "ultra"
✅ com.yourapp.unlimited.yearly   ← Contains "unlimited"  
✅ com.yourapp.pro.subscription   ← Contains "pro"
```
Must include one of these keywords for ultra premium (500 quotas)

**Or update code to match YOUR naming:**
```javascript
// Line ~75 in index.js
if (productId.includes("ultra") || productId.includes("unlimited") || productId.includes("pro")) {
  // Change these keywords ↑↑↑ to match your product IDs
  tier = "ultra_premium";
}
```

---

## 🛠️ Deployment Commands

```bash
# Full deployment
firebase deploy --only functions

# Specific function
firebase deploy --only functions:analyzeClothingImage

# View logs
firebase functions:log --follow
```

---

## 🔗 Webhook Setup

**After deployment, get URL:**
```
https://us-central1-YOUR-PROJECT.cloudfunctions.net/adaptyWebhook
```

**Configure in Adapty:**
1. Go to https://app.adapty.io/
2. App Settings → Integrations → Webhooks
3. Add URL above
4. Select events:
   - ✅ subscription_initial_purchase
   - ✅ subscription_renewed
   - ✅ subscription_refunded
   - ✅ subscription_expired
   - ✅ subscription_cancelled

---

## 📱 iOS Integration

### Get User Tier
```swift
let functions = Functions.functions()

functions.httpsCallable("getUserTier").call([
    "adapty_user_id": Adapty.profileId
]) { result, error in
    if let data = result?.data as? [String: Any] {
        let tier = data["tier"] as? String
        let tryOns = data["remainingTryOns"] as? Int
        // Update UI
    }
}
```

### Sync After Purchase
```swift
Adapty.makePurchase(product: product) { result in
    // Sync with backend
    functions.httpsCallable("syncUserWithAdapty").call([
        "adapty_user_id": Adapty.profileId
    ]) { result, error in
        // Refresh UI with new quotas
    }
}
```

---

## 🔒 Security Flow

```
New User Request
    ↓
Check Firebase
    ↓
User exists? 
├─ YES → Trust, proceed ✅
└─ NO  → Check Adapty
          ├─ Found → Create user ✅
          └─ Not found → REJECT ❌
```

**This prevents fake user abuse!** 🛡️

---

## 🧪 Quick Tests

### Test 1: Fake User (Should Fail)
```javascript
analyzeClothingImage({
  adapty_user_id: "fake_user_999",
  image_base_64: "..."
})
// Expected: ❌ "Geçersiz kullanıcı"
```

### Test 2: Real User (Should Work)
```javascript
analyzeClothingImage({
  adapty_user_id: "<real_adapty_id>",
  image_base_64: "..."
})
// Expected: ✅ Success
```

### Test 3: Check Logs
```bash
firebase functions:log --only analyzeClothingImage
# Look for: "User verified in Adapty"
```

---

## 📋 Firestore User Structure

```javascript
{
  "users": {
    "<adapty_user_id>": {
      tier: "premium",                    // or "freemium", "ultra_premium"
      remainingTryOns: 100,
      remainingSuggestions: 100,
      remainingClothAnalysis: 100,
      createdAt: Timestamp,
      lastSyncedWithAdapty: Timestamp
    }
  }
}
```

---

## 🚨 Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `permission-denied` | Fake user ID | Use real Adapty profile ID |
| `not-found` | User doesn't exist | Create user by using any feature |
| `resource-exhausted` | Quota depleted | Buy premium or wait for reset |
| Webhook not firing | Not configured | Add webhook URL in Adapty |
| Wrong tier | Product ID mismatch | Check product naming |

---

## 📚 Documentation Files

- **SECURITY_EXPLAINED.md** - Detailed security explanation
- **ADAPTY_SETUP_GUIDE.md** - Complete setup guide
- **API_REFERENCE.md** - Full API documentation
- **README.md** - Project overview

---

## 🎉 Your Question Answered

**Q: "Is my thinking correct about checking Adapty ID?"**

**A: YES! 100% correct!** ✅

You said: "Check Adapty only if user doesn't exist in Firebase"

That's exactly what the code does:
```javascript
if (!userDoc.exists) {
  // Only check Adapty for NEW users
  await createNewUser(userId); // ← Verifies with Adapty
}
```

**Benefits:**
- 💰 Saves API calls
- ⚡ Faster for existing users
- 🛡️ Still secure (new users verified)
- ✅ Best practice

---

## 🔄 Function Summary

| Function | Purpose | Requires Auth |
|----------|---------|---------------|
| `analyzeClothingImage` | Analyze clothing photo | Yes (Adapty ID) |
| `virtualTryOn` | Virtual try-on | Yes (Adapty ID) |
| `getOutfitSuggestion` | Get outfit combo | Yes (Adapty ID) |
| `getUserTier` | Get user quotas | Yes (Adapty ID) |
| `syncUserWithAdapty` | Manual sync with Adapty | Yes (Adapty ID) |
| `adaptyWebhook` | Auto-sync subscriptions | No (webhook only) |

---

## 💡 Pro Tips

1. **Call `syncUserWithAdapty` after purchases** to immediately refresh quotas
2. **Monitor webhook logs** to ensure auto-updates work
3. **Test with Adapty test keys** before going live
4. **Set up monthly quota resets** if needed (see setup guide)
5. **Cache tier info locally** in iOS app to reduce calls

---

## 📞 Need Help?

1. Check Firebase logs: `firebase functions:log`
2. Check Adapty webhook logs in dashboard
3. Review SECURITY_EXPLAINED.md for detailed flow
4. Test with fake user first to verify security

---

**Setup Time: ~15 minutes**
**Difficulty: Easy** ⭐⭐⭐☆☆

You're ready to go! 🚀
