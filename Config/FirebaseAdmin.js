// Config/FirebaseAdmin.js
// Initializes Firebase Admin SDK for sending FCM notifications
// Requires: npm i firebase-admin

const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return;
  const { FCM_SERVICE_ACCOUNT_JSON, FCM_SERVICE_ACCOUNT_B64 } = process.env;
  let serviceAccountObject = null;

  try {
    if (FCM_SERVICE_ACCOUNT_JSON) {
      serviceAccountObject = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    } else if (FCM_SERVICE_ACCOUNT_B64) {
      const json = Buffer.from(FCM_SERVICE_ACCOUNT_B64, "base64").toString(
        "utf8"
      );
      serviceAccountObject = JSON.parse(json);
    }
  } catch (e) {
    console.error("Failed to parse Firebase service account env:", e);
  }

  // You can also fall back to GOOGLE_APPLICATION_CREDENTIALS env file path
  if (!admin.apps.length) {
    try {
      if (serviceAccountObject) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountObject),
        });
      } else {
        // Will use ADC if GOOGLE_APPLICATION_CREDENTIALS is set
        admin.initializeApp();
      }
      initialized = true;
      console.log("✅ Firebase Admin initialized");
    } catch (err) {
      console.error("❌ Firebase Admin init error:", err);
      throw err;
    }
  } else {
    initialized = true;
  }
}

initFirebaseAdmin();

module.exports = {
  admin,
  messaging: admin.messaging(),
};
