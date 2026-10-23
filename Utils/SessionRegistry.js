"use strict";

/**
 * Server-side session registry.
 *
 * A successful login inserts one `UserSessions` row and the JWT carries its
 * `sessionUniqueId` as the `sid` claim. `Middleware/VerifyToken` requires that
 * row to be present, unrevoked and unexpired, so signing out (or revoking a
 * device) invalidates the token immediately instead of waiting for `exp`.
 *
 * This module is intentionally dependency-light: it only uses the shared CRUD
 * helpers and the pool, so both the HTTP middleware and the socket handshake
 * can call it without pulling in controllers.
 */

const { v4: uuidv4 } = require("uuid");
const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { getSessionTtlMs } = require("./SessionPolicy");
const { currentDate, formatDateTime, minutesAgo } = require("./CurrentDate");
const { EAT_OFFSET_MS } = require("./Timezone");

const TABLE = "UserSessions";

const SESSION_PLATFORMS = Object.freeze(["ios", "android", "web", "unknown"]);

const SESSION_REVOKE_REASONS = Object.freeze({
  LOGOUT: "logout",
  LOGOUT_ALL: "logout_all",
  ADMIN_REVOKE: "admin_revoke",
  PHONE_CHANGE: "phone_change",
  EXPIRED: "expired",
});

// Default retention for expired/revoked rows. Kept long enough that support can
// answer "was this device signed out?" questions, short enough to bound growth.
const DEFAULT_RETENTION_DAYS = 30;

const normalizePlatform = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return SESSION_PLATFORMS.includes(normalized) ? normalized : "unknown";
};

const truncate = (value, maxLength) => {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length > maxLength ? str.slice(0, maxLength) : str;
};

/** Normalizes `::ffff:1.2.3.4` to `1.2.3.4`; caps at VARCHAR(45). */
const normalizeIp = (ip) => {
  if (!ip) return null;
  const str = String(ip).trim();
  return truncate(str.startsWith("::ffff:") ? str.slice(7) : str, 45);
};

const isExpired = (expiresAt) => {
  if (!expiresAt) return true;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now();
};

const isRevoked = (session) => Boolean(session?.revokedAt);

/**
 * Builds the client metadata stored with a session.
 *
 * Mobile apps send `X-Client-Platform`, `X-Client-Version`, `X-Client-Device`
 * and `X-Client-Locale`; browsers send none of them, so a request carrying the
 * session cookie (or an Origin header) is classified as `web`.
 */
const clientMetaFromRequest = (req) => {
  if (!req) {
    return { platform: "unknown" };
  }
  const headers = req.headers || {};
  const cookiePresent = Boolean(req.cookies && req.cookies.token);
  const originPresent = Boolean(headers.origin || headers.referer);

  let platform = headers["x-client-platform"];
  if (!platform) {
    platform = cookiePresent || originPresent ? "web" : "unknown";
  }

  const locale =
    headers["x-client-locale"] ||
    (headers["accept-language"] ? String(headers["accept-language"]).split(",")[0] : null);

  return {
    platform: normalizePlatform(platform),
    deviceName: truncate(headers["x-client-device"], 128),
    appVersion: truncate(headers["x-client-version"], 32),
    locale: truncate(locale, 16),
    ipAddress: normalizeIp(req.ip),
    userAgent: truncate(headers["user-agent"], 512),
  };
};

/**
 * Creates a session row and returns the `sid` to embed in the JWT.
 *
 * @param {object} params
 * @param {string} params.userUniqueId
 * @param {number|string} params.roleId
 * @param {string} [params.platform] - ios | android | web | unknown
 * @param {string} [params.deviceName]
 * @param {string} [params.deviceModel]
 * @param {string} [params.appVersion]
 * @param {string} [params.locale]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<{sessionUniqueId: string, expiresAt: string, ttlMs: number}>}
 */
const createSession = async ({
  userUniqueId,
  roleId,
  platform,
  deviceName,
  deviceModel,
  appVersion,
  locale,
  ipAddress,
  userAgent,
}) => {
  if (!userUniqueId || !roleId) {
    throw new Error("userUniqueId and roleId are required to create a session");
  }

  const sessionUniqueId = uuidv4();
  const ttlMs = getSessionTtlMs(roleId);
  // Stored as EAT wall-clock DATETIME, matching every other timestamp column.
  const expiresAt = formatDateTime(new Date(Date.now() + ttlMs + EAT_OFFSET_MS));

  await insertData({
    tableName: TABLE,
    colAndVal: {
      sessionUniqueId,
      userUniqueId,
      roleId,
      platform: normalizePlatform(platform),
      deviceName: truncate(deviceName, 128),
      deviceModel: truncate(deviceModel, 128),
      appVersion: truncate(appVersion, 32),
      locale: truncate(locale, 16),
      ipAddress: normalizeIp(ipAddress),
      userAgent: truncate(userAgent, 512),
      lastSeenAt: currentDate(),
      expiresAt,
    },
  });

  return { sessionUniqueId, expiresAt, ttlMs };
};

