/**
 * Bu dosya, Gardırop AI uygulamasının tüm backend mantığını içerir.
 * Üç ana fonksiyon bulunur:
 * 1. analyzeClothingImage: Yeni eklenen bir kıyafetin kategorisini ve açıklamasını JSON olarak oluşturur.
 * 2. virtualTryOn: Bir kıyafeti bir poz üzerinde sanal olarak dener.
 * 3. getOutfitSuggestion: Kullanıcının gardırobuna ve isteğine göre kombin önerir.
 */

const functions = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");

// Secret tanımlaması
const falKey = defineSecret("FAL_KEY");

// Firebase servislerini başlat
admin.initializeApp();
// Firestore veritabanına erişim için bir referans oluştur
const db = admin.firestore();

/**
 * Firestore'da yeni bir kullanıcı profili oluşturur.
 * Bu fonksiyon, bir kullanıcı sisteme kayıtlı değilken ilk işlemini yaptığında otomatik olarak çağrılır.
 * @param {string} userId Kullanıcının benzersiz adapty_user_id'si.
 * @return {object} Yeni oluşturulan kullanıcının verilerini döndürür.
 */
async function createNewUser(userId) {
  console.log(`Yeni kullanıcı oluşturuluyor: ${userId}`);
  const freeTierLimits = {
    tier: "freemium",
    remainingTryOns: 10,
    remainingSuggestions: 0, // Ücretsiz kullanıcıların öneri hakkı yoktur.
    remainingClothAnalysis: 10,
    createdAt: new Date(),
  };
  // Yeni kullanıcı verilerini Firestore'a kaydet
  await db.collection("users").doc(userId).set(freeTierLimits);
  return freeTierLimits;
}

/**
 * Kullanıcının belirli bir eylem için kotasını kontrol eder ve günceller.
 * @param {string} userId Kullanıcının benzersiz adapty_user_id'si.
 * @param {string} quotaType Kontrol edilecek kota alanı (örn: "remainingTryOns").
 * @return {Promise<void>} Yeterli kota yoksa HttpsError fırlatır.
 */
async function checkOrUpdateQuota(userId, quotaType) {
  try {
    console.log(`Checking quota for user: ${userId}, quotaType: ${quotaType}`);
    
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    let userData;
    
    if (!userDoc.exists) {
      console.log(`User ${userId} does not exist, creating new user...`);
      userData = await createNewUser(userId);
      console.log(`New user created successfully for ${userId}`);
    } else {
      userData = userDoc.data();
      console.log(`Existing user found: ${userId}, current ${quotaType}: ${userData[quotaType]}`);
    }

    // Kota kontrolü
    if (!userData || userData[quotaType] === undefined || userData[quotaType] <= 0) {
      console.log(`Quota exhausted for user ${userId}, ${quotaType}: ${userData ? userData[quotaType] : 'undefined'}`);
      throw new functions.https.HttpsError("resource-exhausted", `Bu işlem için hakkınız dolmuştur (${quotaType}).`);
    }

    // Kullanıcının kota hakkını düşür
    await userRef.update({
      [quotaType]: admin.firestore.FieldValue.increment(-1),
    });
    
    console.log(`Quota updated successfully for user ${userId}, decremented ${quotaType}`);
    
  } catch (error) {
    if (error.code === "resource-exhausted") {
      throw error; // Quota hatalarını doğrudan geçir
    }
    
    console.error(`Error in checkOrUpdateQuota for user ${userId}:`, error);
    throw new functions.https.HttpsError("internal", "Kullanıcı kota kontrolünde hata oluştu.");
  }
}

// --- 1. KULLANICI FONKSİYONU: KIYAFET ANALİZİ (GÜNCELLENDİ) ---
/**
 * Yeni bir kıyafet eklendiğinde görüntüyü analiz eder ve JSON formatında döner.
 */
