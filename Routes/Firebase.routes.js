// Firebase routes
const express = require("express");
const router = express.Router();
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const firebaseController = require("../Controllers/Firebase.controller");

// Define routes for CRUD operations
const { validator } = require("../Middleware/Validator");
const {
  upsertFCMToken,
  updateFCMToken,
  firebaseParams,
  sendNotification,
} = require("../Validations/Firebase.schema");
const { FIREBASE_ENDPOINTS } = require("./EndPoints/firebase.endpoints");

// Define routes for CRUD operations
router.post(
  FIREBASE_ENDPOINTS.UPSERT_FCM_TOKEN,
  verifyTokenOfAxios,
  validator(upsertFCMToken),
  firebaseController.createFirebase,
);
router.get(
  FIREBASE_ENDPOINTS.GET_FCM_TOKEN,
  verifyTokenOfAxios,
  validator(firebaseParams, "params"),
  firebaseController.getFirebaseById,
);
router.put(
  FIREBASE_ENDPOINTS.UPDATE_FCM_TOKEN,
  verifyTokenOfAxios,
  validator(firebaseParams, "params"),
  validator(updateFCMToken),
  firebaseController.updateFirebase,
);
router.delete(
  FIREBASE_ENDPOINTS.DELETE_FCM_TOKEN,
  verifyTokenOfAxios,
  validator(firebaseParams, "params"),
  firebaseController.deleteFirebase,
);

// Notification sending endpoints
router.post(
  FIREBASE_ENDPOINTS.SEND_TO_USER,
  verifyTokenOfAxios,
  validator(sendNotification),
  firebaseController.sendFCMNotificationToUser,
);
router.post(
  FIREBASE_ENDPOINTS.SEND_TO_TOKENS,
  verifyTokenOfAxios,
  validator(sendNotification),
  firebaseController.sendNotificationToTokens,
);

module.exports = router;
