const admin = require('firebase-admin');

// استدعاء ملف المفتاح الذي قمت بتحميله
// تأكد أن الملف موجود في نفس المجلد أو قم بتغيير المسار
const serviceAccount = require("./serviceAccountKey.json");

/**
 * منع إعادة تهيئة التطبيق (Initialization) أكثر من مرة 
 * في بيئات التطوير مثل Node.js
 */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // إذا كنت تستخدم قاعدة بيانات فايربيز أيضاً أضف الرابط هنا (اختياري)
    // databaseURL: "https://your-project-id.firebaseio.com"
  });
}

/**
 * تصدير نسخة (Instance) من الأدمن لاستخدامها في ملفات أخرى
 * مثل إرسال الإشعارات أو التحكم في المستخدمين
 */
module.exports = admin;