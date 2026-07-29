/**
 * Automatic Timeout Detection Service
 *
 * PURPOSE: Automatically detects when drivers don't respond to shipper requests
 * within a specified time limit and automatically processes the timeout.
 *
 * This service runs as a background job and:
 * 1. Finds driver requests that have been in "requested" (2) status for longer than the timeout period
 * 2. Automatically updates status to "noAnswerFromDriver" (13)
 * 3. Automatically creates a new shipper request to find another driver
 * 4. Sends notifications to both shipper and driver
 * 5. Logs evidence data for audit purposes
 *
 * CONFIGURATION:
 * - DRIVER_RESPONSE_TIMEOUT_MINUTES: Time in minutes before considering driver non-responsive (default: 5 minutes)
 * - CHECK_INTERVAL_SECONDS: How often to run the check (default: 120 seconds / 2 minutes)
 */

const { pool } = require("../../Middleware/Database.config");
const Config = require("../../Utils/Config");
const { currentDate } = require("../../Utils/CurrentDate");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const { noAnswerFromDriver } = require("../DriverRequest");

// Configuration
const DRIVER_RESPONSE_TIMEOUT_MINUTES = parseInt(
  Config.DRIVER_RESPONSE_TIMEOUT_MINUTES,
  10,
);
const CHECK_INTERVAL_SECONDS = parseInt(
  Config.DRIVER_TIMEOUT_CHECK_INTERVAL,
  10,
);

/**
 * Finds all driver requests that have timed out (no response from driver)
 *
 * Criteria:
 * - JourneyDecisions.journeyStatusId = 2 (requested)
 * - JourneyDecisions.decisionTime is older than DRIVER_RESPONSE_TIMEOUT_MINUTES
 * - ShipperRequest.journeyStatusId = 2 (requested) - driver hasn't accepted yet
 * - JourneyDecisions.journeyStatusId hasn't been updated to acceptedByDriver (3) or higher
 *
 * @returns {Promise<Array>} Array of timed-out journey decisions with associated data
 */
