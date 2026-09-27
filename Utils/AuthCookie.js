"use strict";

const jwt = require("jsonwebtoken");
const Config = require("./Config");
const { getSessionTtlMs } = require("./SessionPolicy");

const COOKIE_NAME = "token";

/**
 * Sets the session token as an httpOnly cookie (dual-mode auth).
 *
 * The cookie is host-only (no Domain attribute): each app sets it through
 * its own API host, preserving the existing per-app token isolation.
 *
 * Lifetime follows the ROLE of the authenticated user (see SessionPolicy):
 * system admins (roles 3 & 6) keep a short TTL, everyone else gets the long
 * TTL — so the cookie expiry always matches the JWT expiry it carries.
 *
 * Attributes follow the TRANSPORT, not NODE_ENV:
 *  - HTTPS (the shared hub, app.dynamicsroute.tech, or any https deployment):
 *    SameSite=None + Secure + Partitioned so every frontend can reach it,
 *    including cross-site development from localhost:5173. Partitioned
 *    (CHIPS) keeps it working under Chromium's third-party cookie blocking.
 *    CSRF defense is enforced by the Origin/Referer allow-list
 *    (Middleware/CsrfOriginCheck.js).
 *  - HTTP (local backend, http://localhost:3000): SameSite=Lax, no Secure —
 *    SameSite=None would be rejected without Secure over http.
 */
const setAuthCookie = (res, token) => {
  if (!res || !token) return;
  const secure = Boolean(res?.req?.secure);

  // Read roleId from the token payload (decode only — no verification needed
  // here) so the cookie lifetime matches the JWT's role-based expiry.
  let roleId;
  try {
    const decoded = jwt.decode(token);
    roleId = decoded?.data?.roleId;
  } catch {
    roleId = undefined;
  }
  const maxAge = getSessionTtlMs(roleId);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    maxAge,
    path: "/",
  });
};

/** Clears the session cookie (logout / phone-change revocation). */
const clearAuthCookie = (res) => {
  if (!res || typeof res.clearCookie !== "function") return;
  const secure = Boolean(res?.req?.secure);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/",
  });
};

/** Reads the session token from request (cookie or Authorization header). */
const getTokenFromRequest = (req) => {
  if (!req) return null;
  if (req?.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

const cookieIsPresent = (req) =>
  Boolean(req?.cookies && req.cookies[COOKIE_NAME]);

module.exports = {
  COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  getTokenFromRequest,
  cookieIsPresent,
};