const {
  releaseConflictingOffers,
} = require("./actionReleaseConflictingOffers.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createDriverRequest } = require("../../CRUD/Create/CreateData");

const { createJourneyDecision } = require("../JourneyDecisions.service");
const { currentDate } = require("../../Utils/CurrentDate");

const {
  journeyStatusMap,

  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");

const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");

const AppError = require("../../Utils/AppError");

/**
 * Creates a new driver request and accepts an existing shipper request
 * This is used when a driver wants to accept a specific shipper request
 * @param {Object} body - Request body containing shipperRequestUniqueId and userUniqueId
 * @returns {Promise<Object>} Response containing driver status with shipper request
 */
const createAndAcceptNewRequest = async (body, connection = null) => {
  try {
    // return;
    const { shipperRequestUniqueId, userUniqueId } = body;
    // get shipper request data by shipperRequestUniqueId,
    const { getShipperRequest4allOrSingleUser } = require("../ShipperRequest");
    const shipperRequestResult = await getShipperRequest4allOrSingleUser({
      data: {
        target: "all",
        filters: { shipperRequestUniqueId },
        page: 1,
        limit: 1,
      },
    });

    const shipperRequest =
      shipperRequestResult?.data?.[0]?.shipperRequest || null;
    logger.debug("@shipperRequest", { shipperRequest });
    const shipperJourneyStatusId = shipperRequest?.journeyStatusId;
    const shipperRequestId = shipperRequest?.shipperRequestId;
    // check if the shipper request is already accepted by driver
    if (shipperJourneyStatusId > journeyStatusMap.acceptedByDriver) {
      throw new AppError("Shipper request already accepted by driver", AppError.BAD_REQUEST);
    }
    if (!shipperJourneyStatusId) {
      throw new AppError("Shipper request not found", AppError.NOT_FOUND);
    }
    // validate if the request exists
    if (shipperRequest?.message === "error") {
      throw new AppError(shipperRequest.error || "Shipper request error", AppError.BAD_REQUEST);
    }
    // verify if there was any shipper-driver relation/decision before
    // Only match ACTIVE decisions (statuses 1-5) — ignore completed, cancelled, etc.
    const { pool } = require("../../Middleware/Database.config");
    const sql = `SELECT * FROM JourneyDecisions, ShipperRequest, DriverRequest 
    WHERE ShipperRequest.shipperRequestId=? 
    AND JourneyDecisions.shipperRequestId=ShipperRequest.shipperRequestId 
    AND JourneyDecisions.driverRequestId=DriverRequest.driverRequestId 
    AND DriverRequest.userUniqueId=?
    AND JourneyDecisions.journeyStatusId IN (${activeJourneyStatuses.join(", ")})`;

    const sqlValues = [shipperRequestId, userUniqueId];
    const executor = connection || pool;
    const [journeyDecisions] = await executor.query(sql, sqlValues);

    // if linkage exists, handle existing data
    if (journeyDecisions.length > 0) {
      // 1)update journeyDecision status to accepted by driver
      const journeyDecision = journeyDecisions?.[0];
      const journeyDecisionUniqueId = journeyDecision?.journeyDecisionUniqueId;
      const driverRequestId = journeyDecision?.driverRequestId;

      // Wrap all updates in a transaction to ensure atomicity
      await executeInTransaction(
        async (connection) => {
          // Update JourneyDecisions
          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
              shippingCostByDriver: body.shippingCostByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // Update ShipperRequest
          await updateData({
            tableName: "ShipperRequest",
            conditions: { shipperRequestUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // Update DriverRequest
          await updateData({
            tableName: "DriverRequest",
            conditions: { driverRequestId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });
        },
        {
          timeout: 10000, // 10 second timeout for driver acceptance
          logging: true,
        },
      );
    }
    // if linkage doesn't exist, create new linkage
    else {
      // Wrap all operations in a transaction to ensure atomicity
      await executeInTransaction(
        async (connection) => {
          // Check for existing active driver request using transaction connection
          const sqlToCheckActiveRequest = `
            SELECT * FROM DriverRequest 
            WHERE userUniqueId = ? 
            AND journeyStatusId IN (${activeJourneyStatuses.join(", ")})
            LIMIT 1
          `;
          const [existingActiveRequests] = await connection.query(
            sqlToCheckActiveRequest,
            [userUniqueId],
          );

          // If active request exists, handle based on status
          if (existingActiveRequests?.length > 0) {
            const activeRequest = existingActiveRequests[0];
            const activeRequestStatus = activeRequest.journeyStatusId;

            // If status > 2 (ongoing journey), return error - cannot cancel
            if (activeRequestStatus >= journeyStatusMap.acceptedByDriver) {
              throw new Error(
                "Cannot create new request. You have an ongoing journey. Please complete or cancel it first.",
              );
            }

            // If status is 1 (waiting) or 2 (acceptedByDriver), cancel it
            if (
              activeRequestStatus === journeyStatusMap.waiting ||
              activeRequestStatus === journeyStatusMap.requested
            ) {
              // Cancel the existing request
              await updateData({
                tableName: "DriverRequest",
                conditions: { driverRequestId: activeRequest.driverRequestId },
                updateValues: {
                  journeyStatusId: journeyStatusMap.cancelledByDriver,
                },
                connection,
              });
            }
          }

          // Create new driver request within transaction
          const newDriverRequest = await createDriverRequest(
            body,
            userUniqueId,
            journeyStatusMap.acceptedByDriver,
            connection, // Pass connection for transaction support
          );

          // validate if the insert was successful or not
          if (newDriverRequest?.message === "error") {
            throw new Error(
              newDriverRequest?.error || "Failed to create driver request",
            );
          }

          const driverRequestData = newDriverRequest?.data?.[0];
          const driverRequestId = driverRequestData?.driverRequestId;

          if (!driverRequestId) {
            throw new Error("Failed to get driver request ID");
          }

          // Create journey decision within transaction
          const journeyDecisionData = {
            shipperRequestId: shipperRequestId, // Use the variable extracted earlier
            driverRequestId,
            journeyStatusId: journeyStatusMap?.acceptedByDriver,
            decisionTime: currentDate(),
            decisionBy: "driver",
            shippingCostByDriver: body?.shippingCostByDriver,
            journeyDecisionCreatedBy: userUniqueId,
          };

          const newJourneyDecision = await createJourneyDecision(
            journeyDecisionData,
            connection, // Pass connection for transaction support
          );

          // validate if the insert was successful or not
          if (newJourneyDecision?.message === "error") {
            throw new Error(
              newJourneyDecision?.data || "Failed to create journey decision",
            );
          }

          // Update shipper request status to accepted by driver within transaction
          const updatedShipperRequest = await updateData({
            tableName: "ShipperRequest",
            conditions: { shipperRequestUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // validate if the update was successful
          if (updatedShipperRequest.affectedRows === 0) {
            throw new Error("Shipper request not found or update failed");
          }
        },
        {
          timeout: 15000, // 15 second timeout for creating new linkage
          logging: true,
        },
      );
    }

    // Auto-release conflicting company assignments
    await releaseConflictingOffers(userUniqueId, "individual");

    const { verifyDriverJourneyStatus } = require("./statusVerification");
    return await verifyDriverJourneyStatus({
      userUniqueId,
    });
  } catch (error) {
    logger.error("Unable to create and accept request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to create and accept request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};
module.exports = { createAndAcceptNewRequest };
