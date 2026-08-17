
const { pool } = require("../../Middleware/Database.config");
const {
  getData,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  checkActiveShipperRequest,
  findNearbyDrivers,
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { insertData } = require("../../CRUD/Create/CreateData");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const { getVehicleDrivers } = require("../VehicleDriver.service");
const {
  getJourneyDecision4AllOrSingleUser,
} = require("../JourneyDecisions.service");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../Utils/logger");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");

/**
 * Gets the shipper's current journey status
 * @param {string} userUniqueId - Shipper's unique identifier
 * @returns {Promise<number|null>} Journey status ID or null
 */
const getShipperJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "ShipperRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "shipperRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId && journeyStatusId <= journeyStatusMap.journeyStarted
      ? journeyStatusId
      : null;
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error getting current journey status", {
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};

/**
 * Gets recent completed journeys for a shipper
 * @param {Object} user - User object with userUniqueId
 * @returns {Promise<Object>} Recent completed journeys
 */
/**
 * Marks a journey as seen by shipper and creates a rating
 * @param {Object} body - Request body
 * @param {string} body.userUniqueId - Shipper's unique identifier
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @param {number} body.rating - Rating value
 * @returns {Promise<Object>} Success or error response
 */
const seenByShipper = async (body) => {
  try {
    const {
      userUniqueId,
      shipperRequestUniqueId,
      journeyDecisionUniqueId,
      rating,
    } = body;

    // Verify that the journeyDecisionUniqueId exists to prevent foreign key errors
    const journeyDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
    });

    if (!journeyDecision || journeyDecision.length === 0) {
      throw new AppError("Journey decision not found", AppError.NOT_FOUND);
    }

    // Mark the request as seen — always do this, even if rating already exists
    await updateData({
      tableName: "ShipperRequest",
      conditions: { shipperRequestUniqueId },
      updateValues: { isCompletionSeen: true },
    });

    // Create rating only if one does not already exist for this journey
    // (idempotent — handles app retries without throwing)
    const { createRating, getAllRatings } = require("../Ratings.service");
    const existingRating = await getAllRatings({ journeyDecisionUniqueId, limit: 1 });
    const alreadyRated = existingRating?.data?.ratings?.length > 0;

    if (!alreadyRated) {
      await createRating({
        ratedBy: userUniqueId,
        journeyDecisionUniqueId,
        rating,
        comment: "",
      });
    } else {
      logger.debug("Rating already exists — skipping creation (idempotent retry)", {
        journeyDecisionUniqueId,
        ratedBy: userUniqueId,
      });
    }

    return { message: "Journey completion marked as seen", data: null };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to mark data as seen by shipper", {
      error: error.message,
      stack: error.stack,
    });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `Unable to seen by shipper: ${error.message}`,
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Handles waiting request (status 1) - finds nearby drivers and creates journey decisions
 * @param {Object} params - Handler parameters
 * @param {Object} params.shipperRequest - Shipper request object
 * @param {number} params.shipperRequestId - Shipper request ID
 * @param {Object} params.totalRecords - Total records for pagination
 * @param {number} params.pageSize - Page size
 * @param {number} params.page - Page number
 * @param {Array} params.driversData - Array to push driver data (shared with handleNonWaitingRequest)
 * @param {Array} params.drivers - Array to push final drivers
 * @param {Array} params.decisions - Array to push final decisions
 * @param {Set} params.notifiedDrivers - Set to track notified drivers
 * @param {string} params.userUniqueId - User unique ID
 * @param {Object} params.connection - Database connection
 * @returns {Promise<boolean>} Returns true if driver was found
 */
