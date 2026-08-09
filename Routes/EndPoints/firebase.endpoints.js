const FIREBASE_ENDPOINTS = {
  UPSERT_FCM_TOKEN: "/api/user/upsertFCMToken",
  GET_FCM_TOKEN: "/api/user/getFCMToken/:deviceTokenUniqueId",
  GET_FCM_TOKENS: "/api/user/getFCMTokens",
  UPDATE_FCM_TOKEN: "/api/user/updateFCMToken/:deviceTokenUniqueId",
  DELETE_FCM_TOKEN: "/api/user/deleteFCMToken/:deviceTokenUniqueId",
  SEND_TO_USER: "/api/notifications/send-to-user",
  SEND_TO_TOKENS: "/api/notifications/send-to-tokens",
};

module.exports = {
  FIREBASE_ENDPOINTS,
};