exports.analyzeClothingImage = functions
    .https.onCall({secrets: [falKey]}, async (payload, context) => {
      
      const data = payload.data || payload; 
      const adapty_user_id = data.adapty_user_id;
      const image_base_64 = data.image_base_64;

      if (!adapty_user_id || !image_base_64) {
        throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id, image_base_64).");
      }

      try {
        // Kullanıcının analiz hakkı olup olmadığını kontrol et ve kotayı düşür
        await checkOrUpdateQuota(adapty_user_id, "remainingClothAnalysis");

        const categoryList = [
          "T-Shirt", "Shirt", "Sweater", "Sweatshirt / Hoodie", "Blouse",
          "Pants", "Jeans", "Shorts", "Skirt",
          "Jacket", "Coat", "Blazer", "Vest",
          "Dress", "Jumpsuit",
          "Shoes", "Boots", "Sneakers", "Heels",
          "Hat", "Bag", "Belt", "Jewelry", "Scarf", "Sunglasses",
        ].join(", ");

        const prompt = `
          Analyze the main clothing item in this image. Your response MUST be a valid JSON object.
          The JSON object should have two keys: "category" and "description".

          Instructions for the model:
          1.  For the "category" value, you MUST choose the most appropriate category ONLY from this list: [${categoryList}].
          2.  For the "description" value, provide a single, comprehensive paragraph in English. This paragraph must describe the item's physical details (material, fit, color, patterns) AND its context (formality level, suitable occasions, and appropriate weather conditions).
          3.  CRITICAL RULE: Your description must ONLY be about the garment. DO NOT mention the background, the surface it is on, or how it is positioned (e.g., "laid flat", "on a hanger"). Focus strictly on the item's own features.

          Example JSON response:
          {
            "category": "Shirt",
            "description": "A white, long-sleeved shirt made of a smooth, possibly cotton material. It features a classic collar, a button-down front, and a regular fit. This piece is suitable for casual or smart casual occasions in mild weather."
          }
        `;
        
        // Secret'tan API key'i al
        const apiKey = falKey.value();

        const bgResponse = await axios.post(
            "https://fal.run/fal-ai/birefnet",
            {
              image_url: `data:image/jpeg;base64,${image_base_64}`,
            },
            {
              headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
            },
        );

        const bgRemovedImageUrl = bgResponse.data?.image.url;
        if (bgRemovedImageUrl == undefined || bgRemovedImageUrl == null) {
          console.error(`fal-ai/birefnet HATA: response:`, bgResponse);
          throw new functions.https.HttpsError("internal-fal-error", "fal-ai/birefnet Hatası");
        }

        const response = await axios.post(
            "https://fal.run/fal-ai/llava-next",
            {
              prompt,
              image_url: `${bgRemovedImageUrl}`,
              max_tokens: 256,
              temperature: 0.2,
            },
            {
              headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
            },
        );
        
        const llmOutput = response.data?.output ?? "{}";
        try {
            const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error("Cevapta geçerli bir JSON objesi bulunamadı.");
            }
            const parsedJson = JSON.parse(jsonMatch[0]);
            return { ...parsedJson, ...{"image_url": bgRemovedImageUrl}};
        } catch (e) {
            console.error("LLM JSON parse hatası:", llmOutput, e);
            throw new functions.https.HttpsError("internal", "Yapay zekanın cevabı anlaşılamadı. Lütfen tekrar deneyin.");
        }
      } catch (error) {
        // Quota hatalarını doğrudan geçir
        if (error.code === "resource-exhausted") {
            throw error;
        }
        console.error("Fal API hatası (analyzeClothingImage):", error);
        throw new functions.https.HttpsError("internal", "Kıyafet analizi sırasında bir hata oluştu.");
      }
    });


// --- 2. KULLANICI FONKSİYONU: SANAL DENEME (GÜNCELLENDİ) ---
/**
 * Bir kıyafeti bir poz üzerinde dener.
 * Kullanıcının 'remainingTryOns' kotasını kontrol eder ve düşürür.
 */
