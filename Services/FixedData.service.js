/**
 * FixedData.service.js
 *
 * Central place to get and hold (cache) fixed/reference data from the database
 * that rarely changes: commission rates, status IDs, etc. Values are loaded
 * once on first access and reused to avoid repeated DB calls.
 */

const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { getAllCommissionRates } = require("./CommissionRates.service");

const cache = {};

/**
 * Generic loader: run the given async loader once, cache by key, return value.
 * @param {string} key - Cache key (e.g. 'commissionRate', 'commissionStatusPaid')
 * @param {() => Promise<any>} loader - Async function that fetches the value
 * @returns {Promise<any>}
 */
async function getCached(key, loader) {
  if (cache[key] !== undefined) {
    return cache[key];
  }
  const value = await loader();
  cache[key] = value;
  return value;
}

/**
 * Clear cached value(s). Useful for tests or after admin updates config.
 * @param {string} [key] - If provided, clear only this key; otherwise clear all.
 */
function clearCache(key) {
  if (key) {
    delete cache[key];
  } else {
    Object.keys(cache).forEach((k) => delete cache[k]);
  }
}

// --- Commission rate (active rate used for new commissions) ---
// Single source of truth: uses CommissionRates.service.getAllCommissionRates

async function getCommissionRateData() {
  return getCached("commissionRate", async () => {
    const result = await getAllCommissionRates({ limit: 1, page: 1 });
    const row = result?.data?.[0];
    if (!row) {
      throw new AppError("Commission rate not found", AppError.NOT_FOUND);
    }
    return {
      commissionRateUniqueId: row.commissionRateUniqueId,
      commissionRateValue: row.commissionRate,
    };
  });
}

// --- Commission status: PAID (used when creating commissions) ---

async function getCommissionStatusPaidId() {
  return getCached("commissionStatusPaid", async () => {
    const [rows] = await pool.query(
      `SELECT commissionStatusUniqueId
       FROM CommissionStatus
       WHERE statusName = 'PAID'
       LIMIT 1`,
      [],
    );
    if (!rows || rows.length === 0) {
      throw new AppError("Commission status 'PAID' not found", AppError.NOT_FOUND);
    }
    return rows[0].commissionStatusUniqueId;
  });
}

// --- Add more fixed data getters below as needed ---
// Example:
// async function getSomeOtherConfig() {
//   return getCached('someKey', async () => { ... });
// }

module.exports = {
  getCommissionRateData,
  getCommissionStatusPaidId,
  getCached,
  clearCache,
};
