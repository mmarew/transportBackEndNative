"use strict";

const {
  getData,
  performJoinSelect,
  
} = require("../../CRUD/Read/ReadData");
const {
  pool
} = require("../../Middleware/Database.config");
const {
  updateData
} = require("../../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToDriver
} = require("../../Utils/Notifications");
const {
  sendFCMNotificationToUser
} = require("../Firebase.service");
const {
  getVehicleDrivers
} = require("../VehicleDriver.service");
const {
  
  updateNegativeJourneyStatus
} = require("../JourneyStatus");

const {
  journeyStatusMap,
  usersRoles,
  
  
} = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");

const {
  executeInTransaction
} = require("../../Utils/DatabaseTransaction");



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

/**
 * Rejects a driver's offer
 * @param {Object} body - Request body with rejection data
 * @returns {Promise<Object>} Shipper status after rejection
 */
const rejectDriverOffer = async body => {
  try {
    // Validate required fields
    const requiredFields = ["shipperRequestId", "shipperRequestUniqueId", "driverRequestUniqueId", "journeyDecisionUniqueId", "journeyStatusId"];
    const missingFields = requiredFields?.filter(field => !body?.[field]) || [];
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Get all requests which are accepted by driver shipper requests for this shipper
    const allShipperRequests = await getData({
      tableName: "JourneyDecisions",
      conditions: {
        shipperRequestId: body.shipperRequestId,
        journeyStatusId: journeyStatusMap.acceptedByDriver
      }
    });
    logger.debug("@allShipperRequests", {
      allShipperRequests
    });

    // Wrap all updates in a transaction to ensure atomicity
    let negativeStatusUpdateResult;
    await executeInTransaction(async () => {
      // Update ShipperRequest if there is only one request (all-or-nothing)
      if (allShipperRequests.length <= 1) {
        await updateData({
          tableName: "ShipperRequest",
          conditions: {
            shipperRequestUniqueId: body.shipperRequestUniqueId
          },
          updateValues: {
            journeyStatusId: journeyStatusMap.waiting
          }
        });
      }

      // Use dedicated updater function for negative status updates with transaction connection
      negativeStatusUpdateResult = await updateNegativeJourneyStatus({
        driverRequestUniqueId: body.driverRequestUniqueId,
        journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        newStatusId: journeyStatusMap.rejectedByShipper
      });
    }, {
      timeout: 10000,
      // 10 second timeout for reject operation
      logging: true
    });

    // Verify update was successful
    if (negativeStatusUpdateResult.message === "error" || !negativeStatusUpdateResult.results?.driverRequest?.affectedRows || !negativeStatusUpdateResult.results?.journeyDecision?.affectedRows) {
      throw new Error(negativeStatusUpdateResult.error || "One or more updates failed");
    }

    // Fetch driver and shipper data for notification
    const [driverRequestData, shipperRequestData, journeyDecisionData] = await Promise.all([performJoinSelect({
      baseTable: "DriverRequest",
      joins: [{
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId"
      }],
      conditions: {
        driverRequestUniqueId: body.driverRequestUniqueId
      }
    }), performJoinSelect({
      baseTable: "ShipperRequest",
      joins: [{
        table: "Users",
        on: "ShipperRequest.userUniqueId = Users.userUniqueId"
      }],
      conditions: {
        shipperRequestUniqueId: body.shipperRequestUniqueId
      }
    }), getData({
      tableName: "JourneyDecisions",
      conditions: {
        journeyDecisionUniqueId: body.journeyDecisionUniqueId
      }
    })]);
    const driver = driverRequestData?.[0];
    const shipper = shipperRequestData?.[0];
    const journeyDecision = journeyDecisionData?.[0];

    // Send notification to driver if driver data is available
    if (driver?.phoneNumber && driver?.userUniqueId) {
      // Get vehicle data for driver
      const vehicleData = await getVehicleDrivers({
        driverUserUniqueId: driver.userUniqueId,
        assignmentStatus: "active",
        limit: 1,
        page: 1
      });
      // Get driver profile photo
      const vehicle = vehicleData?.data?.[0];
      const message = {
        messageTypes: messageTypes.shipper_rejected_request,
        message: "success",
        status: journeyStatusMap.rejectedByShipper,
        shipper: shipper ? shipper : null,
        driver: {
          driver: driver,
          vehicle: vehicle || null
        },
        decisions: journeyDecision ? journeyDecision : null,
        journey: null
      };

      // Send WebSocket notification to driver
      try {
        await sendSocketIONotificationToDriver({
          message,
          phoneNumber: driver.phoneNumber
        });
      } catch (error) {
        logger.error("Error sending WebSocket notification to driver:", error);
      }

      // Send FCM push notification to driver
      try {
        await sendFCMNotificationToUser({
          userUniqueId: driver.userUniqueId,
          roleId: usersRoles.driverRoleId,
          notification: {
            title: "Offer rejected",
            body: "Shipper has excluded your offer from the bid."
          },
          data: {
            type: "driver_offer_rejected",
            status: "rejected",
            driverRequestUniqueId: String(body.driverRequestUniqueId || ""),
            journeyDecisionUniqueId: String(body.journeyDecisionUniqueId || ""),
            shipperRequestUniqueId: String(body.shipperRequestUniqueId || "")
          }
        });
      } catch (error) {
        logger.error("Error sending FCM notification to driver:", error);
      }
    }

    // Return success message - client should call verifyShipperStatus endpoint for full status
    return {
      message: "Driver offer rejected successfully",
      data: null
    };
  } catch (error) {
    throw new AppError(error.message || "Unable to reject driver offer", error.statusCode || 500);
  }
};

/**
 * Cancels a shipper request
 * @param {Object} body - Cancellation data
 * @param {number} body.cancellationJourneyStatusId - Cancellation status ID
 * @param {Object} body.user - User object with userUniqueId and roleId
 * @param {string} body.ownerUserUniqueId - Owner's unique ID
 * @param {number} body.cancellationReasonsTypeId - Cancellation reason type ID
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response
 */

module.exports = {
  rejectDriverOffer
};