exports.virtualTryOn = functions
    .https.onCall({secrets: [falKey]}, async (payload, context) => {
      
      const data = payload.data || payload;
      const { adapty_user_id, pose_image_base_64, clothing_image_base_64 } = data;

      if (!adapty_user_id || !pose_image_base_64 || !clothing_image_base_64) {
        throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id, pose_image_base_64, clothing_image_base_64).");
      }

      try {
        console.log(`Virtual try-on başlatılıyor - User: ${adapty_user_id}`);
        
        // Kullanıcının deneme hakkı olup olmadığını kontrol et ve kotayı düşür
        await checkOrUpdateQuota(adapty_user_id, "remainingTryOns");

        // Secret'tan API key'i al
        const apiKey = falKey.value();

        console.log("FAL AI Virtual Try-On API'sine istek gönderiliyor...");
        
        const response = await axios.post(
            "https://fal.run/fal-ai/image-apps-v2/virtual-try-on",
            {
                person_image_url: `data:image/jpeg;base64,${pose_image_base_64}`,
                clothing_image_url: `data:image/jpeg;base64,${clothing_image_base_64}`,
                preserve_pose: true,
            },
            {
                headers: {
                    "Authorization": `Key ${apiKey}`,
                    "Content-Type": "application/json",
                },
            },
        );

        console.log("FAL AI Virtual Try-On response alındı:", response.status);

        // FAL AI'dan gelen response'u işle
        const resultImageUrl = response.data?.images?.[0]?.url;

        if (!resultImageUrl) {
            console.error("API'den geçerli bir görüntü URL'si alınamadı. Full Response:", JSON.stringify(response.data, null, 2));
            throw new functions.https.HttpsError("internal", "Sanal deneme sonucu oluşturulamadı. Lütfen tekrar deneyin.");
        }

        console.log(`Virtual try-on başarıyla tamamlandı - User: ${adapty_user_id}`);
        return { result_image_url: resultImageUrl };

    } catch (error) {
        // Quota hatalarını doğrudan geçir
        if (error.code === "resource-exhausted") {
            console.log(`Quota exhausted for user ${adapty_user_id} - Virtual Try-On`);
            throw error;
        }
        
        // Axios hata detaylarını logla
        if (error.response) {
            console.error("FAL AI Virtual Try-On API hatası:", {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            });
        } else if (error.request) {
            console.error("FAL AI Virtual Try-On network hatası:", error.request);
        } else {
            console.error("FAL AI Virtual Try-On genel hatası:", error.message);
        }
        
        throw new functions.https.HttpsError("internal", "Sanal deneme sırasında bir hata oluştu. Lütfen tekrar deneyin.");
    }
});

// --- 3. KULLANICI FONKSİYONU: KOMBİN ÖNERİSİ (GÜNCELLENDİ) ---
/**
 * Kullanıcının gardırobuna ve metin isteğine göre kombin önerir.
 * Kullanıcının 'remainingSuggestions' kotasını kontrol eder ve düşürür.
 */
