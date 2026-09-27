"use strict";

const Config = require("./Config");
const { usersRoles } = require("./ListOfSeedData");

// System admins keep a short session TTL; every other role (drivers, shippers,
// company admins, queue org admins, dispatchers, ...) gets the long TTL from
// env (SESSION_TTL_OTHERS, default 365d).
const ADMIN_ROLE_IDS = new Set([
  usersRoles.adminRoleId,
  usersRoles.supperAdminRoleId,
]);

// jsonwebtoken surface: parse the env TTL to a per-role value.
const getSessionTtl = (roleId) => {
  const normalized = Number(roleId);
  if (ADMIN_ROLE_IDS.has(normalized)) {
    return Config.SESSION_TTL_ADMINS;
  }
  return Config.SESSION_TTL_OTHERS;
};

// Helper to convert a token-lifetime string ("24h", "365d") into seconds or ms.
// Supports units: s, m, h, d, w, y (single or grouped like 1y30d).
const parseTokenLifetime = (value) => {
  const str = String(value || "").trim();
  if (!str) {
    return null;
  }
  const match = str.match(/(\d+)\s*([smhdwy])/gi);
  if (!match) {
    return null;
  }
  const unitMs = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };
  let totalMs = 0;
  for (const part of match) {
    const m = part.match(/(\d+)\s*([smhdwy])/i);
    totalMs += Number(m[1]) * unitMs[m[2].toLowerCase()];
  }
  return totalMs;
};

const getSessionTtlMs = (roleId) => {
  const ms = parseTokenLifetime(getSessionTtl(roleId));
  return ms === null ? 24 * 60 * 60 * 1000 : ms;
};

const getSessionTtlSeconds = (roleId) => Math.floor(getSessionTtlMs(roleId) / 1000);

module.exports = {
  getSessionTtl,
  getSessionTtlMs,
  getSessionTtlSeconds,
  parseTokenLifetime,
  ADMIN_ROLE_IDS,
};