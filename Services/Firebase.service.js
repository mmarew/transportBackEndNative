const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { messaging } = require("../Config/FirebaseAdmin");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");

// Service for managing DeviceTokens table
const upsertDeviceToken = async ({
  userUniqueId = null,
  roleId = null,
  token,
  platform = null,
  appVersion = null,
  locale = null,
}) => {
  if (!token) {
    throw new AppError("token required", AppError.BAD_REQUEST);
  }

  const now = currentDate();

  try {
    const executor = transactionStorage.getStore() || pool;
    // Check if token already exists for any user
    const [existingTokenCheck] = await executor.query(
      "SELECT * FROM DeviceTokens WHERE token = ?",
      [token],
    );

    // If token exists but belongs to a different user/role
    if (existingTokenCheck?.length > 0) {
      const existingRecord = existingTokenCheck[0];

      // If the existing token belongs to the same user and role, update it
      if (
        existingRecord.userUniqueId === userUniqueId &&
        existingRecord.roleId === roleId
      ) {
        const sql = `UPDATE DeviceTokens SET platform = ?, appVersion = ?, locale = ?, lastSeenAt = ? WHERE token = ?`;
        const [result] = await executor.query(sql, [
          platform,
          appVersion,
          locale,
          now,
          token,
        ]);

        return {
          message: "Device token updated successfully",
          data: {
            affectedRows: result.affectedRows,
            token,
            userUniqueId,
            roleId,
            action: "updated",
          },
        };
      }

      // If token exists for different user/role, update it to the new user/role
      // This handles the case where a device is reassigned to a different user
      const sql = `UPDATE DeviceTokens SET userUniqueId = ?, roleId = ?, platform = ?, appVersion = ?, locale = ?, lastSeenAt = ? WHERE token = ?`;
      const [result] = await executor.query(sql, [
        userUniqueId,
        roleId,
        platform,
        appVersion,
        locale,
        now,
        token,
      ]);

      return {
        message: "Device token reassigned successfully",
        data: {
          affectedRows: result.affectedRows,
          token,
          userUniqueId,
          roleId,
          action: "reassigned",
        },
      };
    }

    // Check if user already has tokens for this role
    const [existingUserTokens] = await executor.query(
      "SELECT * FROM DeviceTokens WHERE userUniqueId = ? AND roleId = ?",
      [userUniqueId, roleId],
    );

    // User has existing tokens for this role - check if we need to insert new or update existing
    if (existingUserTokens.length > 0) {
      // Check if this specific token already exists for this user (shouldn't happen due to unique constraint, but just in case)
      const existingToken = existingUserTokens.find((t) => t.token === token);

      if (existingToken) {
        // Update existing record
        const sql = `UPDATE DeviceTokens SET platform = ?, appVersion = ?, locale = ?, lastSeenAt = ? WHERE token = ?`;
        const [result] = await executor.query(sql, [
          platform,
          appVersion,
          locale,
          now,
          token,
        ]);

        return {
          message: "Device token updated successfully",
          data: {
            affectedRows: result.affectedRows,
            token,
            userUniqueId,
            roleId,
            action: "updated",
          },
        };
      } else {
        // User has other tokens for this role, but this is a new device token
        // Insert new record (user can have multiple devices)
        const deviceTokenUniqueId = uuidv4();
        const sql = `
          INSERT INTO DeviceTokens (
            deviceTokenUniqueId, userUniqueId, token, platform, appVersion, locale, lastSeenAt, roleId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await executor.query(sql, [
          deviceTokenUniqueId,
          userUniqueId,
          token,
          platform,
          appVersion,
          locale,
          now,
          roleId,
        ]);

        return {
          message: "Device token created successfully",
          data: {
            deviceTokenUniqueId,
            userUniqueId,
            token,
            platform,
            appVersion,
            locale,
            action: "created",
          },
        };
      }
    } else {
      // User has no existing tokens for this role - insert new record
      const deviceTokenUniqueId = uuidv4();
      const sql = `
        INSERT INTO DeviceTokens (
          deviceTokenUniqueId, userUniqueId, token, platform, appVersion, locale, lastSeenAt, roleId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await executor.query(sql, [
        deviceTokenUniqueId,
        userUniqueId,
        token,
        platform,
        appVersion,
        locale,
        now,
        roleId,
      ]);

      return {
        message: "Device token created successfully",
        data: {
          deviceTokenUniqueId,
          userUniqueId,
          token,
          platform,
          appVersion,
          locale,
          action: "created",
        },
      };
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError("Token already exists. Please try again.", AppError.BAD_REQUEST);
    }

    throw new AppError(
      error.message || "Failed to register/update device token",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

const getDeviceTokenByUniqueId = async (deviceTokenUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(
    "SELECT * FROM DeviceTokens WHERE deviceTokenUniqueId = ?",
    [deviceTokenUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Device token not found", AppError.NOT_FOUND);
  }
  return { message: "Device token fetched successfully", data: rows[0] };
};

const updateDeviceTokenByUniqueId = async (
  deviceTokenUniqueId,
  { platform = null, appVersion = null, locale = null, revokedAt = undefined },
) => {
  // Build dynamic update
  const fields = [];
  const params = [];

  if (platform !== null) {
    fields.push("platform = ?");
    params.push(platform);
  }
  if (appVersion !== null) {
    fields.push("appVersion = ?");
    params.push(appVersion);
  }
  if (locale !== null) {
    fields.push("locale = ?");
    params.push(locale);
  }
  if (revokedAt !== undefined) {
    fields.push("revokedAt = ?");
    params.push(revokedAt ? currentDate() : null);
  }
  fields.push("lastSeenAt = ?");
  params.push(currentDate());

  if (fields.length === 0) {
    throw new AppError("No fields to update", AppError.BAD_REQUEST);
  }

  const sql = `UPDATE DeviceTokens SET ${fields.join(
    ", ",
  )} WHERE deviceTokenUniqueId = ?`;
  params.push(deviceTokenUniqueId);
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, params);

  if (result.affectedRows === 0) {
    throw new AppError("Device token not found or not updated", AppError.NOT_FOUND);
  }

  return { message: "Device token updated successfully", data: { deviceTokenUniqueId } };
};

const deleteDeviceTokenByUniqueId = async (deviceTokenUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(
    "DELETE FROM DeviceTokens WHERE deviceTokenUniqueId = ?",
    [deviceTokenUniqueId],
  );
  if (result.affectedRows === 0) {
    throw new AppError("Device token not found", AppError.NOT_FOUND);
  }
  return {
    message: `Device token ${deviceTokenUniqueId} deleted`,
    data: null,
  };
};

const getActiveTokensByUser = async (userUniqueId, roleId) => {
  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(
    "SELECT token FROM DeviceTokens WHERE userUniqueId = ? AND revokedAt IS NULL and roleId = ?",
    [userUniqueId, roleId],
  );
  return { message: "Active tokens fetched successfully", data: rows.map((r) => r.token) };
};

// Send FCM notification to specific tokens
const sendNotificationToTokens = async ({
  tokens = [],
  notification = {}, // { title, body }
  data = {},
  android = undefined,
  apns = undefined,
  webpush = undefined,
}) => {
  try {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new AppError("tokens array required", AppError.BAD_REQUEST);
    }

    const message = {
      tokens,
      notification,
      data,
      ...(android ? { android } : {}),
      ...(apns ? { apns } : {}),
      ...(webpush ? { webpush } : {}),
    };

    const response = await messaging.sendEachForMulticast(message);
    return {
      message: "Notifications sent successfully",
      data: {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses?.map((r) => ({
          success: r.success,
          error: r.error
            ? { code: r.error.code, message: r.error.message }
            : null,
        })),
      },
    };
  } catch (error) {
    throw new AppError(
      error?.message || "FCM send failed",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Send FCM notification to all active tokens of a user
const sendFCMNotificationToUser = async ({
  userUniqueId,
  roleId,
  notification = {},
  data = {},
  android = undefined,
  apns = undefined,
  webpush = undefined,
}) => {
  try {
    if (!userUniqueId) {
      throw new AppError("userUniqueId required", AppError.BAD_REQUEST);
    }
    if (!roleId) {
      throw new AppError("roleId required", AppError.BAD_REQUEST);
    }
    const tokensResult = await getActiveTokensByUser(userUniqueId, roleId);
    if (tokensResult.message === "error") {
      throw new AppError(
        tokensResult.error || "FCM send failed",
        tokensResult.statusCode || 500,
      );
    }
    const tokens = tokensResult?.data?.filter(Boolean) || [];
    if (tokens?.length === 0) {
      return {
        message: "No active tokens for user",
        data: {
          info: "No active tokens for user",
          successCount: 0,
          failureCount: 0,
        },
      };
    }

    const result = await sendNotificationToTokens({
      tokens,
      notification,
      data,
      android,
      apns,
      webpush,
    });
    return result;
  } catch (error) {
    throw new AppError(
      error?.message || "FCM send failed",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = {
  upsertDeviceToken,
  getDeviceTokenByUniqueId,
  updateDeviceTokenByUniqueId,
  deleteDeviceTokenByUniqueId,
  getActiveTokensByUser,
  sendNotificationToTokens,
  sendFCMNotificationToUser,
};
