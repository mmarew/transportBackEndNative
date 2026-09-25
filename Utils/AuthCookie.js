"use strict";

const Config = require("./Config");

const COOKIE_NAME = "token";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h, matches JWT expiry

/**
 * Sets the session token as an httpOnly cookie (dual-mode auth).
 *
 * The cookie is host-only (no Domain attribute): each app sets it through
 * its own API host, preserving the existing per-app token isolation.
 * SameSite=Lax blocks cross-site form/script POSTs from carrying it (CSRF).
 * Secure is enabled only in production (localhost dev uses http).
 */
const setAuthCookie = (res, token) => {
  if (!res || !token) return;
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
};

/** Clears the session cookie (logout / phone-change revocation). */
const clearAuthCookie = (res) => {
  if (!res || typeof res.clearCookie !== "function") return;
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
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