"use strict";

const {
  db,
} = require("../CompanyHelper.service");

/**
 * ### Partial Update — "Update only what I give you"
 *
 * **Junior Note: Dynamic SET Clause**
 * Instead of a fixed `SET col1=?, col2=?, ...` that would overwrite every
 * field on every call, we build the SET clause from scratch using only the
 * keys present in `fields`.  The result:
 *   - Caller sends `{ shippingCost: 500 }`  → only `shippingCost` changes.
 *   - Caller sends `{ originPlace: "...", totalVehicles: 3 }` → only those two change.
 *   - Nothing else is touched.
 *
 * @param {string} batchUniqueId  - The batch to update (from URL params).
 * @param {Object} fields         - Validated body fields (at least 1 key).
 * @returns {Promise<Object>}
 */
exports.updateBatch = async (batchUniqueId, fields) => {
  // 1. Confirm it exists and is not deleted
  const batch = await findOne(
    "ShipperRequestBatch",
    { batchUniqueId },
    "Shipper request batch not found",
  );
  if (batch.batchDeletedAt) {
    throw new AppError("Batch has already been deleted", 400);
  }

  // 2. Build the SET clause from whitelisted keys only
  const setClauses = [];
  const setValues = [];

  for (const col of UPDATABLE_COLS) {
    if (Object.prototype.hasOwnProperty.call(fields, col)) {
      setClauses.push(`${col} = ?`);
      setValues.push(fields[col]);
    }
  }

  // Defensive guard (schema.min(1) should already prevent this)
  if (setClauses.length === 0) {
    throw new AppError("No valid fields supplied for update", 400);
  }

  // Always stamp the audit columns
  setClauses.push("batchUpdatedAt = ?");
  setValues.push(currentDate());

  // 3. Execute
  const [res] = await db().query(
    `UPDATE ShipperRequestBatch SET ${setClauses.join(", ")} WHERE batchUniqueId = ?`,
    [...setValues, batchUniqueId],
  );

  if (res.affectedRows === 0) {
    throw new AppError("Batch update failed", 500);
  }

  return { message: "success", data: { batchUniqueId, updated: fields } };
};

// ── Soft DELETE ───────────────────────────────────────────────────────────────
