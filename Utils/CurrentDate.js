// Get current date/time in East African Time (Addis Ababa, UTC+3)
// Returns a Date object in EAT timezone
const currentDate = () => {
  const now = new Date();

  // More reliable: manually add UTC+3 offset
  // EAT is always UTC+3 (no DST in Ethiopia)
  const eatOffset = 3 * 60; // 3 hours in minutes
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const eatTime = new Date(utcTime + eatOffset * 60000);

  return formatDateTime(eatTime);
};

// Format Date object to MySQL DATETIME format: 'YYYY-MM-DD HH:mm:ss'
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
  const date = new Date(dateStr.replace(" ", "T") + "Z"); // Convert to ISO-like for parsing
  date.setUTCHours(date.getUTCHours() + h);
  return formatDateTime(date);
};
const toDateOnly = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr.toISOString().slice(0, 10);
  if (typeof dateStr === "string") return dateStr.trim().slice(0, 10);
  return null;
};
module.exports = { currentDate, formatDateTime, toDateOnly, addHours };
