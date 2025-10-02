# API Reference - Updated Functions

## Overview
This document describes the changes and new functions added for Adapty integration.

---

## 🔄 Modified Functions

### 1. `analyzeClothingImage`
**Changes**: Now verifies user exists in Adapty before creating new users

**Request**:
```javascript
{
  "adapty_user_id": "string",
  "image_base_64": "string (base64 encoded image)"
}
```

**Response** (Success):
```javascript
{
  "category": "T-Shirt",
  "description": "A white cotton t-shirt...",
  "image_url": "https://..."
}
```

**Response** (Error - Fake User):
```javascript
{
  "error": {
    "code": "permission-denied",
    "message": "Geçersiz kullanıcı. Lütfen uygulamaya giriş yaptığınızdan emin olun."
  }
}
```

---

### 2. `virtualTryOn`
**Changes**: Now verifies user exists in Adapty before creating new users

**Request**:
```javascript
{
  "adapty_user_id": "string",
  "pose_image_base_64": "string",
  "clothing_image_base_64": "string"
}
```

**Response** (Success):
```javascript
{
  "result_image_url": "https://..."
}
```

**Response** (Error - Fake User):
```javascript
{
  "error": {
    "code": "permission-denied",
    "message": "Geçersiz kullanıcı. Lütfen uygulamaya giriş yaptığınızdan emin olun."
  }
}
```

---

### 3. `getOutfitSuggestion`
**Changes**: Now verifies user exists in Adapty before creating new users

**Request**:
```javascript
{
  "adapty_user_id": "string",
  "user_request": "string",
  "clothing_items": [
    {
      "id": "item_1",
      "category": "T-Shirt",
      "description": "..."
    }
  ]
}
```

**Response** (Success):
```javascript
{
  "recommendation": ["item_1", "item_3", "item_5"],
  "description": "I've created a stylish outfit..."
}
```

**Response** (Error - Fake User):
```javascript
{
  "error": {
    "code": "permission-denied",
    "message": "Geçersiz kullanıcı. Lütfen uygulamaya giriş yaptığınızdan emin olun."
  }
}
```

---

### 4. `getUserTier`
**Changes**: No changes to functionality

---

## ✨ New Functions

### 5. `syncUserWithAdapty` (NEW)
**Purpose**: Manually synchronize user's subscription status from Adapty to Firebase

**When to use**:
- After user makes a purchase
- When app launches
- When user navigates to account/settings screen
- To manually refresh quota information

**Request**:
```javascript
{
  "adapty_user_id": "string"
}
```

**Response** (Success - Premium User):
```javascript
{
  "tier": "premium",
  "remainingTryOns": 999999,
  "remainingSuggestions": 999999,
  "remainingClothAnalysis": 999999,
  "lastSyncedWithAdapty": "2025-10-01T12:00:00.000Z"
}
```

**Response** (Success - Free User):
```javascript
{
  "tier": "freemium",
  "remainingTryOns": 10,
  "remainingSuggestions": 0,
  "remainingClothAnalysis": 10,
  "lastSyncedWithAdapty": "2025-10-01T12:00:00.000Z"
}
```

**Response** (Error - User Not Found):
```javascript
{
  "error": {
    "code": "not-found",
    "message": "Kullanıcı Adapty'de bulunamadı."
  }
}
```

**iOS Example**:
```swift
let functions = Functions.functions()

func syncWithAdapty(userId: String, completion: @escaping (Result<UserTier, Error>) -> Void) {
    functions.httpsCallable("syncUserWithAdapty").call([
        "adapty_user_id": userId
    ]) { result, error in
        if let error = error {
            completion(.failure(error))
            return
        }
        
        guard let data = result?.data as? [String: Any] else {
            completion(.failure(NSError(domain: "", code: -1)))
            return
        }
        
        let tier = UserTier(
            tier: data["tier"] as? String ?? "freemium",
            remainingTryOns: data["remainingTryOns"] as? Int ?? 0,
            remainingSuggestions: data["remainingSuggestions"] as? Int ?? 0,
            remainingClothAnalysis: data["remainingClothAnalysis"] as? Int ?? 0
        )
        
        completion(.success(tier))
    }
}

// Usage
syncWithAdapty(userId: Adapty.profileId) { result in
    switch result {
    case .success(let tier):
        print("Tier: \(tier.tier)")
        self.updateUI(with: tier)
    case .failure(let error):
        print("Sync failed: \(error)")
    }
}
```

---

### 6. `adaptyWebhook` (NEW)
**Purpose**: Automatically receives subscription events from Adapty and updates user quotas

**Type**: HTTP Endpoint (not callable function)

**URL**: `https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/adaptyWebhook`

**Method**: POST

**Handled Events**:
- `subscription_initial_purchase` → Update user to premium
- `subscription_renewed` → Reset premium quotas
- `subscription_expired` → Revert to free tier
- `subscription_cancelled` → Revert to free tier
- `subscription_refunded` → Revert to free tier

**Request** (from Adapty):
```javascript
{
  "event_type": "subscription_initial_purchase",
  "profile_id": "user_123",
  // ... other Adapty event data
}
```

