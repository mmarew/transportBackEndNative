"use strict";

const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { pool } = require("../../Middleware/Database.config");

const {
  sendSocketIONotificationToDriver,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");

const { updateJourneyStatus } = require("../JourneyStatus");

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
const acceptDriverRequest = async (body) => {
  try {
    logger.debug("acceptDriverRequest ~ body:", body);
    const {
      shipperRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      userUniqueId,
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
        400,
      );
    }
    return await executeInTransaction(async () => {
      // Fetch ALL open bids for this shipper — both status 2 (requested) and status 3 (acceptedByDriver).
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
          "ShipperRequest.userUniqueId": userUniqueId,
          "JourneyDecisions.journeyStatusId": [
            journeyStatusMap.requested,
            // 2 — driver bid, not yet interacted
            journeyStatusMap.acceptedByDriver, // 3 — driver accepted, waiting on shipper
          ],
        },
      });
      if (!connectedDrivers?.length) {
        throw new AppError("No driver requests found to accept", 404);
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
          limit: statusResult?.pagination?.limit || 10,
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
      error.statusCode || 500,
    );
  }
};

/**
 * Rejects a driver's offer
 * @param {Object} body - Request body with rejection data
 * @returns {Promise<Object>} Shipper status after rejection
 */

module.exports = {
  acceptDriverRequest,
};
