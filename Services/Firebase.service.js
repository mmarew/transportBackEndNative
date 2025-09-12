const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { messaging } = require("../Config/FirebaseAdmin");

// Service for managing DeviceTokens table

// Upsert a device token by raw token value
const upsertDeviceToken = async ({
  userUniqueId = null,
  roleId = null,
  token,
  platform = null,
  appVersion = null,
  locale = null,
}) => {
  if (!token) {
    return { message: "error", error: "token required" };
  }
  const now = new Date();
  // Check if user has token  in this role
  const [existing] = await pool.query(
    "SELECT * FROM DeviceTokens WHERE userUniqueId = ? and roleId = ?",
    [userUniqueId, roleId]
  );

  // if token existed check if token is the same
  if (existing.length > 0 && existing[0].token == token) {
    return { message: "error", error: "token already exists" };
  }

  //if record   existed but with different token, update it

  if (existing.length > 0 && existing[0].token !== token) {
    // Update existing record
    const sql = ` UPDATE DeviceTokens  SET token=? WHERE userUniqueId = ? and roleId = ? `;
    const [result] = await pool.query(sql, [token, userUniqueId, roleId]);

    return {
      message: "success",
      data: {
        affectedRows: result.affectedRows,
        token,
        userUniqueId,
        roleId,
      },
    };
  } else {
    const deviceTokenUniqueId = uuidv4();
    const sql = `
      INSERT INTO DeviceTokens (
        deviceTokenUniqueId, userUniqueId, token, platform, appVersion, locale, lastSeenAt, roleId
      ) VALUES (?, ?, ?, ?, ?, ?, ?,?)
    `;
    const [result] = await pool.query(sql, [
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
      message: "success",
      data: {
        deviceTokenUniqueId,
        userUniqueId,
        token,
        platform,
        appVersion,
        locale,
      },
    };
  }
};

const getDeviceTokenByUniqueId = async (deviceTokenUniqueId) => {
  const [rows] = await pool.query(
    "SELECT * FROM DeviceTokens WHERE deviceTokenUniqueId = ?",
    [deviceTokenUniqueId]
  );
  if (rows.length === 0)
    return { message: "error", error: "Device token not found" };
  return { message: "success", data: rows[0] };
};

const updateDeviceTokenByUniqueId = async (
  deviceTokenUniqueId,
  { platform = null, appVersion = null, locale = null, revokedAt = undefined }
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
    params.push(revokedAt ? new Date() : null);
  }
  fields.push("lastSeenAt = ?");
  params.push(new Date());

  if (fields.length === 0) {
    return { message: "error", error: "No fields to update" };
  }

  const sql = `UPDATE DeviceTokens SET ${fields.join(
    ", "
  )} WHERE deviceTokenUniqueId = ?`;
  params.push(deviceTokenUniqueId);
  const [result] = await pool.query(sql, params);

  if (result.affectedRows === 0)
    return { message: "error", error: "Device token not found or not updated" };

  return { message: "success", data: { deviceTokenUniqueId } };
};

const deleteDeviceTokenByUniqueId = async (deviceTokenUniqueId) => {
  const [result] = await pool.query(
    "DELETE FROM DeviceTokens WHERE deviceTokenUniqueId = ?",
    [deviceTokenUniqueId]
  );
  if (result.affectedRows === 0)
    return { message: "error", error: "Device token not found" };
  return {
    message: "success",
    data: `Device token ${deviceTokenUniqueId} deleted`,
  };
};

const getActiveTokensByUser = async (userUniqueId, roleId) => {
  const [rows] = await pool.query(
    "SELECT token FROM DeviceTokens WHERE userUniqueId = ? AND revokedAt IS NULL and roleId = ?",
    [userUniqueId, roleId]
  );
  return { message: "success", data: rows.map((r) => r.token) };
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
      return { message: "error", error: "tokens array required" };
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
      message: "success",
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
    console.error("Error sending FCM to tokens:", error);
    return { message: "error", error: error?.message || "FCM send failed" };
  }
};

// Send FCM notification to all active tokens of a user
const sendNotificationToUser = async ({
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
      return { message: "error", error: "userUniqueId required" };
    }
    if (!roleId) {
      return { message: "error", error: "roleId required" };
    }
    const tokensResult = await getActiveTokensByUser(userUniqueId, roleId);
    if (tokensResult.message === "error") return tokensResult;
    const tokens = tokensResult.data.filter(Boolean);
    if (tokens.length === 0) {
      return {
        message: "success",
        data: {
          info: "No active tokens for user",
          successCount: 0,
          failureCount: 0,
        },
      };
    }

    return await sendNotificationToTokens({
      tokens,
      notification,
      data,
      android,
      apns,
      webpush,
    });
  } catch (error) {
    console.error("Error sending FCM to user:", error);
    return { message: "error", error: error?.message || "FCM send failed" };
  }
};

module.exports = {
  upsertDeviceToken,
  getDeviceTokenByUniqueId,
  updateDeviceTokenByUniqueId,
  deleteDeviceTokenByUniqueId,
  getActiveTokensByUser,
  sendNotificationToTokens,
  sendNotificationToUser,
};
