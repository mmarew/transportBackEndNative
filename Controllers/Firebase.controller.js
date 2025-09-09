const ServerResponder = require("../Utils/ServerResponder");
const {
  upsertDeviceToken,
  getDeviceTokenByUniqueId,
  updateDeviceTokenByUniqueId,
  deleteDeviceTokenByUniqueId,
  sendNotificationToTokens,
  sendNotificationToUser,
} = require("../Services/Firebase.service");

const firebaseController = {
  // POST /api/user/updateFCMToken
  createFirebase: async (req, res) => {
    try {
      const userUniqueId = req?.user?.userUniqueId || null; // from verifyTokenOfAxios
      const roleId = req?.user?.roleId || null;
      const { FCMToken, platform, appVersion, locale } = req.body || {};
      const result = await upsertDeviceToken({
        userUniqueId,
        token: FCMToken,
        platform,
        appVersion,
        locale,
        roleId,
      });
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in createFirebase:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to register/update device token",
      });
    }
  },

  // GET /api/user/updateFCMToken/:id (deviceTokenUniqueId)
  getFirebaseById: async (req, res) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const result = await getDeviceTokenByUniqueId(deviceTokenUniqueId);
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in getFirebaseById:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to get device token",
      });
    }
  },

  // PUT /api/user/updateFCMToken/:id
  updateFirebase: async (req, res) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const {
        platform = null,
        appVersion = null,
        locale = null,
        revoke = undefined,
      } = req.body || {};

      const result = await updateDeviceTokenByUniqueId(deviceTokenUniqueId, {
        platform,
        appVersion,
        locale,
        revokedAt: revoke, // pass true to revoke, false to un-revoke
      });
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in updateFirebase:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to update device token",
      });
    }
  },

  // DELETE /api/user/updateFCMToken/:id
  deleteFirebase: async (req, res) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const result = await deleteDeviceTokenByUniqueId(deviceTokenUniqueId);
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in deleteFirebase:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to delete device token",
      });
    }
  },

  // POST /api/notifications/send-to-user
  sendNotificationToUser: async (req, res) => {
    try {
      const { roleId } = req?.user || {};
      const { userUniqueId, notification, data, android, apns, webpush } =
        req.body || {};
      console.log("@userUniqueId", userUniqueId);

      if (!userUniqueId) {
        return ServerResponder(res, {
          message: "error",
          error: "userUniqueId required",
        });
      }
      if (!roleId) {
        return ServerResponder(res, {
          message: "error",
          error: "roleId required",
        });
      }
      // notification must contain title and body
      if (!notification?.title || !notification?.body) {
        return ServerResponder(res, {
          message: "error",
          error: "notification must contain title and body",
        });
      }
      const result = await sendNotificationToUser({
        userUniqueId,
        roleId,
        notification,
        data,
        android,
        apns,
        webpush,
      });
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in sendNotificationToUser:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to send notification",
      });
    }
  },

  // POST /api/notifications/send-to-tokens
  sendNotificationToTokens: async (req, res) => {
    try {
      const { tokens, notification, data, android, apns, webpush } =
        req.body || {};
      const result = await sendNotificationToTokens({
        tokens,
        notification,
        data,
        android,
        apns,
        webpush,
      });
      return ServerResponder(res, result);
    } catch (error) {
      console.error("Error in sendNotificationToTokens:", error);
      return ServerResponder(res, {
        message: "error",
        error: "Failed to send notification",
      });
    }
  },
};

module.exports = firebaseController;
