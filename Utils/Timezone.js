/**
 * EAST AFRICAN TIME (EAT) — UTC+3
 *
 * Single source of truth for the timezone standard across all layers:
 *   Backend  → currentDate() returns EAT as 'YYYY-MM-DD HH:mm:ss'
 *   MySQL    → pool timezone set to '+03:00'
 *   Frontend → parses timestamps as EAT, displays in local EAT
 *
 * Ethiopia has no DST — EAT is always UTC+3.
 */

const EAT_OFFSET_HOURS = 3;
const EAT_OFFSET_MS = EAT_OFFSET_HOURS * 60 * 60 * 1000;
const EAT_TIMEZONE_STRING = `+0${EAT_OFFSET_HOURS}:00`; // for MySQL: '+03:00'

module.exports = { EAT_OFFSET_HOURS, EAT_OFFSET_MS, EAT_TIMEZONE_STRING };
