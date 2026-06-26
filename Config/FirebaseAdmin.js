const admin = require("firebase-admin");
const logger = require("../Utils/logger");
const Config = require("../Utils/Config");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) {
    return;
  }
  const {
    SERVICE_ACCOUNT_JSON: FCM_SERVICE_ACCOUNT_JSON,
    SERVICE_ACCOUNT_B64: FCM_SERVICE_ACCOUNT_B64,
  } = Config.FIREBASE;
  let serviceAccountObject = null;

  try {
    if (FCM_SERVICE_ACCOUNT_JSON) {
      serviceAccountObject = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    } else if (FCM_SERVICE_ACCOUNT_B64) {
      const json = Buffer.from(FCM_SERVICE_ACCOUNT_B64, "base64").toString();
      serviceAccountObject = JSON.parse(json);
    }
  } catch (e) {
    logger.warn("Failed to parse FCM service account", { error: e.message });
  }

  if (!admin.apps.length) {
    if (serviceAccountObject) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountObject),
      });
    } else {
      admin.initializeApp();
    }
    initialized = true;
  } else {
    initialized = true;
  }
}

initFirebaseAdmin();

module.exports = {
  admin,
  messaging: admin.messaging(),
};
