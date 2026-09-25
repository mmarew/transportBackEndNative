"use strict";

const Config = require("./Config");

const COOKIE_NAME = "token";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h, matches JWT expiry

/**
 * Sets the session token as an httpOnly cookie (dual-mode auth).
 *
 * The cookie is host-only (no Domain attribute): each app sets it through
 * its own API host, preserving the existing per-app token isolation.
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
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    maxAge: SESSION_MAX_AGE_MS,
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
  SESSION_MAX_AGE_MS,
  setAuthCookie,
  clearAuthCookie,
  getTokenFromRequest,
  cookieIsPresent,
};