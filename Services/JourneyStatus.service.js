const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
const { insertData } = require("../CRUD/Create/CreateData");
const { currentDate } = require("../Utils/CurrentDate");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const logger = require("../Utils/logger");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new journey status
const createJourneyStatus = async (body, user) => {
  const { journeyStatusName, journeyStatusDescription } = body;
  const journeyStatusUniqueId = body.journeyStatusUniqueId || uuidv4();
  const createdBy = user?.userUniqueId || journeyStatusUniqueId;

  // Check if the journey status already exists
  const existingJourneyStatus = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusName },
  });

  if (existingJourneyStatus.length > 0) {
    throw new AppError("Journey status already exists", 400);
  }

  const newJourneyStatus = {
    journeyStatusUniqueId,
    journeyStatusName,
    journeyStatusDescription,
    journeyStatusCreatedBy: createdBy,
    journeyStatusCreatedAt: currentDate(),
  };

  if (body.journeyStatusId) {
    newJourneyStatus.journeyStatusId = body.journeyStatusId;
  }

  const result = await insertData({
    tableName: "JourneyStatus",
    colAndVal: newJourneyStatus,
  });

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "New Journey Status created successfully",
    };
  } else {
    throw new AppError("Failed to create journey status", 500);
  }
};

// Update a journey status by unique ID (dynamic)
const updateJourneyStatusByUniqueId = async (
  journeyStatusUniqueId,
  updatePayload,
  user,
) => {
  const userUniqueId = user?.userUniqueId;
  if (!userUniqueId) {
    throw new AppError("User authentication required", 401);
  }

  // Check if journey status exists and is not deleted
  const existingStatus = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId, journeyStatusDeletedAt: null },
  });
  if (!existingStatus || existingStatus.length === 0) {
    throw new AppError("Journey status not found or already deleted", 404);
  }

  const updateDataValues = { ...updatePayload };
  const updateValues = {
    journeyStatusName: updateDataValues.journeyStatusName,
    journeyStatusDescription: updateDataValues.journeyStatusDescription,
  };

  if (Object.keys(updateValues).length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Execute pure SQL update to avoid NULL handling issues in updateData
  const sql = `
    UPDATE JourneyStatus
    SET journeyStatusName = ?, journeyStatusDescription = ?, journeyStatusUpdatedBy = ?, journeyStatusUpdatedAt = ?
    WHERE journeyStatusUniqueId = ?
  `;
  const values = [
    updateValues.journeyStatusName,
    updateValues.journeyStatusDescription,
    updateValues.journeyStatusUpdatedBy,
    updateValues.journeyStatusUpdatedAt,
    journeyStatusUniqueId,
  ];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  if (result.affectedRows > 0) {
    return { message: "success", data: "Journey status updated successfully" };
  }
  throw new AppError("Journey status update failed", 500);
};

// Soft delete a journey status by unique ID
const deleteJourneyStatusByUniqueId = async (journeyStatusUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const existing = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId },
  });

  if (!existing || existing.length === 0) {
    throw new AppError("Journey status not found", 404);
  }
  if (existing[0]?.journeyStatusDeletedAt) {
    throw new AppError("Journey status already deleted", 400);
  }

  // Execute pure SQL soft delete to avoid NULL handling issues in updateData
  const sql = `
    UPDATE JourneyStatus
    SET journeyStatusDeletedAt = ?, journeyStatusDeletedBy = ?
    WHERE journeyStatusUniqueId = ?
  `;
  const values = [currentDate(), userUniqueId, journeyStatusUniqueId];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows > 0) {
    return { message: "success", data: "Journey status deleted successfully" };
  }
  throw new AppError("Journey status delete failed", 500);
};

