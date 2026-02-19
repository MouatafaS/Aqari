const admin = require('firebase-admin');
require('dotenv').config();

// تهيئة فايربيز أدمن بطريقة آمنة للرفع على السيرفر (Koyeb)
// لو السيرفر لقى المتغير في البيئة هيستخدمه، لو ملقاهوش (وأنت شغال محلي) هيستخدم الملف العادي
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require("./serviceAccountKey.json");
}

/**
 * منع إعادة تهيئة التطبيق أكثر من مرة 
 */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

/**
 * تصدير نسخة من الأدمن لاستخدامها في ملفات أخرى
 */
module.exports = admin;
