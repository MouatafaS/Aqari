const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. تهيئة فايربيز
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require("./serviceAccountKey.json");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// ==================================================================
// ✅ وظيفة الجدولة المزدوجة (تحديث الحالة + الحذف النهائي)
// 🔥 وضع التجربة: يعمل كل 3 ثواني
// ==================================================================
cron.schedule('0 */2 * * *', async () => {
  const currentTime = Date.now();
  const propertiesRef = admin.firestore().collection('properties');
  
  // ------------------------------------------------------
  // 1️⃣ المهمة الأولى: تحويل الإعلانات المنتهية إلى Expired
  // ------------------------------------------------------
  try {
    const activeSnapshot = await propertiesRef.where('status', '==', 'active').get();
    
    if (!activeSnapshot.empty) {
      const updateBatch = admin.firestore().batch();
      let expiredCount = 0;

      activeSnapshot.forEach(doc => {
        const data = doc.data();
        const expirySeconds = data.expiryDate?._seconds || data.expiryDate?.seconds; 
        
        // لو الوقت عدى --> حوله expired
        if (expirySeconds && (expirySeconds * 1000) < currentTime) {
          updateBatch.update(doc.ref, { status: 'expired' });
          expiredCount++;
        }
      });

      if (expiredCount > 0) {
        await updateBatch.commit();
        console.log(`🔄 تم تحويل ${expiredCount} إعلان إلى منتهي الصلاحية.`);
      }
    }
  } catch (error) {
    console.error('❌ خطأ في تحديث الحالة:', error);
  }

  // ------------------------------------------------------
  // 2️⃣ المهمة الثانية: حذف الإعلانات المنتهية منذ 3 أيام
  // ------------------------------------------------------
  try {
    // حساب التوقيت: الوقت الحالي ناقص 3 أيام
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
    const deleteCutoff = currentTime - threeDaysInMs;

    // بنجيب الإعلانات اللي حالتها expired
    const expiredSnapshot = await propertiesRef.where('status', '==', 'expired').get();

    if (!expiredSnapshot.empty) {
      const deleteBatch = admin.firestore().batch();
      let deletedCount = 0;

      expiredSnapshot.forEach(doc => {
        const data = doc.data();
        const expirySeconds = data.expiryDate?._seconds || data.expiryDate?.seconds;
        
        // لو تاريخ الانتهاء كان من 3 أيام أو أكثر --> احذفه
        if (expirySeconds && (expirySeconds * 1000) < deleteCutoff) {
          deleteBatch.delete(doc.ref);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await deleteBatch.commit();
        console.log(`🗑️ تم حذف ${deletedCount} إعلان نهائياً لمرور 3 أيام على انتهائهم.`);
      }
    }
  } catch (error) {
    console.error('❌ خطأ في الحذف النهائي:', error);
  }
});
// ==================================================================


/**
 * Endpoints (الإشعارات) - كما هي بدون تغيير
 */
app.post('/send-to-all', async (req, res) => {
  const { title, body, targetScreen, propertyId } = req.body;
  if (!title || !body) return res.status(400).send({ error: "Required fields missing" });

  const message = {
    notification: { title, body },
    data: { targetScreen: targetScreen || 'Home', propertyId: propertyId || '' },
    topic: 'all_users',
  };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).send({ success: true, messageId: response });
  } catch (error) {
    res.status(500).send({ error: "Failed" });
  }
});

app.post('/send-to-user', async (req, res) => {
    const { fcmToken, title, body, targetScreen, propertyId } = req.body;
    if (!fcmToken || !title || !body) return res.status(400).send({ error: "Required fields missing" });
  
    const message = {
      notification: { title, body },
      data: { targetScreen: targetScreen || 'Home', propertyId: propertyId || '' },
      token: fcmToken,
    };
  
    try {
      const response = await admin.messaging().send(message);
      res.status(200).send({ success: true, messageId: response });
    } catch (error) {
      res.status(500).send({ error: "Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 السيرفر شغال...`);
});