exports.getOutfitSuggestion = functions
    .https.onCall({secrets: [falKey]}, async (payload, context) => {
      
      const data = payload.data || payload;
      const { adapty_user_id, user_request, clothing_items } = data;

      if (!adapty_user_id || !user_request || !Array.isArray(clothing_items)) {
        throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id, user_request, clothing_items).");
      }

      // Minimum kıyafet sayısı kontrolü
      if (clothing_items.length < 10) {
        throw new functions.https.HttpsError("invalid-argument", "Kombin önerisi için gardırobunuzda en az 10 kıyafet bulunmalıdır. Şu anda " + clothing_items.length + " kıyafetiniz var.");
      }

      try {
        console.log(`Outfit suggestion başlatılıyor - User: ${adapty_user_id}, Items: ${clothing_items.length}`);
        
        // Kullanıcının öneri hakkı olup olmadığını kontrol et ve kotayı düşür
        await checkOrUpdateQuota(adapty_user_id, "remainingSuggestions");

        const clothingJsonArray = JSON.stringify(clothing_items, null, 2);
        const finalPrompt = `You are an expert fashion stylist. Your task is to create an outfit combination from a provided list of clothes based on a user's request.

**USER REQUEST:**
"${user_request}"

**AVAILABLE CLOTHES (WARDROBE):**
${clothingJsonArray}

**YOUR TASK:**
Analyze the user's request and the detailed descriptions of all available clothes. Select the best items to form a coherent and stylish outfit that matches the user's needs (like weather, occasion, or color theme).

**IMPORTANT RULES:**
- Only use items from the provided wardrobe list
- Each recommended item ID must exist in the provided clothing_items array
- If the wardrobe doesn't have suitable items for the request, suggest the best available alternatives
- Always provide at least 2 items for a complete outfit

**OUTPUT FORMAT:**
Your response MUST be a single, valid JSON object. Do not add any text, explanations, or markdown formatting before or after the JSON object. The JSON object must contain exactly two keys: "recommendation" and "description".

1.  \`recommendation\`: An array of strings. Each string MUST be the ID of a selected clothing item from the provided wardrobe list.
2.  \`description\`: A helpful and stylish explanation **in English** detailing why you chose this combination. It should justify your choices based on the user's request and how the items complement each other.

**EXAMPLE RESPONSE:**
{
  "recommendation": ["ID_23", "ID_34", "ID_76"],
  "description": "I've created a stylish and functional outfit for a cool, rainy day. The water-resistant trench coat will keep you dry, while the wool sweater provides warmth. The dark pants are suitable for an office environment and are less likely to show splashes."
}`;

        console.log("FAL AI Outfit Suggestion API'sine istek gönderiliyor...");
        
        const apiKey = falKey.value();
        
        const response = await axios.post(
            "https://fal.run/fal-ai/any-llm/enterprise",
            { 
              model: "google/gemini-2.5-flash",
              prompt: finalPrompt,
              max_tokens: 1024,
              temperature: 0.7,
            },
            { 
              headers: { 
                "Authorization": `Key ${apiKey}`, 
                "Content-Type": "application/json",
              },
            },
        );

        console.log("FAL AI Outfit Suggestion response alındı:", response.status);

        const llmOutput = response.data?.output ?? "{}";
        try {
          const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("Cevapta geçerli bir JSON objesi bulunamadı.");
          }
          const parsedJson = JSON.parse(jsonMatch[0]);
          
          // Response validation
          if (!parsedJson.recommendation || !parsedJson.description) {
            throw new Error("Response eksik alanlar içeriyor: 'recommendation' veya 'description' bulunamadı.");
          }
          
          if (!Array.isArray(parsedJson.recommendation) || parsedJson.recommendation.length === 0) {
            throw new Error("Recommendation array boş veya geçersiz.");
          }

          console.log(`Outfit suggestion başarıyla tamamlandı - User: ${adapty_user_id}, Recommended items: ${parsedJson.recommendation.length}`);
          return parsedJson;
          
        } catch (e) {
          console.error("LLM JSON parse hatası:", llmOutput, e);
          throw new functions.https.HttpsError("internal", "Stil danışmanının cevabı anlaşılamadı. Lütfen tekrar deneyin.");
        }
      } catch (error) {
        // Quota hatalarını doğrudan geçir
        if (error.code === "resource-exhausted") {
            console.log(`Quota exhausted for user ${adapty_user_id} - Outfit Suggestion`);
            throw error;
        }
        
        // API hata detaylarını logla
        if (error.response) {
            console.error("FAL AI Outfit Suggestion API hatası:", {
                status: error.response.status,
                data: error.response.data
            });
        } else {
            console.error("FAL AI Outfit Suggestion genel hatası:", error.message);
        }
        
        throw new functions.https.HttpsError("internal", "Kombin önerisi alınırken bir hata oluştu. Lütfen tekrar deneyin.");
      }
    });

// --- 4. KULLANICI FONKSİYONU: KULLANICI TİER BİLGİSİ ---
/**
 * Kullanıcının mevcut tier bilgilerini ve kalan kotalarını döndürür.
 * SwiftUI uygulamasının paywall durumunu kontrol etmesi için kullanılır.
 */
exports.getUserTier = functions
    .https.onCall(async (payload, context) => {
      
      const data = payload.data || payload;
      const { adapty_user_id } = data;

      if (!adapty_user_id) {
        throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id).");
      }

      try {
        console.log(`User tier bilgisi isteniyor - User: ${adapty_user_id}`);
        
        const userRef = db.collection("users").doc(adapty_user_id);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
          console.log(`User ${adapty_user_id} bulunamadı`);
          throw new functions.https.HttpsError("not-found", "Kullanıcı bulunamadı. Lütfen önce bir işlem yaparak hesabınızı oluşturun.");
        }
        
        const userData = userDoc.data();

        // Kullanıcı bilgilerini temizle ve döndür
        const userTierInfo = {
          tier: userData.tier || "freemium",
          remainingTryOns: userData.remainingTryOns || 0,
          remainingSuggestions: userData.remainingSuggestions || 0,
          remainingClothAnalysis: userData.remainingClothAnalysis || 0,
          createdAt: userData.createdAt
        };

        console.log(`User tier bilgisi döndürülüyor - User: ${adapty_user_id}, Tier: ${userTierInfo.tier}`);
        return userTierInfo;

      } catch (error) {
        console.error(`getUserTier hatası - User: ${adapty_user_id}:`, error);
        throw new functions.https.HttpsError("internal", "Kullanıcı bilgileri alınırken bir hata oluştu.");
      }
    });