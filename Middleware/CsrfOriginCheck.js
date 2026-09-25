"use strict";

const AppError = require("../Utils/AppError");
const { cookieIsPresent } = require("../Utils/AuthCookie");

/**
 * CSRF defense-in-depth for cookie-authenticated sessions.
 *
 * The session cookie is SameSite=None in production so every frontend can
 * reach the shared hub (app.dynamicsroute.tech), including cross-site dev
 * from localhost:5173. With None we cannot rely on SameSite, so THIS
 * Origin/Referer allow-list is the primary CSRF defense: for any
 * state-changing request that arrives WITH the session cookie, the Origin
 * (or Referer) host must match one of our own frontend origins. Requests
 * with no session cookie (e.g. the mobile apps, which use a Bearer header
 * instead) are passed through.
 */
const csrfOriginCheck = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  if (!cookieIsPresent(req)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // No Origin/Referer (e.g. non-browser client) — leave to auth layer.
    return next();
  }

  let host;
  try {
    host = new URL(origin).host;
  } catch (error) {
    return next(new AppError("Invalid request origin", AppError.FORBIDDEN));
  }

  const allowedHosts = [
    "company.dynamicsroute.tech",
    "admin.dynamicsroute.tech",
    "dynamicsroute.tech",
    "queue.dynamicsroute.tech",
    "account.dynamicsroute.tech",
    "association.dynamicsroute.tech",
    "localhost:5173",
    "localhost:3000",
  ];
  if (!allowedHosts.includes(host)) {
    return next(
      new AppError("Cross-site request rejected", AppError.FORBIDDEN),
    );
  }
  return next();
};

module.exports = csrfOriginCheck;