const { getData } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");

const getCancellationNotifications = async ({ userUniqueId, seenStatus }) => {
  try {
    // Build WHERE conditions
    let whereConditions = [
      "DriverRequest.userUniqueId = ?",
      "DriverRequest.journeyStatusId IN (?, ?)",
    ];
    let queryParams = [
      userUniqueId,
      journeyStatusMap.cancelledByShipper,
      journeyStatusMap.cancelledByAdmin,
    ];

    // Add seen status filter if provided
    if (seenStatus) {
      whereConditions.push(
        "DriverRequest.isCancellationByShipperSeenByDriver = ?",
      );
      queryParams.push(seenStatus);
    }

    // Use raw SQL query for better control with aliases
    const sql = `
      SELECT 
        -- DriverRequest data
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.journeyStatusId,
        DriverRequest.originLatitude,
        DriverRequest.originLongitude,
        DriverRequest.originPlace,
        DriverRequest.driverRequestCreatedAt,
        DriverRequest.isCancellationByShipperSeenByDriver,
        
        -- Driver User data
        DriverUser.fullName as driverFullName,
        DriverUser.phoneNumber as driverPhoneNumber,
        DriverUser.email as driverEmail,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        
        -- ShipperRequest data
        ShipperRequest.shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
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
        ShipperUser.userUniqueId as shipperUserUniqueId,
        ShipperUser.fullName as shipperFullName,
        ShipperUser.phoneNumber as shipperPhoneNumber,
        ShipperUser.email as shipperEmail
        
      FROM DriverRequest
      INNER JOIN Users as DriverUser ON DriverRequest.userUniqueId = DriverUser.userUniqueId
      INNER JOIN JourneyDecisions ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN Users as ShipperUser ON ShipperRequest.userUniqueId = ShipperUser.userUniqueId
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY DriverRequest.driverRequestCreatedAt DESC
    `;

    const [results] = await pool.query(sql, queryParams);

    if (results.length === 0) {
      return {
        message: "success",
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
            driverRequest: {
              driverRequestId: request.driverRequestId,
              driverRequestUniqueId: request.driverRequestUniqueId,
              userUniqueId: request.driverUserUniqueId,
              journeyStatusId: request.journeyStatusId,
              originLatitude: request.originLatitude,
              originLongitude: request.originLongitude,
              originPlace: request.originPlace,
              driverRequestCreatedAt: request.driverRequestCreatedAt,
              isCancellationByShipperSeenByDriver:
                request.isCancellationByShipperSeenByDriver,
            },
            driver: {
              userUniqueId: request.driverUserUniqueId,
              fullName: request.driverFullName,
              phoneNumber: request.driverPhoneNumber,
              email: request.driverEmail,
            },
            shipper: {
              userUniqueId: request.shipperUserUniqueId,
              fullName: request.shipperFullName,
              phoneNumber: request.shipperPhoneNumber,
              email: request.shipperEmail,
            },
            shipperRequest: {
              shipperRequestId: request.shipperRequestId,
              shipperRequestUniqueId: request.shipperRequestUniqueId,
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
            },
            journeyDecision: {
              journeyDecisionId: request.journeyDecisionId,
              journeyDecisionUniqueId: request.journeyDecisionUniqueId,
              decisionTime: request.decisionTime,
              decisionBy: request.decisionBy,
            },
            journey: journey,
          };
        } catch (error) {
          const logger = require("../../Utils/logger");
          logger.error("Error enriching cancellation data", {
            error: error.message,
            stack: error.stack,
          });
          return null;
        }
      }),
    );

    // Filter out null results
    const validData = enrichedData.filter((item) => item !== null);

    return {
      message: "success",
      data: validData,
      count: validData.length,
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error getting cancellation notifications", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to get cancellation notifications",
      error.statusCode || 500,
    );
  }
};
const markNegativeStatusAsSeenByDriver = async ({
  driverRequestUniqueId,
  userUniqueId,
}) => {
  try {
    // First verify the driver request belongs to this user
    const driverRequest = await getData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId },
    });

    if (!driverRequest || driverRequest.length === 0) {
      throw new AppError("Driver request not found", 404);
    }

    const requestData = driverRequest[0];
    if (requestData.userUniqueId !== userUniqueId) {
      throw new AppError(
        "Unauthorized: Driver request does not belong to this user",
        403,
      );
    }

    const currentStatusId = requestData.journeyStatusId;

    // Validate that the status is one of the negative statuses
    const negativeStatuses = [
      journeyStatusMap.notSelectedInBid, // 14
      journeyStatusMap.rejectedByShipper, // 8
      journeyStatusMap.cancelledByShipper, // 7
      journeyStatusMap.cancelledByAdmin, // 10
      journeyStatusMap.cancelledBySystem, // 12
    ];

    if (!negativeStatuses.includes(currentStatusId)) {
      throw new AppError(
        "This request is not in a negative status that requires marking as seen",
        400,
      );
    }

    // Determine which table and field to update based on status
    let updateTable;
    let updateField;
    let statusName;

    if (currentStatusId === journeyStatusMap.notSelectedInBid) {
      // Status 14: Update JourneyDecisions.isNotSelectedSeenByDriver
      updateTable = "JourneyDecisions";
      updateField = "isNotSelectedSeenByDriver";
      statusName = "not selected in bid";
    } else if (currentStatusId === journeyStatusMap.rejectedByShipper) {
      // Status 8: Update JourneyDecisions.isRejectionByShipperSeenByDriver
      updateTable = "JourneyDecisions";
      updateField = "isRejectionByShipperSeenByDriver";
      statusName = "rejected by shipper";
    } else if (
      currentStatusId === journeyStatusMap.cancelledByShipper ||
      currentStatusId === journeyStatusMap.cancelledByAdmin ||
      currentStatusId === journeyStatusMap.cancelledBySystem
    ) {
      // Status 7, 10, 12: Update DriverRequest.isCancellationByShipperSeenByDriver
      updateTable = "DriverRequest";
      updateField = "isCancellationByShipperSeenByDriver";
      if (currentStatusId === journeyStatusMap.cancelledByShipper) {
        statusName = "cancelled by shipper";
      } else if (currentStatusId === journeyStatusMap.cancelledByAdmin) {
        statusName = "cancelled by admin";
      } else {
        statusName = "cancelled by system";
      }
    }

    // For JourneyDecisions updates, we need to get the journey decision
    if (updateTable === "JourneyDecisions") {
      const journeyDecisions = await getData({
        tableName: "JourneyDecisions",
        conditions: { driverRequestId: requestData.driverRequestId },
      });

      if (!journeyDecisions || journeyDecisions.length === 0) {
        throw new AppError(
          "Journey decision not found for this driver request",
          404,
        );
      }

      const journeyDecision = journeyDecisions[0];
      const journeyDecisionUniqueId = journeyDecision.journeyDecisionUniqueId;

      // Verify the journey decision status matches
      if (journeyDecision.journeyStatusId !== currentStatusId) {
        throw new AppError(
          `Journey decision status does not match driver request status`,
          400,
        );
      }

      // Update the seen status in JourneyDecisions table
      const { updateJourneyDecision } = require("../JourneyDecisions.service");
      await updateJourneyDecision({
        conditions: { journeyDecisionUniqueId },
        updateValues: {
          [updateField]: "seen by driver",
        },
        userUniqueId, // Required for validation
      });

      return {
        message: `${statusName} notification marked as seen`,
        data: null,
      };
    } else {
      // Update DriverRequest table directly
      const result = await updateData({
        tableName: "DriverRequest",
        conditions: {
          driverRequestUniqueId,
          userUniqueId, // Safeguard: ensure only the driver who owns the request can update
        },
        updateValues: {
          [updateField]: "seen by driver",
        },
      });

      if (result.affectedRows === 0) {
        throw new AppError("Failed to update seen status", 500);
      }

      return {
        message: `${statusName} notification marked as seen`,
        data: null,
      };
    }
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error marking negative status as seen", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to mark negative status as seen",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  getCancellationNotifications,
  markNegativeStatusAsSeenByDriver,
};
