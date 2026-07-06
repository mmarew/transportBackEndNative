"use strict";

const {
  db,
} = require("../CompanyHelper.service");
const { currentDate } = require("../../Utils/CurrentDate");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");

/**
 * ### Single Source of Truth — Create or sync a batch header
 *
 * Called by `createNewShipperRequest` every time a new individual request
 * is added to a batch.  Rules:
 *
 * - **First request in a batch** → INSERT the batch header row.
 * - **Subsequent requests in the same batch** → UPDATE only `totalVehicles`
 *   and `journeyStatusId` so the counter stays accurate.
 *
 * **Junior Note: Why not `ON DUPLICATE KEY UPDATE`?**
 * MySQL pre-increments `AUTO_INCREMENT` BEFORE checking for a duplicate key.
 * If a duplicate is found it rolls back the insert but keeps the incremented
 * counter, creating permanent gaps (e.g. 1, 5, 9…).  The SELECT-first pattern
 * below avoids this entirely: we only reach the INSERT branch when we are
 * certain the row does not yet exist.
 *
 * @param {Object} data - All batch metadata needed for the header row.
 */
exports.upsertBatch = async ({
  batchUniqueId,
  shipperUserUniqueId,
  vehicleTypeUniqueId,
  totalVehicles,
  requestMode,
  targetCompanyUniqueId,
  originLatitude,
  originLongitude,
  originPlace,
  destinationLatitude,
  destinationLongitude,
  destinationPlace,
  shippableItemName,
  shippableItemQtyInQuintal,
  shippingDate,
  deliveryDate,
  shippingCost,
  journeyStatusId,
}) => {
  // 1. Check existence first — avoids AUTO_INCREMENT wastage
  const [existing] = await db().query(
    `SELECT batchId FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
    [batchUniqueId],
  );

  if (existing.length === 0) {
    // First request in this batch → create the header row
    await db().query(
      `INSERT INTO ShipperRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, targetCompanyUniqueId,
         originLatitude, originLongitude, originPlace,
         destinationLatitude, destinationLongitude, destinationPlace,
         shippableItemName, shippableItemQtyInQuintal, shippingDate, deliveryDate,
         shippingCost, journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchUniqueId,
        shipperUserUniqueId,
        vehicleTypeUniqueId,
        totalVehicles,
        requestMode,
        targetCompanyUniqueId,
        originLatitude ?? null,
        originLongitude ?? null,
        originPlace,
        destinationLatitude ?? null,
        destinationLongitude ?? null,
        destinationPlace,
        shippableItemName,
        shippableItemQtyInQuintal,
        shippingDate,
        deliveryDate,
        shippingCost,
        journeyStatusId,
        currentDate(),
      ],
    );

    // ── Real-time notification to company/companies ─────────────────────────
    if (requestMode === "company_target") {
      const {
        sendSocketIONotificationToCompany,
      } = require("../../Utils/Notifications");
      let shipperName = "A shipper";
      if (shipperUserUniqueId) {
        const [[shipperRow]] = await db().query(
          "SELECT fullName FROM Users WHERE userUniqueId = ? LIMIT 1",
          [shipperUserUniqueId],
        );
        if (shipperRow) shipperName = shipperRow.fullName;
      }

      const message = {
        messageTypes: messageTypes.company_batch_available,
        message: "success",
        batchUniqueId,
        shipperName,
        shipperUserUniqueId,
        originPlace,
        destinationPlace,
        shippableItemName,
        shippableItemQtyInQuintal,
        totalVehicles: totalVehicles || 1,
        shippingCost,
        requestMode,
      };

      if (targetCompanyUniqueId) {
        sendSocketIONotificationToCompany({
          companyUniqueId: targetCompanyUniqueId,
          message,
        }).catch((e) =>
          logger.error("WebSocket notification to company failed", {
            error: e.message,
            targetCompanyUniqueId,
          }),
        );
      } else {
        // No specific target — notify all active companies
        const [companies] = await db().query(
          "SELECT companyUniqueId FROM TransportCompany WHERE isDeleted = 0 AND companyDeletedAt IS NULL",
        );
        for (const company of companies) {
          sendSocketIONotificationToCompany({
            companyUniqueId: company.companyUniqueId,
            message,
          }).catch((e) =>
            logger.error("WebSocket notification to company failed", {
              error: e.message,
              companyUniqueId: company.companyUniqueId,
            }),
          );
        }
      }
    }
  } else {
    // Subsequent request in same batch → sync mutable counters only
    await db().query(
      `UPDATE ShipperRequestBatch
         SET totalVehicles = ?, journeyStatusId = ?, batchUpdatedAt = ?
       WHERE batchUniqueId = ?`,
      [totalVehicles, journeyStatusId, currentDate(), batchUniqueId],
    );
  }
};

// ── GET with filters + pagination ─────────────────────────────────────────────
