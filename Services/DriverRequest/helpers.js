const { v4: uuidv4 } = require("uuid");
const { getUserByFilterDetailed } = require("../User.service");
const {
  usersRoles,
  USER_STATUS,
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const { insertData } = require("../../CRUD/Create/CreateData");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  VerifyIfShipperRequestWasNotRejected,
} = require("../../Utils/RejectedRequests");
// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
const {
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const {
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const {
  getJourneyDecisionByJourneyDecisionUniqueId,
} = require("../JourneyDecisions.service");
const { getVehicleDrivers } = require("../VehicleDriver.service");
const { getData } = require("../../CRUD/Read/ReadData");
const { currentDate } = require("../../Utils/CurrentDate");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const AppError = require("../../Utils/AppError");

/**
 * Checks if a driver is healthy (not deleted and has active status)
 * @param {string} userUniqueId - Driver's unique identifier
 * @returns {Promise<boolean>} - True if driver is healthy
 */
const checkIfDriverIsHealthy = async (userUniqueId) => {
  const filters = { userUniqueId };
  const userDetails = await getUserByFilterDetailed(filters);
  const data = userDetails?.data?.[0];
  let isHealthy = true;

  // Check if user is deleted
  if (data?.user?.isDeleted) {
    isHealthy = false;
  }

  // Check driver role status
  const rolesAndStatuses = data?.rolesAndStatuses;
  rolesAndStatuses?.map((RS) => {
    if (RS?.userRoles?.roleId === usersRoles.driverRoleId) {
      if (RS?.userRoleStatuses?.statusId !== USER_STATUS.ACTIVE) {
        isHealthy = false;
      }
    }
  });

  return isHealthy;
};

/**
 * Creates a standardized response object for driver status
 * @param {Object} driver - Driver request object
 * @param {Object} vehicle - Vehicle object
 * @param {Object} shipper - Shipper request object
 * @param {Object} decision - Journey decision object
 * @param {number} status - Journey status ID
 * @returns {Object} Standardized response object
 */
const createResponse = (driver, vehicle, shipper, decision, status) => ({
  message: "Driver status fetched",
  status,
  uniqueIds: {
    driverRequestUniqueId: driver?.driverRequestUniqueId,
    shipperRequestUniqueId: shipper?.shipperRequestUniqueId,
    journeyDecisionUniqueId: decision?.journeyDecisionUniqueId,
  },
  driver: { driver, vehicle },
  shipper,
  journey: null,
  decision,
});

/**
 * Finds the first shipper that hasn't been rejected by the driver
 * @param {Array} shippers - Array of shipper requests
 * @param {string} userUniqueId - Driver's unique identifier
 * @returns {Promise<Object|null>} - First non-rejected shipper or null
 */
const findNonRejectedShipper = async (shippers, userUniqueId) => {
  for (const shipper of shippers) {
    const rejectedResult = await VerifyIfShipperRequestWasNotRejected({
      shipperRequestId: shipper.shipperRequestId,
      shipperRequestBatchUniqueId: shipper.shipperRequestBatchUniqueId,
      driverUserUniqueId: userUniqueId,
    });
    if (rejectedResult?.message === "success") {
      return shipper;
    }
  }
  return null;
};

/**
 * Creates a journey decision payload object
 * @param {number} shipperRequestId - Shipper request ID
 * @param {number} driverRequestId - Driver request ID
 * @returns {Object} Journey decision payload
 */
const createJourneyDecisionPayload = (
  shipperRequestId,
  driverRequestId,
  userUniqueId,
  decisionBy = "driver",
) => ({
  journeyDecisionUniqueId: uuidv4(),
  shipperRequestId,
  driverRequestId,
  journeyStatusId: journeyStatusMap.requested,
  decisionTime: currentDate(),
  decisionBy,
  journeyDecisionCreatedBy: userUniqueId,
  journeyDecisionCreatedAt: currentDate(),
});

/**
 * Executes status updates for driver and shipper requests in parallel
 * @param {Object} journeyDecisionPayload - Journey decision data
 * @param {string} driverRequestUniqueId - Driver request unique ID
 * @param {number} shipperRequestId - Shipper request ID
 * @param {Object} connection - Optional: Database connection for transaction support
 * @returns {Promise<void>}
 */
const executeStatusUpdates = async (
  journeyDecisionPayload,
  driverRequestUniqueId,
  shipperRequestId,
) => {
  // Wrap all three operations in a transaction to ensure atomicity
  // This prevents partial updates if any operation fails
  const { executeInTransaction } = require("../../Utils/DatabaseTransaction");

  await executeInTransaction(
    async (conn) => {
      // Create JourneyDecision within transaction
      // Handle race condition where JourneyDecisions row already exists
      // (status reset → re-poll scenario)
      try {
        await insertData({
          tableName: "JourneyDecisions",
          colAndVal: journeyDecisionPayload,
          connection: conn,
        });
      } catch (insertErr) {
        if (insertErr.code === "ER_DUP_ENTRY") {
          // Row already exists — update it instead
          await updateData({
            tableName: "JourneyDecisions",
            conditions: {
              driverRequestId: journeyDecisionPayload.driverRequestId,
            },
            updateValues: {
              journeyStatusId: journeyStatusMap.requested,
              decisionTime: currentDate(),
              journeyDecisionUpdatedAt: currentDate(),
            },
            connection: conn,
          });
        } else {
          throw insertErr;
        }
      }

      // Update DriverRequest within transaction
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestUniqueId },
        updateValues: { journeyStatusId: journeyStatusMap.requested },
        connection: conn, // Pass connection for transaction support
      });

      // Update ShipperRequest within transaction
      await updateData({
        tableName: "ShipperRequest",
        conditions: { shipperRequestId },
        updateValues: { journeyStatusId: journeyStatusMap.requested },
        connection: conn, // Pass connection for transaction support
      });
    },
    {
      timeout: 15000, // 15 second timeout for auto-matching updates
      logging: true,
    },
  );
};

