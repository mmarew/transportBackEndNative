/**
 * CURRENT DATE — East African Time (UTC+3)
 *
 * All timestamps in the system use EAT as the standard timezone.
 * Single source of truth: Utils/Timezone.js → EAT_OFFSET_HOURS
 *
 * MySQL pool timezone is set to '+03:00' to match.
 * Frontend parses timestamps as EAT.
 */

const { EAT_OFFSET_HOURS } = require("./Timezone");

// Get current date/time in East African Time (UTC+3)
// Returns MySQL DATETIME format: 'YYYY-MM-DD HH:mm:ss'
const currentDate = () => {
  const now = new Date();
  // Convert to EAT: UTC + 3 hours
  const eatTime = new Date(now.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000);
  return formatDateTime(eatTime);
};

// Format Date object to MySQL DATETIME format: 'YYYY-MM-DD HH:mm:ss' (UTC-based)
const formatDateTime = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const addHours = (dateStr, h) => {
  const date = new Date(dateStr.replace(" ", "T") + "Z"); // Parse as UTC
  date.setUTCHours(date.getUTCHours() + h);
  return formatDateTime(date);
};

/**
 * Current EAT time minus `minutes`, as a MySQL DATETIME string.
 * Same timezone domain as currentDate(), so it can be compared directly
 * against stored DATETIME columns.
 */
const minutesAgo = (minutes) => {
  const now = new Date();
  const eatTime = new Date(now.getTime() + EAT_OFFSET_HOURS * 60 * 60 * 1000 - minutes * 60 * 1000);
  return formatDateTime(eatTime);
};

const toDateOnly = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr.toISOString().slice(0, 10);
  if (typeof dateStr === "string") return dateStr.trim().slice(0, 10);
  return null;
};

module.exports = { currentDate, formatDateTime, toDateOnly, addHours, minutesAgo };
