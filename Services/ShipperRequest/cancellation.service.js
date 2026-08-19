const { getData, performJoinSelect } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const logger = require("../../Utils/logger");

/**
 * Gets cancellation notifications for a shipper
 * @param {Object} params - Query parameters
 * @param {string} params.userUniqueId - Shipper's unique identifier
 * @param {string} params.seenStatus - Filter by seen status (optional)
 * @param {number} params.page - Page number (default: 1)
 * @param {number} params.limit - Items per page (default: 10)
 * @returns {Promise<Object>} Cancellation notifications with pagination
 */
const getCancellationNotifications = async ({
  userUniqueId,
  seenStatus,
  page = 1,
  limit = 10,
}) => {
  try {
    const offset = (page - 1) * limit;
    // Build WHERE conditions
    let whereConditions = [
      "ShipperRequest.userUniqueId = ?",
      "JourneyDecisions.journeyStatusId IN (?, ?)",
    ];
    let queryParams = [
      userUniqueId,
      journeyStatusMap.cancelledByDriver,
      journeyStatusMap.cancelledByAdmin,
    ];

    // Add seen status filter if provided
    if (seenStatus) {
      whereConditions.push(
        "JourneyDecisions.isCancellationByDriverSeenByShipper = ?",
      );
      queryParams.push(seenStatus);
    }

    // Use raw SQL query for better control with aliases
    const sql = `
      SELECT 
        -- ShipperRequest data
        ShipperRequest.shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.shipperRequestBatchUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.originLatitude as shipperOriginLatitude,
        ShipperRequest.originLongitude as shipperOriginLongitude,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude,
        ShipperRequest.destinationLongitude,
        ShipperRequest.destinationPlace,
        ShipperRequest.shipperRequestCreatedAt as shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        
        -- Shipper User data
        ShipperUser.fullName as shipperFullName,
        ShipperUser.phoneNumber as shipperPhoneNumber,
        ShipperUser.email as shipperEmail,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.journeyStatusId,
        JourneyDecisions.isCancellationByDriverSeenByShipper,
        
        -- DriverRequest data
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude,
        DriverRequest.originLongitude,
        DriverRequest.originPlace,
        DriverRequest.driverRequestCreatedAt,
        
        -- Driver User data
        DriverUser.fullName as driverFullName,
        DriverUser.phoneNumber as driverPhoneNumber,
        DriverUser.email as driverEmail
        
      FROM JourneyDecisions
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN Users as ShipperUser ON ShipperRequest.userUniqueId = ShipperUser.userUniqueId
      INNER JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      INNER JOIN Users as DriverUser ON DriverRequest.userUniqueId = DriverUser.userUniqueId
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY JourneyDecisions.decisionTime DESC
      LIMIT ? OFFSET ?
    `;

    // Get total count query (before adding pagination params)
    const countSql = `
      SELECT COUNT(*) as total
      FROM JourneyDecisions
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      WHERE ${whereConditions.join(" AND ")}
    `;

    // Execute count query first (before adding pagination params)
    const executorCount = transactionStorage.getStore() || pool;
    const [countResults] = await executorCount.query(countSql, queryParams);
    const total = countResults[0]?.total || 0;

    // Add pagination params to query params for main query
    const paginatedQueryParams = [
      ...queryParams,
      parseInt(limit),
      parseInt(offset),
    ];

    const executorMain = transactionStorage.getStore() || pool;
    const [results] = await executorMain.query(sql, paginatedQueryParams);

    if (results.length === 0) {
      return {
        message: "No cancellation notifications found",
        data: [],
        count: 0,
      };
    }

    // Get journey data for each request
    const enrichedData = await Promise.all(
      results.map(async (request) => {
        try {
          // Get journey data if exists
          let journey = null;
          if (request.journeyDecisionUniqueId) {
            const journeyData = await performJoinSelect({
              baseTable: "Journey",
              joins: [
                {
                  table: "JourneyDecisions",
                  on: "Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId",
                },
              ],
              conditions: {
                "Journey.journeyDecisionUniqueId":
                  request.journeyDecisionUniqueId,
              },
            });
            journey = journeyData?.[0] || null;
          }

          // Structure the response
          return {
            shipper: {
              shipperRequestId: request.shipperRequestId,
              shipperRequestUniqueId: request.shipperRequestUniqueId,
              batchUniqueId: request.shipperRequestBatchUniqueId,
              shipperUserUniqueId: request.shipperUserUniqueId,
              vehicleTypeUniqueId: request.vehicleTypeUniqueId,
              originLatitude: request.shipperOriginLatitude,
              originLongitude: request.shipperOriginLongitude,
              originPlace: request.shipperOriginPlace,
              destinationLatitude: request.destinationLatitude,
              destinationLongitude: request.destinationLongitude,
              destinationPlace: request.destinationPlace,
              shipperRequestCreatedAt: request.shipperRequestCreatedAt,
              shippableItemName: request.shippableItemName,
              shippableItemQtyInQuintal: request.shippableItemQtyInQuintal,
              shippingDate: request.shippingDate,
              deliveryDate: request.deliveryDate,
              shippingCost: request.shippingCost,
              fullName: request.shipperFullName,
              phoneNumber: request.shipperPhoneNumber,
              email: request.shipperEmail,
            },
            driver: {
              userId: request.driverUserUniqueId,
              userUniqueId: request.driverUserUniqueId,
              fullName: request.driverFullName,
              phoneNumber: request.driverPhoneNumber,
              email: request.driverEmail,
            },
            journeyDecision: {
              journeyDecisionId: request.journeyDecisionId,
              journeyDecisionUniqueId: request.journeyDecisionUniqueId,
              decisionTime: request.decisionTime,
              decisionBy: request.decisionBy,
              journeyStatusId: request.journeyStatusId,
              isCancellationByDriverSeenByShipper:
                request.isCancellationByDriverSeenByShipper,
            },
            journey: journey,
          };
        } catch (error) {
          const logger = require("../../Utils/logger");
          logger.error("Error enriching cancellation data", {
            error: error.message,
            stack: error.stack,
          });
          // Return basic structure if enrichment fails
          return {
            shipper: null,
            driver: null,
            journeyDecision: {
              journeyDecisionUniqueId: request.journeyDecisionUniqueId,
              journeyStatusId: request.journeyStatusId,
            },
            journey: null,
          };
        }
      }),
    );

    return {
      message: "Cancellation notifications fetched successfully",
      data: enrichedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit: parseInt(limit),
      },
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error getting canceled journeys", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to get cancellation notifications",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Marks a cancellation notification as seen by shipper
 * @param {Object} body - Mark as seen data
 * @param {string} body.userUniqueId - Shipper's unique identifier
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @returns {Promise<Object>} Success or error response
 */
const markCancellationAsSeen = async ({
  userUniqueId,
  journeyDecisionUniqueId,
}) => {
  try {
    if (!userUniqueId || !journeyDecisionUniqueId) {
      throw new AppError(
        "userUniqueId and journeyDecisionUniqueId are required",
        AppError.BAD_REQUEST,
      );
    }

    // Get the journey decision to verify it belongs to this shipper
    const journeyDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
    });

    if (!journeyDecision || journeyDecision.length === 0) {
      throw new AppError("Journey decision not found", AppError.NOT_FOUND);
    }

    const shipperRequestId = journeyDecision?.[0]?.shipperRequestId;
    logger.debug(
      "@shipperRequestId => " +
        shipperRequestId +
        "\n@userUniqueId => " +
        userUniqueId,
    );
    // Verify the shipper request belongs to this user
    const shipperRequest = await getData({
      tableName: "ShipperRequest",
      conditions: {
        shipperRequestId,
        userUniqueId,
      },
    });

    if (!shipperRequest || shipperRequest.length === 0) {
      throw new AppError(
        "Unauthorized: This cancellation does not belong to you",
        AppError.FORBIDDEN,
      );
    }

    // Update the seen status
    const result = await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: {
        isCancellationByDriverSeenByShipper: "seen by shipper",
      },
    });

    if (result.affectedRows === 0) {
      throw new AppError("Unable to update cancellation status", AppError.BAD_REQUEST);
    }

    return {
      message: "Cancellation marked as seen successfully",
      data: null,
    };
  } catch (error) {
    throw new AppError(
      error.message || "Unable to mark cancellation as seen",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = {
  getCancellationNotifications,
  markCancellationAsSeen,
};
