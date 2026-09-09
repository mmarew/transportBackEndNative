"use strict";

const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { pool } = require("../../Middleware/Database.config");

const {
  sendSocketIONotificationToDriver,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");

const { updateJourneyStatus } = require("../JourneyStatus");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");

const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { verifyShipperStatus } = require("./statusVerification.service");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");

const { verifyDriverJourneyStatus } = require("../DriverRequest");
// Lazy require or internal check
// const { verifyDriverJourneyStatus } = require("../DriverRequest.service");

/**
 * Accepts a driver's request/offer
 * @param {Object} body - Request body
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @param {string} body.driverRequestUniqueId - Driver request unique ID
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @returns {Promise<Object>} Shipper status after acceptance
 */

// Lazy require or internal check
// const { verifyDriverJourneyStatus } = require("../DriverRequest.service");
const { PAGINATION } = require("../../Utils/Constants");

/**
 * Accepts a driver's request/offer
 * @param {Object} body - Request body
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @param {string} body.driverRequestUniqueId - Driver request unique ID
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @returns {Promise<Object>} Shipper status after acceptance
 */
const acceptDriverOffer = async (body) => {
  try {
    logger.debug("acceptDriverOffer ~ body:", body);
    const {
      shipperRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      userUniqueId,
      roleId,
    } = body;

    // Validate required fields
    if (
      !shipperRequestUniqueId ||
      !driverRequestUniqueId ||
      !journeyDecisionUniqueId ||
      !userUniqueId
    ) {
      throw new AppError(
        "shipperRequestUniqueId, driverRequestUniqueId, journeyDecisionUniqueId, and userUniqueId are required",
        AppError.BAD_REQUEST,
      );
    }
    return await executeInTransaction(async () => {
      const executor = transactionStorage.getStore() || pool;

      // A Queue Org Admin (role 11) may approve the winning bid for an order
      // belonging to a queue organization they actively manage — mirroring the
      // `approveBidding` authorization. The shipper remains the order owner.
      const isQueueOrgAdmin =
        roleId === usersRoles.queueOrgAdminRoleId;
      let orderCondition;
      if (isQueueOrgAdmin) {
        const [[orderRow]] = await executor.query(
          `SELECT srb.queueOrganizationUniqueId
             FROM ShipperRequest sr
             INNER JOIN ShipperRequestBatch srb
               ON sr.shipperRequestBatchUniqueId = srb.batchUniqueId
            WHERE sr.shipperRequestUniqueId = ?
              AND sr.shipperRequestDeletedAt IS NULL`,
          [shipperRequestUniqueId],
        );
        const orgUniqueId = orderRow?.queueOrganizationUniqueId;
        if (!orgUniqueId) {
          throw new AppError(
            "Order is not a queue order; only its shipper can accept a bid",
            AppError.FORBIDDEN,
          );
        }
        const [memberships] = await executor.query(
          `SELECT 1 FROM QueueOrganizationMembership
            WHERE queueOrganizationUniqueId = ?
              AND userUniqueId = ? AND roleId = ? AND isActive = TRUE
            LIMIT 1`,
          [orgUniqueId, userUniqueId, usersRoles.queueOrgAdminRoleId],
        );
        if (memberships.length === 0) {
          throw new AppError(
            "You are not authorized to accept a bid for this order",
            AppError.FORBIDDEN,
          );
        }
        orderCondition = {
          "ShipperRequest.shipperRequestUniqueId": shipperRequestUniqueId,
        };
      } else {
        orderCondition = { "ShipperRequest.userUniqueId": userUniqueId };
      }

      // Queue-entry bookkeeping (markEntryAgreed / releaseEntryForUnselectedBidder)
      // only ever touches DriverQueue for queue-linked orders. Non-queue orders
      // (street / nearby / batch / socket) have no DriverQueue rows, so the
      // accepting driver must NOT be routed into the queue logic — a missed
      // linked entry would otherwise 409 the whole accept. queueOrganizationUniqueId
      // is BATCH-CANONICAL (per-order column dropped), read via the batch join.
      const [[orderFlags]] = await executor.query(
        `SELECT srb.queueOrganizationUniqueId, sr.isBiddingApproved
           FROM ShipperRequest sr
           LEFT JOIN ShipperRequestBatch srb
             ON sr.shipperRequestBatchUniqueId = srb.batchUniqueId
          WHERE sr.shipperRequestUniqueId = ?`,
        [shipperRequestUniqueId],
      );
      const isQueueOrder = Boolean(orderFlags?.queueOrganizationUniqueId);

      // Fetch ALL open bids for this order — both status 2 (requested) and status 3 (acceptedByDriver).
      // Without this, bids still at status 2 (not yet interacted with) are skipped and never marked
      // as `notSelectedInBid`, leaving stale decisions in the DB with an incorrect status.
      const connectedDrivers = await performJoinSelect({
        baseTable: "DriverRequest",
        selectColumns:
          "DriverRequest.*, Users.phoneNumber, DriverRequest.userUniqueId AS driverUserUniqueId, ShipperRequest.userUniqueId AS shipperUserUniqueId, ShipperRequest.shipperRequestUniqueId, JourneyDecisions.journeyDecisionUniqueId, JourneyDecisions.driverRequestId as jd_driverRequestId, ShipperRequest.shipperRequestId as pr_shipperRequestId",
        joins: [
          {
            table: "JourneyDecisions",
            on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
          },
          {
            table: "ShipperRequest",
            on: "JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId",
          },
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          ...orderCondition,
          "JourneyDecisions.journeyStatusId": [
            journeyStatusMap.requested,
            // 2 — driver bid, not yet interacted
            journeyStatusMap.acceptedByDriver, // 3 — driver accepted, waiting on shipper
          ],
        },
      });
      if (!connectedDrivers?.length) {
        throw new AppError("No driver requests found to accept", AppError.NOT_FOUND);
      }
      for (let i = 0; i < connectedDrivers?.length; i++) {
        const driver = connectedDrivers[i];
        const phoneNumber = driver?.phoneNumber;
        const targetDriverUserUniqueId = driver?.driverUserUniqueId;
        const isAccepted =
          driverRequestUniqueId === driver.driverRequestUniqueId;
        const updatePayload = {
          journeyStatusId: isAccepted
            ? journeyStatusMap.acceptedByShipper
            : journeyStatusMap.notSelectedInBid,
          driverRequestUniqueId: driver?.driverRequestUniqueId,
          journeyDecisionUniqueId: driver?.journeyDecisionUniqueId,
          shipperRequestUniqueId: driver?.shipperRequestUniqueId,
        };
        await updateJourneyStatus(updatePayload);

        // Bid offer that was surfaced through the queue (check-in pull) has a
        // LINKED DriverQueue entry (status REQUESTED). When the shipper accepts
        // this driver, the entry must leave the dispatch line (marked AGREED).
        // Creation-path bids that were never linked fall back to marking the
        // driver's OWN active entry agreed. Lazy require avoids a require cycle
        // with DriverQueue.service (which pulls from statusVerification).
        if (isQueueOrder && isAccepted) {
          const { markEntryAgreed } = require("../DriverQueue.service");
          await markEntryAgreed({
            shipperRequestUniqueId: driver.shipperRequestUniqueId,
            userUniqueId: driver.driverUserUniqueId,
            bidOrder: true,
          });
        } else if (isQueueOrder) {
          // LOSERS must not keep holding the (now-lost) order via their linked
          // queue entry — unlink it and return them to the waiting pool so they
          // stay in the queue for the next offer (no-op if never linked).
          const {
            releaseEntryForUnselectedBidder,
          } = require("../DriverQueue.service");
          await releaseEntryForUnselectedBidder({
            shipperRequestUniqueId: driver.shipperRequestUniqueId,
            userUniqueId: driver.driverUserUniqueId,
          });
        }

        // Verification of driver journey status (lazy required/internal check)
        const driverStatus = await verifyDriverJourneyStatus({
          userUniqueId: driver?.driverUserUniqueId,
        });
        const notification = {
          title: isAccepted ? "Offer accepted" : "Offer not selected",
          body: isAccepted
            ? "Shipper accepted your price."
            : "Shipper selected another offer.",
        };
        const data = {
          type: "driver_offer_status",
          status: isAccepted ? "success" : "not_selected",
          driverRequestUniqueId: String(driver?.driverRequestUniqueId || ""),
          journeyDecisionUniqueId: String(journeyDecisionUniqueId || ""),
          shipperUserUniqueId: String(userUniqueId || ""),
        };
        if (targetDriverUserUniqueId) {
          await sendFCMNotificationToUser({
            userUniqueId: targetDriverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification,
            data,
          }).catch((e) => logger.error("Error sending FCM notification", e));
        }
        if (driverStatus) {
          await sendSocketIONotificationToDriver({
            message: {
              ...driverStatus,
              messageTypes: isAccepted
                ? messageTypes.shipper_accepted_driver_request
                : messageTypes.driver_not_selected_in_bid,
            },
            phoneNumber,
          });
        }
      }
      if (isQueueOrgAdmin) {
        return {
          message: "Bid accepted successfully",
          data: {
            shipperRequestUniqueId,
            acceptedDriverRequestUniqueId: driverRequestUniqueId,
          },
        };
      }
      const statusResult = await verifyShipperStatus({
        userUniqueId,
      });
      return {
        message: "Driver request accepted successfully",
        data: {
          totalRecords: statusResult?.data?.totalRecords || null,
        },
        pagination: {
          currentPage: statusResult?.pagination?.currentPage || 1,
          limit: statusResult?.pagination?.limit || PAGINATION.DEFAULT_PAGE_SIZE,
        },
      };
    });
  } catch (error) {
    logger.error("Unable to accept driver request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to accept driver request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Rejects a driver's offer
 * @param {Object} body - Request body with rejection data
 * @returns {Promise<Object>} Shipper status after rejection
 */

module.exports = {
  acceptDriverOffer,
};
