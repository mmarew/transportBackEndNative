"use strict";

const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");

// ── Updatable columns (whitelist) ─────────────────────────────────────────────
// Only these fields may be changed via PATCH. The order does not matter.
const UPDATABLE_COLS = [
  "totalVehicles",
  "requestMode",
  "targetCompanyUniqueId",
  "vehicleTypeUniqueId",
  "originPlace",
  "destinationPlace",
  "shippableItemName",
  "shippableItemQtyInQuintal",
  "shippingDate",
  "deliveryDate",
  "shippingCost",
  "journeyStatusId",
];

// ── Cancellation reason guard ────────────────────────────────────────────────
const assertCompanyCancellationReason = async (cancellationReasonsTypeId) => {
  if (!cancellationReasonsTypeId) {
    return;
  } // optional field — nothing to validate

  const [rows] = await db().query(
    `SELECT cancellationReasonsTypeId, cancellationReason, requestMode
       FROM CancellationReasonsType
      WHERE cancellationReasonsTypeId = ?
        AND cancellationReasonTypeDeletedAt IS NULL
      LIMIT 1`,
    [cancellationReasonsTypeId],
  );

  if (!rows || rows.length === 0) {
    throw new AppError(
      `Cancellation reason ID ${cancellationReasonsTypeId} not found`,
      AppError.NOT_FOUND,
    );
  }

  const reason = rows[0];
  if (reason.requestMode === "individual") {
    throw new AppError(
      `Cancellation reason "${reason.cancellationReason}" is only valid for individual requests, not company freight batches. ` +
        `Please choose a reason with requestMode 'company' or 'both'.`,
      AppError.BAD_REQUEST,
    );
  }
};

module.exports = {
  UPDATABLE_COLS,
  assertCompanyCancellationReason,
};