async function handleWaitingRequest({
  shipperRequest,
  shipperRequestId,
  totalRecords,
  pageSize,
  page,
  driversData, // unused; kept for API compatibility with callers
  drivers,
  decisions,
  notifiedDrivers,
  userUniqueId,
}) {
  void driversData; // avoid no-unused-vars
  // Find available drivers near the shipper's location (READ-ONLY - outside transaction)
  // Uses radius-based search with distance ordering + FIFO tiebreaker (see ReadData.matching.js).
  const driverResults = await findNearbyDrivers({ shipperRequest });

  if (driverResults.length === 0) {
    return false;
  }

  let driverFound = false;
  const decisionsData = [];
  const driversDataLocal = [];

  for (const driverResult of driverResults) {
    // Pre-fetch profile photo outside critical transaction (READ-ONLY)
    const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
      driverResult.driverUserUniqueId,
      listOfDocumentsTypeAndId.profilePhoto,
    );

    const data = documents?.data;
    const lastDataIndex = data?.length - 1;
    const driverProfilePhoto = data?.[lastDataIndex]?.attachedDocumentName;

    const driver = {
      ...driverResult,
      driverProfilePhoto,
    };

    const vehicle = {
      vehicleUniqueId: driverResult.vehicleUniqueId,
      licensePlate: driverResult.licensePlate,
      color: driverResult.color,
      vehicleTypeName: driverResult.vehicleTypeName,
      vehicleTypeUniqueId: driverResult.vehicleTypeUniqueId,
    };

    // CRITICAL TRANSACTION BLOCK - Only essential writes
    // Check if driver is still available (race condition protection)
    const executorAvailability = transactionStorage.getStore() || pool;
    const availabilityCheck = await executorAvailability.query(
      `SELECT COUNT(*) as count FROM DriverRequest
       WHERE driverRequestId = ? AND journeyStatusId = ?`,
      [driverResult.driverRequestId, journeyStatusMap.waiting],
    );

    if (availabilityCheck[0][0].count === 0) {
      continue; // Driver no longer available, skip
    }

    // Create journey decision
    const journeyDecisionUniqueId = uuidv4();
    const journeyDecisionPayload = {
      journeyDecisionUniqueId,
      shipperRequestId,
      driverRequestId: driver.driverRequestId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: currentDate(),
      //decisionBy is used to track dose shippers request get driver or driver request get shipper request
      decisionBy: "shipper",
      journeyDecisionCreatedBy: userUniqueId,
      journeyDecisionCreatedAt: currentDate(),
    };

    // Create journey decision with error handling for race conditions
    try {
      await insertData({
        tableName: "JourneyDecisions",
        colAndVal: journeyDecisionPayload,
      });
    } catch (error) {
      // Handle duplicate key error (race condition)
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry") ||
        error.message?.includes("driverRequestId")
      ) {
        logger.warn(
          "Duplicate JourneyDecision detected (race condition), skipping",
          {
            driverRequestId: driver.driverRequestId,
            shipperRequestId: shipperRequestId,
            error: error.message,
          },
        );
        continue; // Skip this driver
      }
      throw error;
    }

    // Update shipper request status
    await updateData({
      tableName: "ShipperRequest",
      conditions: { shipperRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    });

    // Update driver request status
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId: driver.driverRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    });
    // END CRITICAL TRANSACTION BLOCK

    // Collect data for notifications (outside transaction)
    driversDataLocal.push({
      driver: { ...driver, driverProfilePhoto },
      vehicle: vehicle,
    });

    decisionsData.push(journeyDecisionPayload);

    // Send notification (outside transaction)
    if (driver?.phoneNumber && !notifiedDrivers.has(driver.phoneNumber)) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "Driver found for shipper request",
          status: journeyStatusMap.requested,
          shipper: shipperRequest,
          driver: {
            driver: { ...driver, driverProfilePhoto },
            vehicle: vehicle,
          },
          journey: null,
          decisions: journeyDecisionPayload,
          totalRecords,
          pageSize,
          page,
        },
        phoneNumber: driver?.phoneNumber,
      });
      notifiedDrivers.add(driver.phoneNumber);
    }

    driverFound = true;
  }

  drivers.push(...driversDataLocal);
  decisions.push(...decisionsData);

  return driverFound;
}

/**
 * Handles non-waiting requests (status 2, 3, etc.) - fetches existing journey decisions and sends notifications
 * @param {Object} params - Handler parameters
 * @param {Object} params.shipperRequest - Shipper request object
 * @param {Object} params.totalRecords - Total records for pagination
 * @param {number} params.pageSize - Page size
 * @param {number} params.page - Page number
 * @param {Array} params.driversData - Array to push driver data
 * @param {Array} params.decisions - Array to push final decisions
 * @param {Set} params.notifiedDrivers - Set to track notified drivers
 * @param {Set} params.notifiedShippersForAcceptance - Set to track shipper-driver acceptance notifications
 * @param {boolean} params.sendNotificationsToDrivers - Whether to send notifications to drivers
 * @param {boolean} params.sendNotificationsToShipper - Whether to send notifications to shipper
 */