/** Fetches one session row (or null). */
const getSession = async (sessionUniqueId) => {
  if (!sessionUniqueId) return null;
  const rows = await getData({
    tableName: TABLE,
    conditions: { sessionUniqueId },
    limit: 1,
  });
  return rows && rows.length > 0 ? rows[0] : null;
};

/**
 * Returns the live session row, or null when it is missing, belongs to a
 * different user, was revoked, or has expired.
 */
const validateSession = async (sessionUniqueId, userUniqueId) => {
  const session = await getSession(sessionUniqueId);
  if (!session) return null;
  if (userUniqueId && session.userUniqueId !== userUniqueId) return null;
  if (isRevoked(session)) return null;
  if (isExpired(session.expiresAt)) return null;
  return session;
};

/** True when the session exists, belongs to the user and is still live. */
const isSessionActive = async (sessionUniqueId, userUniqueId) =>
  Boolean(await validateSession(sessionUniqueId, userUniqueId));

/** Updates `lastSeenAt`; callers throttle (see VerifyToken) to avoid writes. */
const touchSession = async (sessionUniqueId) => {
  if (!sessionUniqueId) return;
  await updateData({
    tableName: TABLE,
    updateValues: { lastSeenAt: currentDate() },
    conditions: { sessionUniqueId },
  });
};

/**
 * Revokes one session. Ownership is part of the WHERE clause, so a user can
 * never revoke another user's row by guessing a UUID.
 *
 * @returns {Promise<boolean>} true when a live row was revoked
 */
const revokeSession = async ({ sessionUniqueId, userUniqueId, reason }) => {
  if (!sessionUniqueId) return false;
  const session = await getSession(sessionUniqueId);
  if (!session) return false;
  if (userUniqueId && session.userUniqueId !== userUniqueId) return false;
  if (isRevoked(session)) {
    // Idempotent, but still make sure no socket is left attached to a row that
    // was revoked earlier (e.g. by another process).
    require("./SessionSocket").disconnectSessionSockets(sessionUniqueId);
    return true;
  }

  await updateData({
    tableName: TABLE,
    updateValues: {
      revokedAt: currentDate(),
      revokedReason: truncate(reason, 64) || SESSION_REVOKE_REASONS.LOGOUT,
    },
    conditions: { sessionUniqueId, userUniqueId: session.userUniqueId },
  });

  // Revocation is effective immediately for live sockets too, not only for the
  // next HTTP request.
  require("./SessionSocket").disconnectSessionSockets(sessionUniqueId);
  return true;
};

/** Every live (unrevoked, unexpired) session for a user, newest first. */
const listActiveSessions = async (userUniqueId) => {
  if (!userUniqueId) return [];
  const rows = await getData({
    tableName: TABLE,
    conditions: { userUniqueId },
    orderBy: "sessionCreatedAt",
    orderDirection: "DESC",
  });
  return (rows || []).filter((row) => !isRevoked(row) && !isExpired(row.expiresAt));
};

/**
 * Revokes every live session for a user, optionally sparing the caller's own.
 *
 * `updateData` supports `IN` but not `!=`, so the excepted id is filtered out
 * in JS before issuing a single `IN (...)` update.
 *
 * @returns {Promise<number>} number of rows revoked
 */
const revokeAllSessions = async ({
  userUniqueId,
  exceptSessionUniqueId,
  reason,
}) => {
  if (!userUniqueId) return 0;
  const active = await listActiveSessions(userUniqueId);
  const ids = active
    .map((row) => row.sessionUniqueId)
    .filter((id) => id !== exceptSessionUniqueId);

  if (ids.length === 0) return 0;

  const result = await updateData({
    tableName: TABLE,
    updateValues: {
      revokedAt: currentDate(),
      revokedReason: truncate(reason, 64) || SESSION_REVOKE_REASONS.LOGOUT_ALL,
    },
    conditions: { sessionUniqueId: ids },
  });

  const { disconnectSessionSockets } = require("./SessionSocket");
  ids.forEach((id) => disconnectSessionSockets(id));

  return result?.affectedRows || 0;
};

/**
 * Deletes sessions that expired or were revoked longer than `retentionDays`
 * ago. Cutoffs are computed in the same EAT wall-clock domain as the stored
 * values, so this does not depend on the MySQL server's timezone.
 */
const cleanupSessions = async ({ retentionDays = DEFAULT_RETENTION_DAYS } = {}) => {
  const days = Number.isFinite(Number(retentionDays))
    ? Math.max(0, Number(retentionDays))
    : DEFAULT_RETENTION_DAYS;
  const cutoff = minutesAgo(days * 24 * 60);

  const [result] = await pool.query(
    `DELETE FROM ${TABLE}
     WHERE expiresAt < ?
        OR (revokedAt IS NOT NULL AND revokedAt < ?)`,
    [cutoff, cutoff],
  );
  return result?.affectedRows || 0;
};

module.exports = {
  SESSION_PLATFORMS,
  SESSION_REVOKE_REASONS,
  DEFAULT_RETENTION_DAYS,
  normalizePlatform,
  normalizeIp,
  clientMetaFromRequest,
  createSession,
  getSession,
  validateSession,
  isSessionActive,
  touchSession,
  revokeSession,
  listActiveSessions,
  revokeAllSessions,
  cleanupSessions,
};