// Get all journey statuses
const getAllJourneyStatuses = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 100, 1000);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters?.journeyStatusUniqueId) {
    clauses.push("journeyStatusUniqueId = ?");
    params.push(filters.journeyStatusUniqueId);
  }

  if (filters?.journeyStatusName) {
    clauses.push("journeyStatusName LIKE ?");
    params.push(`%${String(filters.journeyStatusName).trim()}%`);
  }

  if (filters?.journeyStatusDescription) {
    clauses.push("journeyStatusDescription LIKE ?");
    params.push(`%${String(filters.journeyStatusDescription).trim()}%`);
  }

  if (filters?.journeyStatusCreatedAt) {
    clauses.push("DATE(journeyStatusCreatedAt) = DATE(?)");
    params.push(filters.journeyStatusCreatedAt);
  }

  if (filters?.journeyStatusDeletedAt === "notNull") {
    clauses.push("journeyStatusDeletedAt IS NOT NULL");
  } else if (
    filters.journeyStatusDeletedAt === "null" ||
    filters.journeyStatusDeletedAt === undefined
  ) {
    clauses.push("journeyStatusDeletedAt IS NULL");
  } else if (filters.journeyStatusDeletedAt) {
    clauses.push("DATE(journeyStatusDeletedAt) = DATE(?)");
    params.push(filters.journeyStatusDeletedAt);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT *
    FROM JourneyStatus
    ${whereClause}
    ORDER BY journeyStatusCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM JourneyStatus
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  if (!rows || rows.length === 0) {
    throw new AppError("No journey statuses found", 404);
  }

  return {
    message: "success",
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// Get a journey status by ID
const getJourneyStatusById = async (journeyStatusUniqueId) => {
  const result = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId },
  });

  if (result.length > 0) {
    return {
      message: "success",
      data: result[0],
    };
  } else {
    throw new AppError("Journey status not found", 404);
  }
};

