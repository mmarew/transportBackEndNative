"use strict";

/**
 * Environment-driven origin allow-lists (CORS, CSRF, Socket.IO).
 *
 * Keeps prod strict and lets the dev sandbox (dev.dynamicsroute.tech) accept
 * localhost + local tooling without ever leaking those into production:
 *
 *   ENABLE_LOCAL_DEV_ORIGINS=true   → allow localhost:5173/:3000 + dev.*
 *   EXTRA_ALLOWED_ORIGINS=...       → additional comma-separated origins
 *
 * Production deploys simply leave these unset, so only *.dynamicsroute.tech
 * frontends are accepted.
 */

const BASE_ORIGINS = [
  "https://app.dynamicsroute.tech",
  "https://company.dynamicsroute.tech",
  "https://admin.dynamicsroute.tech",
  "https://dynamicsroute.tech",
  "https://queue.dynamicsroute.tech",
  "https://account.dynamicsroute.tech",
  "https://association.dynamicsroute.tech",
];

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://dev.dynamicsroute.tech",
];

const getOrigins = () => {
  const origins = [...BASE_ORIGINS];

  if (process.env.ENABLE_LOCAL_DEV_ORIGINS === "true") {
    origins.push(...DEV_ORIGINS);
  }

  if (process.env.EXTRA_ALLOWED_ORIGINS) {
    origins.push(
      ...process.env.EXTRA_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  return origins;
};

/** Full origin strings (scheme + host) for CORS + Socket.IO. */
const allowedOrigins = () => getOrigins();

/** host[:port] forms (no scheme) for the CSRF Origin/Referer allow-list. */
const allowedHosts = () =>
  getOrigins().map((origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  });

module.exports = {
  allowedOrigins,
  allowedHosts,
};
