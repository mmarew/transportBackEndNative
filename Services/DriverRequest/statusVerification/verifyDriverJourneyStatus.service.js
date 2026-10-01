"use strict";
const {
  getNotificationStatuses,
  shouldHandleNotificationStatus,
  isTerminalStatus,
} = require("./helpers.service");
const { handleJourneyStatusOne } = require("./handleJourneyStatusOne.service");
const { handleExistingJourney } = require("./handleExistingJourney.service");

const { checkActiveDriverRequest } = require("../../../CRUD/Read/ReadData");

const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");

const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected
const { getVehicleDrivers } = require("../../VehicleDriver.service");
const { pool } = require("../../../Middleware/Database.config");

// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js

const verifyDriverJourneyStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // ── DRIVER QUEUE CONTEXT (Fix C) ──────────────────────────────
    // One truth block for the app: the two-number model (immutable
    // queueNumber + derived linePosition), hasActiveJob, activeOrder,
    // reservation and the yard-gate verdict. Attached to EVERY response
    // below — including the "no active request" ones, because a driver can
    // be waiting in a queue (or merely reserved for a shipper) with no
    // DriverRequest at all. Field name `driverQueue` avoids colliding with
    // the existing `queue` org object that handleExistingJourney returns.
    let driverQueue = null;
    try {
      const { driverQueueContext } = require("../../DriverQueue");
      driverQueue = await driverQueueContext(pool, { userUniqueId });
    } catch (queueError) {
      logger.warn("driverQueueContext unavailable for verifyDriverJourneyStatus", {
        error: queueError.message,
        userUniqueId,
      });
    }
    const withQueue = (payload) => ({ ...payload, driverQueue });

    // Step 1: Check if the driver has a vehicle via VehicleDriver relation
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicle = vdResult?.data?.[0];
    if (!vehicle) {
      throw new AppError("No vehicle found for this driver", AppError.NOT_FOUND);
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
      return withQueue({
        message: "Driver journey status verified",
        data: null,
        status: null,
        vehicle,
      });
    }

    // Step 3: Validate journey status
    const journeyStatusId = driverRequest?.journeyStatusId;
    // Allow notSelectedInBid (14), cancellation statuses (7, 10), and rejectedByShipper (8) to go through to handleExistingJourney for proper notification
    // Other terminal statuses (> 6) are excluded, but these need to notify the driver
    const notificationStatuses = getNotificationStatuses();
    const shouldHandleStatus = shouldHandleNotificationStatus(
      journeyStatusId,
      notificationStatuses,
    );
    if (isTerminalStatus(journeyStatusId) && !shouldHandleStatus) {
      return withQueue({
        message: "No active driver request",
        data: null,
        status: null,
        vehicle,
        driver: null,
        shipper: null,
      });
    }
    if (journeyStatusId === journeyStatusMap.waiting) {
      return withQueue(
        await handleJourneyStatusOne(
          driverRequest,
          vehicle,
          vehicleTypeUniqueId,
        ),
      );
    }
    return withQueue(await handleExistingJourney(driverRequest, vehicle));
  } catch (error) {
    logger.error("Error in verifyDriverJourneyStatus", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to verify driver status",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = {
  verifyDriverJourneyStatus,
};