// Delete a journey status by ID
const deleteJourneyStatus = async (journeyStatusUniqueId) => {
  const result = await deleteData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId },
  });

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Journey status with ID ${journeyStatusUniqueId} deleted successfully`,
    };
  } else {
    throw new AppError("Failed to delete journey status", 500);
  }
};

/**
 * Updates journey status to a "negative" status (rejection/cancellation)
 * with safeguards to prevent re-updates and proper "seen by" flag handling
 *
 * Supported statuses:
 * - notSelectedInBid (14)
 * - rejectedByPassenger (8)
 * - cancelledByPassenger (7)
 * - cancelledByAdmin (10)
 * - cancelledBySystem (12)
 *
 * @param {Object} params
 * @param {number} params.driverRequestId - Driver request ID (required if driverRequestUniqueId not provided)
 * @param {string} params.driverRequestUniqueId - Driver request unique ID (required if driverRequestId not provided)
 * @param {string} params.journeyDecisionUniqueId - Journey decision unique ID (optional, for JourneyDecisions and Journey updates)
 * @param {number} params.newStatusId - New status ID (must be one of the negative statuses)
 * @returns {Promise<Object>} Update results with affectedRows for each table
 */
const updateNegativeJourneyStatus = async ({
  driverRequestId,
  driverRequestUniqueId,
  journeyDecisionUniqueId,
  newStatusId,
}) => {
  try {
    logger.debug("@updateNegativeJourneyStatus", {
      driverRequestId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      newStatusId,
    });

    // Validate that newStatusId is one of the supported negative statuses
    const negativeStatuses = [
      journeyStatusMap.notSelectedInBid, // 14
      journeyStatusMap.rejectedByPassenger, // 8
      journeyStatusMap.cancelledByPassenger, // 7
      journeyStatusMap.cancelledByAdmin, // 10
      journeyStatusMap.cancelledBySystem, // 12
    ];

    if (!negativeStatuses.includes(newStatusId)) {
      throw new AppError(
        "Invalid request data: unsupported new status ID",
        400,
      );
    }

    // Validate that at least one identifier is provided
    if (!driverRequestId && !driverRequestUniqueId) {
      throw new AppError(
        "Invalid request: missing driver request identifier",
        400,
      );
    }

    // Safeguard: Only update if current status is acceptedByDriver or requested
    // This prevents re-updating records that have already been updated
    const allowedCurrentStatuses = [
      journeyStatusMap.acceptedByDriver, // 3
      journeyStatusMap.requested, // 2
      journeyStatusMap.acceptedByPassenger,
    ];

    const updatePromises = [];
    const results = {};

    // 1. Update DriverRequest
    const driverUpdateValues = {
      journeyStatusId: newStatusId,
    };

    // Set isCancellationByPassengerSeenByDriver for cancellation statuses
    if (
      newStatusId === journeyStatusMap.cancelledByPassenger ||
      newStatusId === journeyStatusMap.cancelledByAdmin ||
      newStatusId === journeyStatusMap.cancelledBySystem
    ) {
      driverUpdateValues.isCancellationByPassengerSeenByDriver =
        "not seen by driver yet";
    }

    // Use the provided identifier directly - no need to fetch if driverRequestUniqueId is given
    const driverConditions = {
      journeyStatusId: allowedCurrentStatuses,
    };
    if (driverRequestId) {
      driverConditions.driverRequestId = driverRequestId;
    } else {
      driverConditions.driverRequestUniqueId = driverRequestUniqueId;
    }
    updatePromises.push(
      updateData({
        tableName: "DriverRequest",
        conditions: driverConditions,
        updateValues: driverUpdateValues,
        connection: null, // updateData will automatically use context if available
      }).then((result) => {
        results.driverRequest = result;
        return result;
      }),
    );

    // 2. Update JourneyDecisions (if journeyDecisionUniqueId provided)
    if (journeyDecisionUniqueId) {
      const journeyDecisionUpdateValues = {
        journeyStatusId: newStatusId,
      };

      // Set appropriate "seen by" flags based on status
      if (newStatusId === journeyStatusMap.notSelectedInBid) {
        journeyDecisionUpdateValues.isNotSelectedSeenByDriver =
          "not seen by driver yet";
      } else if (newStatusId === journeyStatusMap.rejectedByPassenger) {
        journeyDecisionUpdateValues.isRejectionByPassengerSeenByDriver =
          "not seen by driver yet";
      } else {
        // Reset other "seen by" flags to default
        journeyDecisionUpdateValues.isNotSelectedSeenByDriver =
          "no need to see it";
        journeyDecisionUpdateValues.isRejectionByPassengerSeenByDriver =
          "no need to see it";
      }

      updatePromises.push(
        updateData({
          tableName: "JourneyDecisions",
          conditions: {
            journeyDecisionUniqueId,
            journeyStatusId: allowedCurrentStatuses,
          },
          updateValues: journeyDecisionUpdateValues,
          connection: null,
        }).then((result) => {
          results.journeyDecision = result;
          return result;
        }),
      );
    }

    // 3. Update Journey (if journeyDecisionUniqueId provided)
    if (journeyDecisionUniqueId) {
      updatePromises.push(
        updateData({
          tableName: "Journey",
          conditions: {
            journeyDecisionUniqueId,
            journeyStatusId: allowedCurrentStatuses,
          },
          updateValues: {
            journeyStatusId: newStatusId,
          },
          connection: null,
        }).then((result) => {
          results.journey = result;
          return result;
        }),
      );
    }

    // Execute all updates in parallel
    const resultsOfUpdates = await Promise.all(updatePromises);
    logger.debug("@resultsOfUpdates", { resultsOfUpdates });
    return {
      message: "success",
      data: "Negative journey status updated successfully",
      results,
    };
  } catch (error) {
    throw new AppError(
      error.message || "Unable to process negative journey status update",
      error.statusCode || 500,
    );
  }
};

const updateJourneyStatus = async (body) => {
  const {
    journeyDecisionUniqueId,
    shipperRequestUniqueId,
    driverRequestUniqueId,
    journeyUniqueId,
    journeyStatusId,
    previousStatusId,
    shippingCostByDriver,
    shippingDateByDriver,
    deliveryDateByDriver,
    connection = null,
  } = body;

  try {
    // Count how many tables will be updated
    let tableCount = 0;
    if (journeyUniqueId) {
      tableCount++;
    }
    if (
      shipperRequestUniqueId &&
      journeyStatusId !== journeyStatusMap.rejectedByPassenger &&
      journeyStatusId !== journeyStatusMap.notSelectedInBid
    ) {
      tableCount++;
    }
    if (journeyDecisionUniqueId) {
      tableCount++;
    }
    if (driverRequestUniqueId) {
      tableCount++;
    }

    // If updating multiple tables and no connection provided, wrap in transaction
    // If connection provided, caller manages transaction
    // If only one table, no transaction needed
    if (tableCount > 1 && !transactionStorage.getStore()) {
      return await executeInTransaction(
        async () => {
          return await updateJourneyStatus({
            ...body,
          });
        },
        {
          timeout: 15000, // 15 second timeout for multi-table updates
          logging: true,
        },
      );
    }

    // Single table update or connection provided - execute updates
    const updatePromises = [];

    // Update Journey if journeyUniqueId is provided
    if (journeyUniqueId) {
      const journeyConditions = { journeyUniqueId };
      const updateValues = {
        journeyStatusId,
        ...(journeyStatusId === journeyStatusMap.journeyCompleted && {
          endTime: currentDate(),
        }),
      };
      logger.info("Updating Journey table", {
        journeyUniqueId,
        journeyStatusId,
        updateValues,
        hasConnection: !!connection,
      });
      const journeyUpdatePromise = updateData({
        tableName: "Journey",
        conditions: journeyConditions,
        updateValues,
        connection: null, // updateData will automatically use context if available
      }).then((result) => {
        logger.info("Journey table update result", {
          journeyUniqueId,
          affectedRows: result?.affectedRows,
          changedRows: result?.changedRows,
          warningCount: result?.warningCount,
        });
        if (result?.affectedRows === 0) {
          logger.error(
            "Journey table update affected 0 rows - journeyUniqueId not found",
            {
              journeyUniqueId,
              journeyStatusId,
            },
          );
        }
        return result;
      });
      updatePromises.push(journeyUpdatePromise);
    } else {
      logger.warn("Journey table NOT updated - journeyUniqueId missing", {
        providedParams: {
          journeyDecisionUniqueId,
          shipperRequestUniqueId,
          driverRequestUniqueId,
          journeyUniqueId,
          journeyStatusId,
        },
      });
    }
    // return;
    // Update PassengerRequest if shipperRequestUniqueId is provided
    // Exclude rejectedByPassenger and notSelectedInBid from updating PassengerRequest
    // (these are driver-level statuses, not shipper request statuses)
    if (
      shipperRequestUniqueId &&
      journeyStatusId !== journeyStatusMap.rejectedByPassenger &&
      journeyStatusId !== journeyStatusMap.notSelectedInBid
    ) {
      const shipperConditions = { shipperRequestUniqueId };
      if (previousStatusId) {
        shipperConditions.journeyStatusId = previousStatusId;
      }

      updatePromises.push(
        updateData({
          tableName: "PassengerRequest",
          conditions: shipperConditions,
          updateValues: { journeyStatusId },
          connection: null, // Pass connection for transaction support
        }),
      );
    }

    // Update JourneyDecisions if journeyDecisionUniqueId is provided
    if (journeyDecisionUniqueId) {
      const journeyDecisionConditions = { journeyDecisionUniqueId };
      if (previousStatusId) {
        journeyDecisionConditions.journeyStatusId = previousStatusId;
      }

      const updateValues = { journeyStatusId };
      if (shippingCostByDriver) {
        updateValues.shippingCostByDriver = shippingCostByDriver;
      }
      if (shippingDateByDriver) {
        updateValues.shippingDateByDriver = shippingDateByDriver;
      }
      if (deliveryDateByDriver) {
        updateValues.deliveryDateByDriver = deliveryDateByDriver;
      }

      // Set isNotSelectedSeenByDriver based on journeyStatusId
      if (journeyStatusId === journeyStatusMap.notSelectedInBid) {
        updateValues.isNotSelectedSeenByDriver = "not seen by driver yet";
      } else {
        // Reset to default when status changes away from notSelectedInBid
        updateValues.isNotSelectedSeenByDriver = "no need to see it";
      }

      updatePromises.push(
        updateData({
          tableName: "JourneyDecisions",
          conditions: journeyDecisionConditions,
          updateValues,
          connection: null, // Pass connection for transaction support
        }).then((result) => {}),
      );
    }

    // Update DriverRequest if driverRequestUniqueId is provided
    if (driverRequestUniqueId) {
      const driverConditions = { driverRequestUniqueId };

      const driverUpdateValues = { journeyStatusId };

      // Reset isCancellationByPassengerSeenByDriver when status changes away from cancellation
      if (
        journeyStatusId !== journeyStatusMap.cancelledByPassenger &&
        journeyStatusId !== journeyStatusMap.cancelledByAdmin
      ) {
        driverUpdateValues.isCancellationByPassengerSeenByDriver =
          "no need to see it";
      }

      updatePromises.push(
        updateData({
          tableName: "DriverRequest",
          conditions: driverConditions,
          updateValues: driverUpdateValues,
          connection: null, // Pass connection for transaction support
        }),
      );
    }

    // ── NEW: Propagate Status to Company Bidding Tables (Fleet Capacity Release) ──
    if (shipperRequestUniqueId || driverRequestUniqueId) {
      const executor = transactionStorage.getStore() || pool;

      // 1. Update CompanyBidVehicleAssignment status if journey completed
      if (journeyStatusId === journeyStatusMap.journeyCompleted) {
        updatePromises.push(
          executor
            .query(
              "UPDATE CompanyBidVehicleAssignment SET assignmentStatus = 'completed', assignmentUpdatedAt = ? WHERE shipperRequestUniqueId = ? OR driverRequestUniqueId = ?",
              [currentDate(), shipperRequestUniqueId, driverRequestUniqueId],
            )
            .catch((e) =>
              logger.error(
                "Propagate Status to CompanyBidVehicleAssignment failed",
                { error: e.message },
              ),
            ),
        );
      }

      // 2. Propagate journeyStatusId to CompanyBidRequest
      // This is what allows validateFleetCapacity to release the reserved trucks.
      const bidPropSql = `
        UPDATE CompanyBidRequest 
        SET journeyStatusId = ?, companyBidRequestUpdatedAt = ? 
        WHERE companyBidRequestUniqueId IN (
          SELECT DISTINCT cp.companyBidRequestUniqueId 
          FROM (SELECT companyBidRequestUniqueId FROM CompanyBidVehicleAssignment WHERE shipperRequestUniqueId = ? OR driverRequestUniqueId = ?) cp
        )
      `;
      updatePromises.push(
        executor
          .query(bidPropSql, [
            journeyStatusId,
            currentDate(),
            shipperRequestUniqueId,
            driverRequestUniqueId,
          ])
          .catch((e) =>
            logger.error(
              "Propagate journeyStatusId to CompanyBidRequest failed",
              { error: e.message },
            ),
          ),
      );
    }

    // Execute all updates in parallel and wait for all to complete
    const results = await Promise.all(updatePromises);

    // Log summary of all updates
    logger.info("Journey status update completed", {
      journeyUniqueId,
      journeyStatusId,
      tablesUpdated: {
        journey: !!journeyUniqueId,
        shipperRequest: !!shipperRequestUniqueId,
        journeyDecision: !!journeyDecisionUniqueId,
        driverRequest: !!driverRequestUniqueId,
      },
      totalUpdates: results.length,
    });

    return {
      message: "success",
      data: "Request accepted successfully",
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to update journey status",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  createJourneyStatus,
  getAllJourneyStatuses,
  getJourneyStatusById,
  updateJourneyStatusByUniqueId,
  updateJourneyStatus,
  updateNegativeJourneyStatus,
  deleteJourneyStatus,
  deleteJourneyStatusByUniqueId,
};