// Removed unused function: handleNonWaitingRequest
// eslint-disable-next-line no-unused-vars
const _handleNonWaitingRequest = async ({
  shipperRequest,
  totalRecords,
  pageSize,
  page,
  driversData,
  decisions,
  notifiedDrivers,
  notifiedShippersForAcceptance,
  sendNotificationsToDrivers,
  sendNotificationsToShipper,
}) => {
  const filters = {
    shipperRequestId: shipperRequest?.shipperRequestId,

    journeyStatusId: shipperRequest?.journeyStatusId,
  };
  // if  shipperRequest?.journeyStatusId, is 6 then get unseen by shipper completed journeys
  if (shipperRequest?.journeyStatusId === journeyStatusMap.journeyCompleted) {
    filters.isCompletionSeen = false;
  }
  const decisionsData = await getJourneyDecision4AllOrSingleUser({
    data: { filters },
  });

  for (let journeyDecision of decisionsData?.data || []) {
    const journeyStatusId = journeyDecision.journeyStatusId;

    // Note: isCompletionSeen filter is now handled at database level (line 280)
    // so we don't need to check it here anymore

    decisions.push(journeyDecision);

    // Journey can be created after journey is started
    let journeyData = [];
    if (journeyStatusId >= journeyStatusMap?.journeyStarted) {
      journeyData = await getData({
        tableName: "Journey",
        conditions: {
          journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
        },
      });
    }
    // get data of driver request
    const driverData = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        driverRequestId: journeyDecision?.driverRequestId,
      },
    });
    // get profile picture data of driver
    const driver = driverData[0];
    const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
      driver?.userUniqueId,
      listOfDocumentsTypeAndId.profilePhoto,
    );

    const data = documents?.data;
    const lastDataIndex = data?.length - 1;
    const driverProfilePhoto = data?.[lastDataIndex]?.attachedDocumentName;
    const phoneNumber = driver?.phoneNumber;

    // get vehicle data of driver
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: driver?.userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicleOfDriver = vdResult?.data;
    // structure driver info
    const driverInfo = {
      vehicleOfDriver: vehicleOfDriver?.[0],
      driver: { ...driver, driverProfilePhoto },
    };
    driversData.push(driverInfo);

    // Use shipperRequest directly - all journey decisions are already filtered by this shipperRequestId
    const message = {
      messageTypes: messageTypes.driver_found_shipper_request,
      message: "Shipper request status verified",
      status: driver?.journeyStatusId,
      shipper: shipperRequest,
      driver: driverInfo,
      journey: journeyData?.length > 0 ? journeyData[0] : null,
      decision: journeyDecision || null,
    };

    // Only send notification if sendNotificationsToDrivers is true and driver hasn't been notified yet
    if (
      sendNotificationsToDrivers &&
      phoneNumber &&
      !notifiedDrivers.has(phoneNumber)
    ) {
      await sendSocketIONotificationToDriver({
        message,
        phoneNumber,
      });
      notifiedDrivers.add(phoneNumber);
    }

    // Send WebSocket notification to shipper when driver accepts (status 3 - acceptedByDriver)
    // Only send if sendNotificationsToShipper is true (e.g., when called from acceptShipperRequest)
    // Don't send when shipper is just checking their status (API endpoint)
    if (
      journeyStatusId === journeyStatusMap.acceptedByDriver &&
      sendNotificationsToShipper
    ) {
      const shipperUserUniqueId = shipperRequest?.userUniqueId;
      const driverUserUniqueId = driver?.userUniqueId;

      // Create unique key for shipper-driver combination to avoid duplicate notifications
      const notificationKey = `${shipperUserUniqueId}-${driverUserUniqueId}`;

      if (
        shipperUserUniqueId &&
        driverUserUniqueId &&
        !notifiedShippersForAcceptance.has(notificationKey)
      ) {
        // Get shipper phone number
        const shipperUserData = await performJoinSelect({
          baseTable: "Users",
          joins: [],
          conditions: { userUniqueId: shipperUserUniqueId },
        });
        const shipperPhoneNumber = shipperUserData?.[0]?.phoneNumber;

        if (shipperPhoneNumber) {
          // Use the extracted notification function
          await sendShipperNotification({
            shipperRequest,
            journeyDecision,
            driverInfo,
            journeyData: journeyData?.length > 0 ? journeyData[0] : {},
            messageType: messageTypes.driver_accepted_shipper_request,
            status: journeyStatusMap.acceptedByDriver,
            totalRecords,
            pageSize,
            page,
          });

          notifiedShippersForAcceptance.add(notificationKey);
        }
      }
    }
  }
};

