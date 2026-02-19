const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const cron = require('node-cron'); // ✅ 1. استدعاء مكتبة الجدولة اللي لسه مثبتها
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. تهيئة فايربيز أدمن بطريقة آمنة للرفع على السيرفر (Render)
// لو السيرفر لقى المتغير في البيئة هيستخدمه، لو ملقاهوش (وأنت شغال محلي) هيستخدم الملف العادي
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

// =========================================================================
// ✅ 2. الكود الجديد: فحص الإعلانات المنتهية (يشتغل تلقائياً كل يوم الساعة 12 منتصف الليل)
// =========================================================================
cron.schedule('0 0 * * *', async () => {
  console.log('⏳ جاري فحص الإعلانات المنتهية...');
  
  try {
    const propertiesRef = admin.firestore().collection('properties');
    const snapshot = await propertiesRef.where('status', '==', 'active').get();

    if (snapshot.empty) {
      console.log('✅ لا توجد إعلانات نشطة لفحصها.');
      return;
    }

    const batch = admin.firestore().batch();
    const currentTime = Date.now();
    let expiredCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      
      // تأكد من اسم حقل تاريخ الانتهاء عندك في الفايربيز
      const expirySeconds = data.expiryDate?._seconds || data.expiryDate?.seconds; 

      if (expirySeconds && (expirySeconds * 1000) < currentTime) {
        batch.update(doc.ref, { status: 'expired' });
        expiredCount++;
      }
    });

    if (expiredCount > 0) {
      await batch.commit();
      console.log(`✅ تم تحديث ${expiredCount} إعلان إلى منتهي الصلاحية.`);
    } else {
      console.log('✅ لا توجد إعلانات انتهت صلاحيتها اليوم.');
    }

  } catch (error) {
    console.error('❌ حدث خطأ أثناء التحديث التلقائي للإعلانات:', error);
  }
});
// =========================================================================


/**
 * 2. Endpoint لإرسال إشعار لكل مستخدمي التطبيق مع إمكانية التوجيه لشاشة معينة
 * Body: { title, body, targetScreen, propertyId }
 */
app.post('/send-to-all', async (req, res) => {
  const { title, body, targetScreen, propertyId } = req.body;

  // التحقق من وجود البيانات الأساسية
  if (!title || !body) {
    return res.status(400).send({ error: "العنوان والمحتوى مطلوبين" });
  }

  const message = {
    notification: { 
        title: title, 
        body: body 
    },
    // 🔥 الجزء المسؤول عن توجيه المستخدم لشاشة معينة (Deep Linking) 🔥
    data: {
      targetScreen: targetScreen || 'Home', // الشاشة المستهدفة
      propertyId: propertyId || '',         // أي بيانات إضافية (مثل آيدي الإعلان)
    },
    topic: 'all_users', // الـ Topic اللي اشتركنا فيه في الـ React Native
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ تم إرسال الإشعار بنجاح:', response);
    res.status(200).send({ success: true, messageId: response });
  } catch (error) {
    console.error('❌ خطأ في الإرسال:', error);
    res.status(500).send({ error: "فشل إرسال الإشعار" });
  }
});

/**
 * 3. Endpoint إضافي لإرسال إشعار لمستخدم واحد فقط (Customer)
 * Body: { fcmToken, title, body, targetScreen, propertyId }
 */
app.post('/send-to-user', async (req, res) => {
    const { fcmToken, title, body, targetScreen, propertyId } = req.body;
  
    if (!fcmToken || !title || !body) {
      return res.status(400).send({ error: "التوكن والعنوان والمحتوى مطلوبين" });
    }
  
    const message = {
      notification: { title, body },
      data: {
        targetScreen: targetScreen || 'Home',
        propertyId: propertyId || '',
      },
      token: fcmToken, // الإرسال لتوكن معين بدلاً من Topic
    };
  
    try {
      const response = await admin.messaging().send(message);
      res.status(200).send({ success: true, messageId: response });
    } catch (error) {
      res.status(500).send({ error: "فشل الإرسال لهذا المستخدم" });
    }
  });

// 4. تشغيل السيرفر على جميع الواجهات للسماح للموبايل بالوصول عبر الـ IP
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 السيرفر شغال دلوقتي ومتاح للأجهزة على بورت ${PORT}`);
});
