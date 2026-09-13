"use strict";

const { pool } = require("../../../Middleware/Database.config");
const { getData, performJoinSelect } = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToShipper,
} = require("../../../Utils/Notifications");
const logger = require("../../../Utils/logger");
const AppError = require("../../../Utils/AppError");

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
    const { createRating, getAllRatings } = require("../../Ratings.service");
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
    const logger = require("../../../Utils/logger");
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

module.exports.seenByShipper = seenByShipper;
module.exports.sendShipperNotification = sendShipperNotification;
