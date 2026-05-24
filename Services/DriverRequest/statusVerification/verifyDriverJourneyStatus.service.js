"use strict";
const { getNotificationStatuses, shouldHandleNotificationStatus, isTerminalStatus } = require("./helpers.service");
const { handleJourneyStatusOne } = require("./handleJourneyStatusOne.service");
const { handleExistingJourney } = require("./handleExistingJourney.service");

const {
  
  checkActiveDriverRequest,
  
  
  
} = require("../../../CRUD/Read/ReadData");

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  journeyStatusMap,
  
} = require("../../../Utils/ListOfSeedData");


const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected
const {
  getVehicleDrivers
} = require("../../VehicleDriver.service");

// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js


const verifyDriverJourneyStatus = async ({
  userUniqueId,
  activeRequest
}) => {
  try {
    // Step 1: Check if the driver has a vehicle via VehicleDriver relation
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1
    });
    const vehicle = vdResult?.data?.[0];
    if (!vehicle) {
      throw new AppError("No vehicle found for this driver", 404);
    }
    const vehicleTypeUniqueId = vehicle?.vehicleTypeUniqueId;

    // Step 2: Check for an active driver request, including cancellation and notSelectedInBid statuses
    // This optimized query combines all checks into one database request to reduce data rerequest
    if (!activeRequest?.length) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    // console.log("@activeRequest", activeRequest);
    const driverRequest = activeRequest?.[0];
    logger.debug("@driverRequest", driverRequest);
    if (!driverRequest) {
      return {
        message: "success",
        data: "No active requests found for this driver",
        status: null,
        vehicle
      };
    }

    // Step 3: Validate journey status
    const journeyStatusId = driverRequest?.journeyStatusId;
    // Allow notSelectedInBid (14), cancellation statuses (7, 10), and rejectedByShipper (8) to go through to handleExistingJourney for proper notification
    // Other terminal statuses (> 6) are excluded, but these need to notify the driver
    const notificationStatuses = getNotificationStatuses();
    const shouldHandleStatus = shouldHandleNotificationStatus(journeyStatusId, notificationStatuses);
    if (isTerminalStatus(journeyStatusId) && !shouldHandleStatus) {
      return {
        message: "success",
        data: "This request is not active at the moment",
        status: null,
        vehicle,
        driver: null,
        shipper: null
      };
    }
    if (journeyStatusId === journeyStatusMap.waiting) {
      return await handleJourneyStatusOne(driverRequest, vehicle, vehicleTypeUniqueId);
    }
    return await handleExistingJourney(driverRequest, vehicle);
  } catch (error) {
    logger.error("Error in verifyDriverJourneyStatus", {
      error: error.message,
      stack: error.stack
    });
    throw new AppError(error.message || "Unable to verify driver status", error.statusCode || 500);
  }
};

module.exports = {
  verifyDriverJourneyStatus
};
