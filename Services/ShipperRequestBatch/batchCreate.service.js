"use strict";

const { db } = require("../CompanyHelper.service");
const { currentDate } = require("../../Utils/CurrentDate");
const messageTypes = require("../../Utils/MessageTypes");
const { usersRoles } = require("../../Utils/ListOfSeedData");
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

      const [[batch]] = await db().query(
        `SELECT b.batchUniqueId,
                b.batchUniqueId AS shipperRequestBatchId,
                b.batchId,
                b.originPlace, b.originLatitude, b.originLongitude,
                b.destinationPlace, b.destinationLatitude, b.destinationLongitude,
                b.shippableItemName, b.shippableItemQtyInQuintal,
                b.totalVehicles,
                b.shippingCost AS batchShippingCost,
                b.shippingDate AS batchShippingDate,
                b.deliveryDate AS batchDeliveryDate,
                b.journeyStatusId, b.requestMode, b.batchCreatedAt,
                u.fullName AS shipperName,
                vt.vehicleTypeName,
                js.journeyStatusName
         FROM ShipperRequestBatch b
         LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
         LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
         LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
         WHERE b.batchUniqueId = ?`,
        [batchUniqueId],
      );

      const shipperName = batch?.shipperName || "A shipper";
      const message = {
        messageTypes: messageTypes.company_batch_available,
        message: "New batch available",
        notification: {
          title: "New Freight Batch Available",
          body: `${shipperName} has posted a new freight job for your company.`,
        },
        data: batch || null,
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
        // Broadcast to all connected company sockets directly
        // (no DB query needed — WSPusher already stores sockets in memory)
        const { socketIO } = require("../../Utils/WsServerResponder");
        const io = socketIO.io;
        if (io) {
          for (const sock of io.sockets.sockets.values()) {
            if (sock.userType === "company") {
              sock.emit("messages", JSON.stringify(message));
            }
          }
        }

        // Fire-and-forget FCM to all company admins as offline fallback
        const { sendFCMNotificationToUser } = require("../Firebase.service");
        const [rows] = await db()
          .query(
            `SELECT u.userUniqueId
           FROM TransportCompany tc
           JOIN Users u ON tc.companyCreatedBy = u.userUniqueId
           WHERE tc.isDeleted = 0 AND tc.companyDeletedAt IS NULL`,
          );
        for (const row of rows) {
          sendFCMNotificationToUser({
            userUniqueId: row.userUniqueId,
            roleId: usersRoles.companyAdminRoleId,
            notification: {
              title: "New Freight Batch Available",
              body: `${shipperName} has posted a new freight job for your company.`,
            },
            data: {
              type: "company_batch_available",
              batchUniqueId,
            },
          }).catch((e) =>
            logger.warn("FCM fallback failed for company admin", {
              error: e.message,
              userUniqueId: row.userUniqueId,
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