const findTimedOutDriverRequests = async () => {
  try {
    const timeoutMinutesAgo = new Date(
      currentDate() - DRIVER_RESPONSE_TIMEOUT_MINUTES * 60 * 1000,
    );

    const sql = `
      SELECT 
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId,
        JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.journeyStatusId as decisionStatusId,
        JourneyDecisions.decisionBy,
        
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.journeyStatusId as shipperStatusId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.originLatitude,
        ShipperRequest.originLongitude,
        ShipperRequest.originPlace,
        ShipperRequest.destinationLatitude,
        ShipperRequest.destinationLongitude,
        ShipperRequest.destinationPlace,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        ShipperRequest.shipperRequestBatchUniqueId,
        ShipperRequest.shipperRequestCreatedBy,
        ShipperRequest.shipperRequestCreatedByRoleId,
        
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.journeyStatusId as driverStatusId,
        
        Users.phoneNumber as shipperPhoneNumber,
        DriverUser.phoneNumber as driverPhoneNumber,
        DriverUser.fullName as driverFullName,
        
        VehicleTypes.vehicleTypeName
        
      FROM JourneyDecisions
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      INNER JOIN Users ON ShipperRequest.userUniqueId = Users.userUniqueId
      INNER JOIN Users as DriverUser ON DriverRequest.userUniqueId = DriverUser.userUniqueId
      INNER JOIN VehicleTypes ON ShipperRequest.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      
      WHERE 
        JourneyDecisions.journeyStatusId = ? 
        AND ShipperRequest.journeyStatusId = ?
        AND DriverRequest.journeyStatusId = ?
        AND JourneyDecisions.decisionTime < ?
        AND (JourneyDecisions.decisionBy = 'driver' OR JourneyDecisions.decisionBy IS NULL)
        -- Include records where decisionBy is 'driver' (auto-matched) or NULL (legacy records)
        
      ORDER BY JourneyDecisions.decisionTime ASC
    `;

    const [results] = await pool.query(sql, [
      journeyStatusMap.requested, // JourneyDecisions status = requested (2)
      journeyStatusMap.requested, // ShipperRequest status = requested (2)
      journeyStatusMap.requested, // DriverRequest status = requested (2)
      timeoutMinutesAgo, // Decision time older than timeout
    ]);

    return results || [];
  } catch (error) {
    logger.error("Error finding timed-out driver requests", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Automatically processes a timed-out driver request
 *
 * This function is called by the background job to automatically:
 * 1. Update status to noAnswerFromDriver (13)
 * 2. Create a new shipper request
 * 3. Send notifications
 * 4. Log evidence data
 *
 * @param {Object} timedOutRequest - The timed-out request data from findTimedOutDriverRequests
 * @returns {Promise<Object>} Result of the automatic processing
 */
const processAutomaticTimeout = async (timedOutRequest) => {
  try {
    const {
      shipperRequestUniqueId,
      driverRequestUniqueId,
      vehicleTypeUniqueId,
      journeyDecisionUniqueId,
      decisionTime,
      shipperUserUniqueId,
      driverUserUniqueId,
      driverPhoneNumber,
      shipperPhoneNumber,
      driverFullName,
      vehicleTypeName,
      shipperStatusId,
      driverStatusId,
      decisionStatusId,
    } = timedOutRequest;

    // Safety check: Verify status is still requested (2) before processing
    // This prevents race conditions where status might have changed between query and processing
    if (
      shipperStatusId !== journeyStatusMap.requested ||
      driverStatusId !== journeyStatusMap.requested ||
      decisionStatusId !== journeyStatusMap.requested
    ) {
      logger.warn("AUTOMATIC TIMEOUT SKIPPED - Status already changed", {
        timestamp: currentDate(),
        shipperRequestUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        shipperStatusId,
        driverStatusId,
        decisionStatusId,
        expectedStatus: journeyStatusMap.requested,
        automatic: true,
      });
      return {
        message: "skipped",
        reason:
          "Status already changed - request may have been processed manually or driver responded",
        shipperRequestUniqueId,
        driverRequestUniqueId,
      };
    }

    // Log evidence data before processing
    logger.info(
      "AUTOMATIC TIMEOUT DETECTED - Processing no answer from driver",
      {
        timestamp: currentDate(),
        evidence: {
          shipperRequestUniqueId,
          driverRequestUniqueId,
          journeyDecisionUniqueId,
          shipperUserUniqueId,
          driverUserUniqueId,
          driverPhoneNumber: driverPhoneNumber
            ? `${driverPhoneNumber.substring(
              0,
              3,
            )}***${driverPhoneNumber.substring(driverPhoneNumber.length - 2)}`
            : null, // Mask phone for privacy
          shipperPhoneNumber: shipperPhoneNumber
            ? `${shipperPhoneNumber.substring(
              0,
              3,
            )}***${shipperPhoneNumber.substring(
              shipperPhoneNumber.length - 2,
            )}`
            : null,
          driverFullName,
          vehicleTypeName,
          originalDecisionTime: decisionTime,
          timeoutMinutes: DRIVER_RESPONSE_TIMEOUT_MINUTES,
          automatic: true,
          currentStatus: {
            shipper: shipperStatusId,
            driver: driverStatusId,
            decision: decisionStatusId,
          },
        },
      },
    );

    // Build the body object for noAnswerFromDriver function
    // Note: userUniqueId is not required for automatic processing, but we include shipperUserUniqueId
    // for potential future use or logging
    const timeoutBody = {
      shipperRequestUniqueId,
      driverRequestUniqueId,
      userUniqueId: shipperUserUniqueId, // Shipper's userUniqueId (for consistency, though not required)
      journeyStatusId: journeyStatusMap.noAnswerFromDriver, // 13 - noAnswerFromDriver (fixed from 11)
      previousStatusId: journeyStatusMap.requested, // 2 - requested
      vehicle: {
        vehicleTypeUniqueId,
      },
      numberOfVehicles: 1,
      automatic: true, // Flag to indicate this was triggered automatically by system
      timeoutMinutes: DRIVER_RESPONSE_TIMEOUT_MINUTES,
      originalDecisionTime: decisionTime,
      triggeredBy: "system", // Indicate this was triggered by automatic background job
    };

    // Call the noAnswerFromDriver service function
    const result = await noAnswerFromDriver(timeoutBody);

    // Log successful automatic processing
    if (result.message === "success") {
      logger.info("AUTOMATIC TIMEOUT PROCESSED SUCCESSFULLY", {
        timestamp: currentDate(),
        shipperRequestUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        newShipperRequestStatus: result.status,
        automatic: true,
      });
    } else {
      logger.error("AUTOMATIC TIMEOUT PROCESSING FAILED", {
        timestamp: currentDate(),
        shipperRequestUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        error: result.error || result.message,
        automatic: true,
      });
    }

    return result;
  } catch (error) {
    logger.error("Error processing automatic timeout", {
      error: error.message,
      stack: error.stack,
      timedOutRequest: {
        shipperRequestUniqueId: timedOutRequest?.shipperRequestUniqueId,
        driverRequestUniqueId: timedOutRequest?.driverRequestUniqueId,
        journeyDecisionUniqueId: timedOutRequest?.journeyDecisionUniqueId,
      },
    });
    throw error;
  }
};

/**
 * Main function to check and process all timed-out driver requests
 *
 * This function:
 * 1. Finds all timed-out requests
 * 2. Processes each one automatically
 * 3. Logs summary statistics
 *
 * @returns {Promise<Object>} Summary of processed timeouts
 */
const checkAndProcessTimeouts = async () => {
  const startTime = currentDate();
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    logger.info("Starting automatic timeout check", {
      timeoutMinutes: DRIVER_RESPONSE_TIMEOUT_MINUTES,
      timestamp: currentDate(),
    });

    // Find all timed-out requests
    const timedOutRequests = await findTimedOutDriverRequests();

    if (timedOutRequests.length === 0) {
      logger.info("No timed-out driver requests found", {
        timestamp: currentDate(),
      });
      return {
        message: "No timed-out requests found",
        checked: true,
        timedOutCount: 0,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        duration: currentDate() - startTime,
      };
    }

    logger.info(
      `Found ${timedOutRequests.length} timed-out driver request(s)`,
      {
        count: timedOutRequests.length,
        timestamp: currentDate(),
      },
    );

    // Process each timed-out request
    for (const timedOutRequest of timedOutRequests) {
      try {
        processedCount++;
        const result = await processAutomaticTimeout(timedOutRequest);

        if (result.message === "success") {
          successCount++;
        } else {
          errorCount++;
          errors.push({
            shipperRequestUniqueId: timedOutRequest.shipperRequestUniqueId,
            driverRequestUniqueId: timedOutRequest.driverRequestUniqueId,
            error: result.error || result.message,
          });
        }

        // Add a small delay between processing to avoid overwhelming the database
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        errorCount++;
        errors.push({
          shipperRequestUniqueId: timedOutRequest.shipperRequestUniqueId,
          driverRequestUniqueId: timedOutRequest.driverRequestUniqueId,
          error: error.message,
        });
        logger.error("Error processing individual timeout", {
          error: error.message,
          shipperRequestUniqueId: timedOutRequest.shipperRequestUniqueId,
          driverRequestUniqueId: timedOutRequest.driverRequestUniqueId,
        });
      }
    }

    const duration = currentDate() - startTime;

    logger.info("Automatic timeout check completed", {
      timestamp: currentDate(),
      timedOutCount: timedOutRequests.length,
      processedCount,
      successCount,
      errorCount,
      duration: `${duration}ms`,
      errors: errors.length > 0 ? errors : undefined,
    });

    return {
      message: "No timed-out requests found",
      checked: true,
      timedOutCount: timedOutRequests.length,
      processedCount,
      successCount,
      errorCount,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    logger.error("Fatal error in automatic timeout check", {
      error: error.message,
      stack: error.stack,
      duration: currentDate() - startTime,
    });
    throw error;
  }
};

/**
 * Starts the automatic timeout checking service
 *
 * This function sets up a periodic interval to check for timed-out requests
 * and processes them automatically.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.intervalSeconds - Interval in seconds between checks (default: CHECK_INTERVAL_SECONDS)
 * @param {boolean} options.runImmediately - Whether to run the first check immediately (default: true)
 * @returns {Object} Interval control object with stop() method
 */
const startAutomaticTimeoutService = (options = {}) => {
  const { intervalSeconds = CHECK_INTERVAL_SECONDS, runImmediately = true } =
    options;

  logger.info("Starting Automatic Timeout Detection Service", {
    intervalSeconds,
    timeoutMinutes: DRIVER_RESPONSE_TIMEOUT_MINUTES,
    runImmediately,
    timestamp: new Date().toISOString(),
  });

  // Run immediately if requested
  if (runImmediately) {
    checkAndProcessTimeouts().catch((error) => {
      logger.error("Error in immediate timeout check", {
        error: error.message,
        stack: error.stack,
      });
    });
  }

  // Set up periodic checking
  const intervalId = setInterval(() => {
    checkAndProcessTimeouts().catch((error) => {
      logger.error("Error in periodic timeout check", {
        error: error.message,
        stack: error.stack,
      });
    });
  }, intervalSeconds * 1000);

  // Return control object
  return {
    stop: () => {
      clearInterval(intervalId);
      logger.info("Automatic Timeout Detection Service stopped", {
        timestamp: currentDate(),
      });
    },
    intervalId,
    checkNow: () => checkAndProcessTimeouts(),
  };
};

module.exports = {
  findTimedOutDriverRequests,
  processAutomaticTimeout,
  checkAndProcessTimeouts,
  startAutomaticTimeoutService,
  DRIVER_RESPONSE_TIMEOUT_MINUTES,
  CHECK_INTERVAL_SECONDS,
};
