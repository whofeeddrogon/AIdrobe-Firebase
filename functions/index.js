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
    tier: "free",
    remainingTryOns: 10,
    remainingSuggestions: 0, // Ücretsiz kullanıcıların öneri hakkı yoktur.
    createdAt: new Date(),
  };
  // Yeni kullanıcı verilerini Firestore'a kaydet
  await db.collection("users").doc(userId).set(freeTierLimits);
  return freeTierLimits;
}

// --- GÜVENLİK AYARI: API ANAHTARINA ERİŞİM İÇİN ---
// Bu ayar, fonksiyonlarımızın hangi gizli anahtarlara erişebileceğini belirtir.
const runtimeOptions = {
  secrets: ["FAL_KEY"], // "firebase functions:secrets:set FAL_KEY" komutuyla ayarladığımız anahtar.
};


// --- 1. KULLANICI FONKSİYONU: KIYAFET ANALİZİ (GÜNCELLENDİ) ---
/**
 * Yeni bir kıyafet eklendiğinde görüntüyü analiz eder ve JSON formatında döner.
 * Bu işlem ücretsizdir ve kota KONTROLÜ YAPMAZ.
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

        console.log(`APIKEY: ${apiKey}`);

        const response = await axios.post(
            "https://fal.run/fal-ai/llava-next",
            {
              prompt,
              image_url: `data:image/jpeg;base64,${image_base_64}`,
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
            return parsedJson;
        } catch (e) {
            console.error("LLM JSON parse hatası:", llmOutput, e);
            throw new functions.https.HttpsError("internal", "Yapay zekanın cevabı anlaşılamadı. Lütfen tekrar deneyin.");
        }
      } catch (error) {
        console.error("Fal API hatası (analyzeClothingImage):", error);
        throw new functions.https.HttpsError("internal", "Kıyafet analizi sırasında bir hata oluştu.");
      }
    });


// --- 2. KULLANICI FONKSİYONU: SANAL DENEME ---
/**
 * Bir kıyafeti bir poz üzerinde dener.
 * Kullanıcının 'remainingTryOns' kotasını kontrol eder ve düşürür.
 */
exports.virtualTryOn = functions
    .https.onCall(async (data, context) => {
        const { adapty_user_id, pose_image_base_64, clothing_image_base_64 } = data;

        if (!adapty_user_id || !pose_image_base_64 || !clothing_image_base_64) {
            throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id, pose_image_base_64, clothing_image_base_64).");
        }

        const userRef = db.collection("users").doc(adapty_user_id);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : await createNewUser(adapty_user_id);

        if (userData.remainingTryOns <= 0) {
            throw new functions.https.HttpsError("resource-exhausted", "Sanal deneme hakkınız dolmuştur.");
        }

        try {
            const prompt = "Aşağıdaki iki görüntüyü kullan...";
            
            // !! ÖNEMLİ NOT: Burası Gemini API'ına göre doldurulmalıdır.
            const resultImageBase64 = "BURAYA_GEMINI_DEN_GELEN_RESIM_BASE64_GELECEK";

            await userRef.update({
                remainingTryOns: admin.firestore.FieldValue.increment(-1),
            });

            return { result_image_base_64: resultImageBase64 };

        } catch (error) {
            console.error("Gemini API hatası (virtualTryOn):", error);
            throw new functions.https.HttpsError("internal", "Sanal deneme sırasında bir hata oluştu.");
        }
    });

// --- 3. KULLANICI FONKSİYONU: KOMBİN ÖNERİSİ ---
/**
 * Kullanıcının gardırobuna ve metin isteğine göre kombin önerir.
 * Kullanıcının 'remainingSuggestions' kotasını kontrol eder ve düşürür.
 */
exports.getOutfitSuggestion = functions
    .https.onCall({secrets: [falKey]}, async (data, context) => {
      const { adapty_user_id, user_prompt, clothing_items } = data;

      if (!adapty_user_id || !user_prompt || !Array.isArray(clothing_items)) {
        throw new functions.https.HttpsError("invalid-argument", "Gerekli parametreler eksik (adapty_user_id, user_prompt, clothing_items).");
      }

      const userRef = db.collection("users").doc(adapty_user_id);
      const userDoc = await userRef.get();
      const userData = userDoc.exists ? userDoc.data() : await createNewUser(adapty_user_id);

      if (userData.remainingSuggestions <= 0) {
        throw new functions.https.HttpsError("resource-exhausted", "Kombin öneri hakkınız dolmuştur.");
      }

      try {
        const descriptionsText = clothing_items.map(item => `- ID: ${item.id}, Description: ${item.description}`).join("\n");
        const finalPrompt = `Act as a stylist...`;
        
        const apiKey = falKey.value();
        
        const response = await axios.post(
            "https://fal.run/fal-ai/llava-next",
            { 
              prompt: finalPrompt,
              max_tokens: 512
            },
            { headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" } },
        );

        let suggestedIds = [];
        const llmOutput = response.data?.output ?? "[]";

        try {
          const jsonMatch = llmOutput.match(/\[.*?\]/s); 
          if (jsonMatch) {
            suggestedIds = JSON.parse(jsonMatch[0]);
          } else { throw new Error("Cevapta JSON array bulunamadı."); }
        } catch (e) {
          console.error("LLM JSON parse hatası:", llmOutput, e);
          throw new functions.https.HttpsError("internal", "Stil danışmanının cevabı anlaşılamadı.");
        }
        
        await userRef.update({
          remainingSuggestions: admin.firestore.FieldValue.increment(-1),
        });

        return { suggested_clothing_ids: suggestedIds };
      } catch (error) {
        console.error("Fal API hatası (getOutfitSuggestion):", error);
        throw new functions.https.HttpsError("internal", "Kombin önerisi alınırken bir hata oluştu.");
      }
    });