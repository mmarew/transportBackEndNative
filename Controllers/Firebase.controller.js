const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const {
  upsertDeviceToken,
  getDeviceTokenByUniqueId,
  updateDeviceTokenByUniqueId,
  deleteDeviceTokenByUniqueId,
  sendNotificationToTokens,
  sendFCMNotificationToUser,
} = require("../Services/Firebase.service");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

const firebaseController = {
  // POST /api/user/updateFCMToken
  createFirebase: async (req, res, next) => {
    try {
      const userUniqueId = req?.user?.userUniqueId || null; // from verifyTokenOfAxios
      const roleId = req?.user?.roleId || null;
      const { token, FCMToken, platform, appVersion, locale } = req.body || {};
      const result = await executeInTransaction(async () => {
        return await upsertDeviceToken({
          userUniqueId,
          token: token || FCMToken,
          platform,
          appVersion,
          locale,
          roleId,
        });
      });
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  // GET /api/user/updateFCMToken/:id (deviceTokenUniqueId)
  getFirebaseById: async (req, res, next) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const result = await getDeviceTokenByUniqueId(deviceTokenUniqueId);
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/user/updateFCMToken/:id
  updateFirebase: async (req, res, next) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const {
        platform = null,
        appVersion = null,
        locale = null,
        revoke = undefined,
      } = req.body || {};

      const result = await executeInTransaction(async () => {
        return await updateDeviceTokenByUniqueId(deviceTokenUniqueId, {
          platform,
          appVersion,
          locale,
          revokedAt: revoke, // pass true to revoke, false to un-revoke
        });
      });
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/user/updateFCMToken/:id
  deleteFirebase: async (req, res, next) => {
    try {
      const { deviceTokenUniqueId } = req.params;
      const result = await executeInTransaction(async () => {
        return await deleteDeviceTokenByUniqueId(deviceTokenUniqueId);
      });
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  // POST /api/notifications/send-to-user
  sendFCMNotificationToUser: async (req, res, next) => {
    try {
      const { roleId } = req?.user || {};
      const { userUniqueId, notification, data, android, apns, webpush } =
        req.body || {};

      if (!userUniqueId) {
        return next(new AppError("userUniqueId required", AppError.BAD_REQUEST));
      }
      if (!roleId) {
        return next(new AppError("roleId required", AppError.BAD_REQUEST));
      }
      // notification must contain title and body
      if (!notification?.title || !notification?.body) {
        return next(
          new AppError("notification must contain title and body", AppError.BAD_REQUEST),
        );
      }
      const result = await executeInTransaction(async () => {
        return await sendFCMNotificationToUser({
          userUniqueId,
          roleId,
          notification,
          data,
          android,
          apns,
          webpush,
        });
      });
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  // POST /api/notifications/send-to-tokens
  sendNotificationToTokens: async (req, res, next) => {
    try {
      const { tokens, notification, data, android, apns, webpush } =
        req.body || {};
      const result = await executeInTransaction(async () => {
        return await sendNotificationToTokens({
          tokens,
          notification,
          data,
          android,
          apns,
          webpush,
        });
      });
      return ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = firebaseController;
