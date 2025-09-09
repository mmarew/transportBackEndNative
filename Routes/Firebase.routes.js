// Firebase routes
const express = require("express");
const router = express.Router();
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const firebaseController = require("../Controllers/Firebase.controller");

// Define routes for CRUD operations
router.post(
  "/api/user/upsertFCMToken",
  verifyTokenOfAxios,
  firebaseController.createFirebase
);
router.get(
  "/api/user/getFCMToken/:deviceTokenUniqueId",
  verifyTokenOfAxios,
  firebaseController.getFirebaseById
);
router.put(
  "/api/user/updateFCMToken/:deviceTokenUniqueId",
  verifyTokenOfAxios,
  firebaseController.updateFirebase
);
router.delete(
  "/api/user/deleteFCMToken/:deviceTokenUniqueId",
  verifyTokenOfAxios,
  firebaseController.deleteFirebase
);

// Notification sending endpoints
router.post(
  "/api/notifications/send-to-user",
  verifyTokenOfAxios,
  firebaseController.sendNotificationToUser
);
router.post(
  "/api/notifications/send-to-tokens",
  verifyTokenOfAxios,
  firebaseController.sendNotificationToTokens
);

module.exports = router;