**Response**:
```javascript
{
  "status": "success",
  "profile_id": "user_123"
}
```

**Configuration**:
This endpoint must be configured in Adapty Dashboard under Integrations → Webhooks

**Note**: You don't call this function directly from your app. Adapty calls it automatically.

---

## 🔐 Security Changes

### Before (Insecure)
```
User sends request with any ID
  → Firebase creates user immediately
  → Anyone can create unlimited free accounts ❌
```

### After (Secure)
```
User sends request with ID
  → Check if ID exists in Adapty ✅
  → If NO: Reject request ✅
  → If YES: Create user with appropriate quotas ✅
```

---

## 📊 Quota System

### Free Tier
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

### How Quotas are Determined
1. **On first use**: Check Adapty, create user with appropriate tier
2. **On each use**: Decrement quota by 1
3. **On subscription change**: Webhook updates quotas automatically
4. **On manual sync**: Call `syncUserWithAdapty` to refresh

### Tier Detection
The system determines tier based on Adapty subscription:
- **No active subscription** → freemium
- **Active subscription with product_id containing "ultra", "unlimited", or "pro"** → ultra_premium
- **Any other active subscription** → premium

---

## 🔄 User Lifecycle

### New User Flow
```
1. User installs app
2. Adapty SDK initializes with profile_id
3. User tries to use a feature
4. Backend checks Adapty API
5. User verified → Firebase user created
6. Feature executes, quota decremented
```

### Purchase Flow
```
1. User buys premium via Adapty
2. Adapty sends webhook to Firebase
3. Firebase updates user to premium tier
4. User gets unlimited quotas
5. (Optional) App calls syncUserWithAdapty to update UI
```

### Cancellation Flow
```
1. User cancels subscription
2. Subscription expires
3. Adapty sends webhook to Firebase
4. Firebase reverts user to free tier
5. (Optional) App calls syncUserWithAdapty to update UI
```

---

## 🧪 Testing Checklist

### Test Fake User
```javascript
// This should fail
analyzeClothingImage({
  adapty_user_id: "fake_user_999",
  image_base_64: "..."
})
// Expected: "permission-denied" error
```

### Test Real User (Free)
```javascript
// Create free tier user in Adapty first
analyzeClothingImage({
  adapty_user_id: "real_user_123",
  image_base_64: "..."
})
// Expected: Success, quota decremented
// Check: remainingClothAnalysis should be 9 after first use
```

### Test Premium User
```javascript
// Create premium user in Adapty first
virtualTryOn({
  adapty_user_id: "premium_user_123",
  pose_image_base_64: "...",
  clothing_image_base_64: "..."
})
// Expected: Success, quota should remain very high (999998)
```

### Test Sync Function
```javascript
syncUserWithAdapty({
  adapty_user_id: "real_user_123"
})
// Expected: Returns current tier and quotas from Adapty
```

### Test Webhook
1. Make test purchase in Adapty
2. Check Firebase logs for webhook event
3. Verify user tier updated in Firestore
4. Verify quotas are correct

---

## 📝 Error Codes

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| `invalid-argument` | Missing parameters | Required field not provided | Check request payload |
| `permission-denied` | Invalid user | User doesn't exist in Adapty | Ensure Adapty SDK initialized |
| `not-found` | User not found | Calling getUserTier before any action | Use any feature first to create user |
| `resource-exhausted` | Quota exhausted | User ran out of free credits | Buy premium or wait for reset |
| `internal` | Various messages | Server error | Check logs, retry |

---

## 🔧 Common Integration Patterns

### Pattern 1: Check Quotas Before Action
```swift
// Check quotas first
getUserTier(userId: userId) { tier in
    if tier.remainingTryOns > 0 {
        // Proceed with try-on
        self.performVirtualTryOn()
    } else {
        // Show paywall
        self.showUpgradePrompt()
    }
}
```

### Pattern 2: Sync After Purchase
```swift
// After successful Adapty purchase
Adapty.makePurchase(product: product) { result in
    switch result {
    case .success:
        // Sync with backend
        syncUserWithAdapty(userId: userId) { tier in
            // Update UI with new unlimited quotas
            self.updateQuotaDisplay(tier)
        }
    case .failure(let error):
        // Handle error
    }
}
```

### Pattern 3: Periodic Sync
```swift
// On app launch
func application(_ application: UIApplication, didFinishLaunchingWithOptions...) {
    // Sync with backend to ensure quotas are up to date
    if let userId = Adapty.profileId {
        syncUserWithAdapty(userId: userId) { tier in
            // Update local cache
            UserDefaults.standard.set(tier.remainingTryOns, forKey: "quotaTryOns")
        }
    }
}
```

---

## 🚀 Performance Tips

1. **Cache Quota Locally**: Don't call `getUserTier` before every action
2. **Sync Strategically**: Call `syncUserWithAdapty` only when needed (app launch, after purchase)
3. **Handle Webhooks**: Let webhooks handle most updates automatically
4. **Optimistic UI**: Decrement quota locally, sync in background

---

## 📞 Support

For issues or questions:
1. Check Firebase Functions logs
2. Check Adapty Dashboard event logs
3. Verify webhook configuration
4. Test with Adapty test environment first