/**
 * Sends WebSocket notification to shipper
 * @param {Object} shipper - Shipper object with userUniqueId and phoneNumber
 * @returns {Promise<Object>} Success or error response
 */
const sendShipperNotification = async (shipper) => {
  try {
    // Send simple notification - shipper should call verifyShipperStatus endpoint for full status
    await sendSocketIONotificationToShipper({
      message: {
        message:
          "Your request status has been updated. Please check your status.",
        data: null,
        requiresStatusCheck: true,
      },
      phoneNumber: shipper.phoneNumber,
    });

    return { message: "Notification sent successfully" };
  } catch (error) {
    throw new AppError(
      error.message || "Error in sendShipperNotification",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Resolves the numeric batchId (INT) for a given shipperRequestBatchUniqueId.
 * Reuses the same pattern as sendShipperNotification / handleJourneyStatusOne so
 * payloads can render "Order #batchId / shipperRequestId".
 * @param {string|null} batchUniqueId - ShipperRequestBatch.batchUniqueId
 * @param {string} context - Logging context (caller name)
 * @returns {Promise<number|null>} The numeric batchId, or null if unresolvable
 */
const resolveBatchId = async (batchUniqueId, context = "resolveBatchId") => {
  if (!batchUniqueId) {
    return null;
  }
  try {
    const executor = transactionStorage.getStore() || pool;
    const [[batchRow]] = await executor.query(
      `SELECT batchId FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
      [batchUniqueId],
    );
    return batchRow?.batchId ?? null;
  } catch (e) {
    const logger = require("../../Utils/logger");
    logger.warn(`@${context}: failed to resolve batchId`, {
      error: e.message,
      batchUniqueId,
    });
    return null;
  }
};

/**
 * Fetches all data needed for sending journey notifications to shippers
 * Optimized to accept already-fetched data to avoid redundant database queries
 * @param {string} journeyDecisionUniqueId - Journey decision unique identifier
 * @param {Array} driverRequest - Optional: Driver request data (array format) to avoid re-fetching
 * @param {Object} vehicle - Optional: Vehicle data to avoid re-fetching
 * @param {Object|Array} journeyDecisionData - Optional: Journey decision data to avoid re-fetching
 *   - If Array: [journeyDecision] (from getData)
 *   - If Object: { message: "success", data: [journeyDecision] } (from getJourneyDecisionByJourneyDecisionUniqueId)
 *   - If Object with data property: { data: [journeyDecision] }
 * @returns {Promise<Object>} Object containing shipperRequest, journeyDecision, driverInfo, and journeyData
 */
const fetchJourneyNotificationData = async (
  journeyDecisionUniqueId,
  driverRequest = null,
  vehicle = null,
  journeyDecisionData = null,
) => {
  try {
    // Use passed journey decision data if available, otherwise fetch it
    let journeyDecision;
    if (journeyDecisionData) {
      // Normalize journey decision data format to expected structure
      if (Array.isArray(journeyDecisionData)) {
        // Format from getData: [journeyDecision] -> convert to { data: [journeyDecision] }
        journeyDecision = { data: journeyDecisionData };
      } else if (journeyDecisionData.data) {
        // Format already has data property: { data: [journeyDecision] }
        journeyDecision = journeyDecisionData;
      } else {
        // Assume it's already in expected format
        journeyDecision = journeyDecisionData;
      }
    } else {
      // Fetch journey decision for this specific request
      journeyDecision = await getJourneyDecisionByJourneyDecisionUniqueId(
        journeyDecisionUniqueId,
      );
    }

    if (!journeyDecision?.data?.length) {
      throw new AppError("Journey decision not found", AppError.NOT_FOUND);
    }

    const journeyDecisionDataNormalized = journeyDecision.data[0];
    const shipperRequestId = journeyDecisionDataNormalized.shipperRequestId;
    const driverRequestId = journeyDecisionDataNormalized.driverRequestId;

    // Fetch shipper request data with user info
    const shipperRequestData = await performJoinSelect({
      baseTable: "ShipperRequest",
      joins: [
        {
          table: "Users",
          on: "ShipperRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { shipperRequestId },
    });

    if (!shipperRequestData?.length) {
      throw new AppError("Shipper request not found", AppError.NOT_FOUND);
    }

    const shipperRequest = shipperRequestData[0];

    // Resolve the human-readable batchId (INT) so the driver app can render
    // "Order #batchId / shipperRequestId" in the journey/notification payloads.
    const batchId = await resolveBatchId(
      shipperRequest?.shipperRequestBatchUniqueId,
      "fetchJourneyNotificationData",
    );
    if (batchId !== null) {
      shipperRequest.batchId = batchId;
    }

    // Fetch shipper profile photo (mirrors the driver profile photo logic below
    // and the frontend's /api/user/attachedDocuments?documentTypeId=4 lookup).
    let shipperProfilePhoto = null;
    try {
      const shipperDocuments =
        await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
          shipperRequest.userUniqueId,
          listOfDocumentsTypeAndId.profilePhoto,
        );
      const shipperProfilePhotoData = shipperDocuments?.data;
      const lastPhotoIndex = shipperProfilePhotoData?.length - 1;
      shipperProfilePhoto =
        shipperProfilePhotoData?.[lastPhotoIndex]?.attachedDocumentName;
      if (shipperProfilePhoto) {
        shipperRequest.profileImage = shipperProfilePhoto;
      }
    } catch (error) {
      const logger = require("../../Utils/logger");
      logger.error("Error fetching shipper profile photo", {
        error: error.message,
        stack: error.stack,
      });
    }

    // Fetch driver request data with user info
    let driverRequestData = null;
    if (!driverRequest || driverRequest?.length === 0) {
      driverRequestData = await performJoinSelect({
        baseTable: "DriverRequest",
        joins: [
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { driverRequestId },
      });
    } else {
      driverRequestData = driverRequest;
    }

    if (!driverRequestData?.length) {
      throw new AppError("Driver request not found", AppError.NOT_FOUND);
    }

    const driver = driverRequestData[0];

    // Fetch driver profile photo
    let driverProfilePhoto = null;
    try {
      const driverDocuments =
        await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
          driver.userUniqueId,
          listOfDocumentsTypeAndId.profilePhoto,
        );
      const driverProfilePhotoData = driverDocuments?.data;
      const lastPhotoIndex = driverProfilePhotoData?.length - 1;
      driverProfilePhoto =
        driverProfilePhotoData?.[lastPhotoIndex]?.attachedDocumentName;
    } catch (error) {
      const logger = require("../../Utils/logger");
      logger.error("Error fetching driver profile photo", {
        error: error.message,
        stack: error.stack,
      });
    }

    // Fetch vehicle data for driver
    let vehicleOfDriver = vehicle || null;
    try {
      if (!vehicleOfDriver) {
        const vdResult = await getVehicleDrivers({
          driverUserUniqueId: driver.userUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1,
        });
        vehicleOfDriver = vdResult?.data?.[0] || null;
      }
    } catch (error) {
      const logger = require("../../Utils/logger");
      logger.error("Error fetching vehicle data", {
        error: error.message,
        stack: error.stack,
      });
    }

    // Build driver info structure
    const driverInfo = {
      vehicleOfDriver,
      driver: { ...driver, driverProfilePhoto },
    };

    // Fetch journey data if the journey exists (created at accept for queue
    // orders — status 4 — and at startJourney — status 5 — for nearby matches).
    let journeyData = {};
    if (
      journeyDecisionDataNormalized.journeyStatusId >=
      journeyStatusMap.acceptedByShipper
    ) {
      try {
        const journeyResult = await getData({
          tableName: "Journey",
          conditions: {
            journeyDecisionUniqueId: journeyDecisionUniqueId,
          },
        });
        journeyData = journeyResult?.length > 0 ? journeyResult[0] : {};
      } catch (error) {
        const logger = require("../../Utils/logger");
        logger.error("Error fetching journey data", {
          error: error.message,
          stack: error.stack,
        });
      }
    }

    return {
      message: "Request data fetched",
      shipperRequest,
      journeyDecision: journeyDecisionDataNormalized,
      driverInfo,
      journeyData,
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error in fetchJourneyNotificationData:", {
      error: error.message,
    });
    throw new AppError(
      error.message || "Unable to fetch journey notification data",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Build the driverRequest-formal structure expected by fetchJourneyNotificationData
const buildDriverRequestData = (combinedData) => ({
  driverRequestId: combinedData.driverRequestId,
  driverRequestUniqueId: combinedData.driverRequestUniqueId,
  userUniqueId: combinedData.userUniqueId,
  fullName: combinedData.fullName,
  email: combinedData.email,
  phoneNumber: combinedData.phoneNumber,
});

// Build the journeyDecision-formal structure expected by fetchJourneyNotificationData
const buildJourneyDecisionFromJoin = (combinedData, journeyStatusId) => ({
  journeyDecisionUniqueId: combinedData.journeyDecisionUniqueId,
  shipperRequestId: combinedData.shipperRequestId,
  driverRequestId: combinedData.driverRequestId,
  journeyStatusId,
  decisionTime: combinedData.decisionTime,
  decisionBy: combinedData.decisionBy,
  shippingCostByDriver: combinedData.shippingCostByDriver,
  shippingDateByDriver: combinedData.shippingDateByDriver,
  deliveryDateByDriver: combinedData.deliveryDateByDriver,
});

module.exports = {
  checkIfDriverIsHealthy,
  createResponse,
  findNonRejectedShipper,
  createJourneyDecisionPayload,
  executeStatusUpdates,
  sendShipperNotification,
  fetchJourneyNotificationData,
  resolveBatchId,
  buildDriverRequestData,
  buildJourneyDecisionFromJoin,
};