/**
 * Sends WebSocket notification to shipper for any journey status change
 * This is a generic reusable function that can be called for accept, start, complete, reject, cancel events
 * without processing all shipper requests
 * @param {Object} params - Notification parameters
 * @param {Object} params.shipperRequest - Shipper request object
 * @param {Object} params.journeyDecision - Journey decision object (optional)
 * @param {Object} params.driverInfo - Driver info with vehicle data
 * @param {Object} params.journeyData - Journey data (optional, can be empty object)
 * @param {Object} params.messageType - Message type from messageTypes (required, e.g., messageTypes.driver_accepted_shipper_request)
 * @param {number} params.status - Journey status ID (required, e.g., journeyStatusMap.acceptedByDriver)
 * @param {string} params.data - Optional message string (e.g., "Driver accepted your request")
 * @param {Object} params.totalRecords - Total records for pagination (optional)
 * @param {number} params.pageSize - Page size (optional)
 * @param {number} params.page - Page number (optional)
 * @returns {Promise<void>}
 */
const sendShipperNotification = async ({
  shipperRequest,
  journeyDecision,
  driverInfo,
  journeyData = {},
  messageType,
  status,
  data,
  totalRecords,
  pageSize,
  page,
}) => {
  const shipperUserUniqueId = shipperRequest?.userUniqueId;
  const driverUserUniqueId = driverInfo?.driver?.userUniqueId;

  if (!shipperUserUniqueId || !driverUserUniqueId) {
    return;
  }

  if (!messageType || !status) {
    logger.error(
      "@sendShipperNotification: messageType and status are required",
    );
    return;
  }

  // Get shipper phone number
  const shipperUserData = await performJoinSelect({
    baseTable: "Users",
    joins: [],
    conditions: { userUniqueId: shipperUserUniqueId },
  });
  const shipperPhoneNumber = shipperUserData?.[0]?.phoneNumber;

  if (!shipperPhoneNumber) {
    return;
  }

  // Transform structure to match getDetailedJourneyData format
  const driverRequestWithVehicle = {
    ...driverInfo.driver,
    vehicleOfDriver: driverInfo.vehicleOfDriver,
  };

  // Resolve the human-readable batchId (INT) from the batch unique id so the
  // shipper app can render "Order #batchId / shipperRequestId".
  let batchId = null;
  const batchUniqueId = shipperRequest?.shipperRequestBatchUniqueId;
  if (batchUniqueId) {
    try {
      const [[batchRow]] = await pool.query(
        `SELECT batchId FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
        [batchUniqueId],
      );
      batchId = batchRow?.batchId ?? null;
    } catch (e) {
      logger.warn("@sendShipperNotification: failed to resolve batchId", {
        error: e.message,
        batchUniqueId,
      });
    }
  }
  const shipperRequestWithBatch =
    batchId !== null ? { ...shipperRequest, batchId } : shipperRequest;

  // Build structured message for shipper notification with formattedData
  const shipperMessage = {
    messageTypes: messageType,
    message: "Shipper request status verified",
    status: status,
    formattedData: [
      {
        shipperRequest: shipperRequestWithBatch, // Single object, not array
        batchId, // Human-readable batch id at item top level too
        driverRequests: [driverRequestWithVehicle], // Array with vehicleOfDriver
        decisions: journeyDecision ? [journeyDecision] : [],
        journey: journeyData || {}, // Object, not array
      },
    ],
  };

  // Add optional data message if provided
  if (data) {
    shipperMessage.data = data;
  }

  // Add totalRecords/pagination info if provided (keep data field intact)
  if (totalRecords !== undefined) {
    shipperMessage.totalRecords = totalRecords;
  }
  if (pageSize !== undefined || page !== undefined) {
    shipperMessage.pageSize = pageSize;
    shipperMessage.page = page;
  }

  await sendSocketIONotificationToShipper({
    message: shipperMessage,
    phoneNumber: shipperPhoneNumber,
  });
};

/**
 * Verifies shipper status and finds drivers if needed
 * This is the main function that handles shipper request status verification
 * and driver matching/notifications
 * @param {Object} params - Verification parameters
 * @param {string} params.userUniqueId - Shipper's unique identifier
 * @param {Array} params.activeRequest - Pre-fetched active requests (optional)
 * @param {Object} params.totalRecords - Pre-calculated total records (optional)
 * @param {boolean} params.sendNotificationsToDrivers - Whether to send notifications to drivers
 * @param {number} params.pageSize - Page size for pagination
 * @param {number} params.page - Page number for pagination
 * @returns {Promise<Object>} Shipper status with drivers, decisions, and journey data
 */
const verifyShipperStatus = async ({
  userUniqueId,
  activeRequest,
  totalRecords,
  pageSize,
  page,
  queueOrganizationUniqueId,
}) => {
  try {
    // 1. Check if the user has an active request (status 1, 2, 3, 4, 5, 6)
    if (!activeRequest || activeRequest?.length === 0) {
      const dataOfActiveRequest = await checkActiveShipperRequest({
        userUniqueId,
        pageSize,
        page,
        queueOrganizationUniqueId,
      });

      activeRequest = dataOfActiveRequest?.activeRequests;
      totalRecords = dataOfActiveRequest?.totalRecords;
    }

    // If no active request, return with totalRecords format
    if (activeRequest?.length === 0 || !activeRequest) {
      // Ensure totalRecords is available (should be set by checkActiveShipperRequest)
      const defaultTotalRecords = {
        totalCount: 0,
        waitingCount: 0,
        requestedCount: 0,
        biddingCount: 0,
        acceptedByShipperCount: 0,
        journeyStartedCount: 0,
        notSeenCompletedCount: 0,
        notSeenCancelledByDriverCount: 0,
      };

      return {
        message: "Shipper request status verified",
        data: {
          totalRecords: totalRecords || defaultTotalRecords,
        },
      };
    }

    // const decisions = [],
    //   drivers = [],
    //   driversData = []; // Shared between handleWaitingRequest and handleNonWaitingRequest

    // let driverFound = false; // track if driver is found to re get active shipper request because no of waiting can be changed to requested
    // const notifiedDrivers = new Set(); // Track drivers who have already been notified to prevent duplicates
    // const notifiedShippersForAcceptance = new Set(); // Track shipper-driver combinations for acceptance notifications

    // // Shipper may have many requests so we loop through them
    // for (const shipperRequest of activeRequest) {
    //   const journeyStatusId = shipperRequest?.journeyStatusId,
    //     shipperRequestId = shipperRequest?.shipperRequestId;

    //   // If journeyStatusId is 1 (Waiting), find nearby drivers and send to them requests
    //   if (journeyStatusId === journeyStatusMap?.waiting) {
    //     const found = await handleWaitingRequest({
    //       shipperRequest,
    //       shipperRequestId,
    //       totalRecords,
    //       pageSize,
    //       page,
    //       driversData,
    //       drivers,
    //       decisions,
    //       notifiedDrivers,
    //     });
    //     if (found) driverFound = true;
    //   }
    //   // If journeyStatusId is not 1, return current data of shipper, driver, journey, and decisions
    //   else {
    //     await handleNonWaitingRequest({
    //       shipperRequest,
    //       totalRecords,
    //       pageSize,
    //       page,
    //       driversData,
    //       decisions,
    //       notifiedDrivers,
    //       notifiedShippersForAcceptance,
    //       sendNotificationsToDrivers,
    //       sendNotificationsToShipper,
    //     });
    //   }
    // }

    // // If driverFound re get active shipper request because no of waiting can be changed to requested
    // if (driverFound) {
    //   const dataOfActiveRequest = await checkActiveShipperRequest({
    //     userUniqueId,
    //     pageSize,
    //     page,
    //   });
    //   activeRequest = dataOfActiveRequest?.activeRequests;
    //   totalRecords = dataOfActiveRequest?.totalRecords;
    // }

    // Final return after loop: only summary
    return {
      message: "Shipper request status verified",
      data: {
        totalRecords,
      },
      pagination: {
        currentPage: page,
        limit: pageSize,
      },
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to verify shipper status", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      "Unable to verify shipper status",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = {
  verifyShipperStatus,
  getShipperJourneyStatus,
  seenByShipper,
  sendShipperNotification,
  handleWaitingRequest,
};
