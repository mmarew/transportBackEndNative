"use strict";

const {
  db,
} = require("../CompanyHelper.service");

/**
 * Soft-delete a batch by stamping `batchDeletedAt`.
 *
 * @param {string} batchUniqueId
 * @returns {Promise<Object>}
 */
exports.deleteBatch = async (batchUniqueId) => {
  const [res] = await db().query(
    `UPDATE ShipperRequestBatch
     SET batchDeletedAt = ?
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL`,
    [currentDate(), batchUniqueId],
  );

  if (res.affectedRows === 0) {
    throw new AppError("Batch not found or already deleted", 404);
  }

  return { message: "success", data: "Batch deleted" };
};

// ── CANCEL (company batch) ────────────────────────────────────────────────────────
