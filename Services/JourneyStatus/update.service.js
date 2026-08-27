"use strict";


const {
  pool
} = require("../../Middleware/Database.config");
const {
  getData
} = require("../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../CRUD/Update/Data.update");


const {
  currentDate
} = require("../../Utils/CurrentDate");
const {
  journeyStatusMap
} = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const {
  executeInTransaction
} = require("../../Utils/DatabaseTransaction");
const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Create a new journey status

// Update a journey status by unique ID (dynamic)
const updateJourneyStatusByUniqueId = async (journeyStatusUniqueId, updatePayload, user) => {
  const userUniqueId = user?.userUniqueId;
  if (!userUniqueId) {
    throw new AppError("User authentication required", AppError.UNAUTHORIZED);
  }

  // Check if journey status exists and is not deleted
  const existingStatus = await getData({
    tableName: "JourneyStatus",
    conditions: {
      journeyStatusUniqueId,
      journeyStatusDeletedAt: null
    }
  });
  if (!existingStatus || existingStatus.length === 0) {
    throw new AppError("Journey status not found or already deleted", AppError.NOT_FOUND);
  }
  const updateDataValues = {
    ...updatePayload
  };
  const updateValues = {
    journeyStatusName: updateDataValues.journeyStatusName,
    journeyStatusDescription: updateDataValues.journeyStatusDescription
  };
  if (Object.keys(updateValues).length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // Execute pure SQL update to avoid NULL handling issues in updateData
  const sql = `
    UPDATE JourneyStatus
    SET journeyStatusName = ?, journeyStatusDescription = ?, journeyStatusUpdatedBy = ?, journeyStatusUpdatedAt = ?
    WHERE journeyStatusUniqueId = ?
  `;
  const values = [updateValues.journeyStatusName, updateValues.journeyStatusDescription, updateValues.journeyStatusUpdatedBy, updateValues.journeyStatusUpdatedAt, journeyStatusUniqueId];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  if (result.affectedRows > 0) {
    return {
      message: "Journey status updated successfully",
      data: null
    };
  }
  throw new AppError("Journey status update failed", AppError.INTERNAL_SERVER_ERROR);
};

// Soft delete a journey status by unique ID

/**
 * Updates journey status to a "negative" status (rejection/cancellation)
 * with safeguards to prevent re-updates and proper "seen by" flag handling
 *
 * Supported statuses:
 * - notSelectedInBid (14)
 * - rejectedByShipper (8)
 * - cancelledByShipper (7)
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
  skipQueueRelease = false
}) => {
  try {
    logger.debug("@updateNegativeJourneyStatus", {
      driverRequestId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      newStatusId
    });

    // Validate that newStatusId is one of the supported negative statuses
    const negativeStatuses = [journeyStatusMap.notSelectedInBid,
    // 14
      journeyStatusMap.rejectedByShipper,
      // 8
      journeyStatusMap.cancelledByShipper,
      // 7
      journeyStatusMap.cancelledByAdmin,
      // 10
      journeyStatusMap.cancelledBySystem // 12
    ];
    if (!negativeStatuses.includes(newStatusId)) {
      throw new AppError("Invalid request data: unsupported new status ID", AppError.BAD_REQUEST);
    }

    // Validate that at least one identifier is provided
    if (!driverRequestId && !driverRequestUniqueId) {
      throw new AppError("Invalid request: missing driver request identifier", AppError.BAD_REQUEST);
    }

    // Safeguard: Only update if current status is acceptedByDriver or requested
    // This prevents re-updating records that have already been updated
    const allowedCurrentStatuses = [journeyStatusMap.acceptedByDriver,
    // 3
      journeyStatusMap.requested,
      // 2
      journeyStatusMap.acceptedByShipper];
    const updatePromises = [];
    const results = {};

    // 1. Update DriverRequest
    const driverUpdateValues = {
      journeyStatusId: newStatusId
    };

    // Set isCancellationByShipperSeenByDriver for cancellation statuses
    if (newStatusId === journeyStatusMap.cancelledByShipper || newStatusId === journeyStatusMap.cancelledByAdmin || newStatusId === journeyStatusMap.cancelledBySystem) {
      driverUpdateValues.isCancellationByShipperSeenByDriver = "not seen by driver yet";
    }

    // Use the provided identifier directly - no need to fetch if driverRequestUniqueId is given
    const driverConditions = {
      journeyStatusId: allowedCurrentStatuses
    };
    if (driverRequestId) {
      driverConditions.driverRequestId = driverRequestId;
    } else {
      driverConditions.driverRequestUniqueId = driverRequestUniqueId;
    }
    updatePromises.push(updateData({
      tableName: "DriverRequest",
      conditions: driverConditions,
      updateValues: driverUpdateValues,
      connection: null // updateData will automatically use context if available
    }).then(result => {
      results.driverRequest = result;
      return result;
    }));

    // 2. Update JourneyDecisions (if journeyDecisionUniqueId provided)
    if (journeyDecisionUniqueId) {
      const journeyDecisionUpdateValues = {
        journeyStatusId: newStatusId
      };

      // Set appropriate "seen by" flags based on status
      if (newStatusId === journeyStatusMap.notSelectedInBid) {
        journeyDecisionUpdateValues.isNotSelectedSeenByDriver = "not seen by driver yet";
      } else if (newStatusId === journeyStatusMap.rejectedByShipper) {
        journeyDecisionUpdateValues.isRejectionByShipperSeenByDriver = "not seen by driver yet";
      } else {
        // Reset other "seen by" flags to default
        journeyDecisionUpdateValues.isNotSelectedSeenByDriver = "no need to see it";
        journeyDecisionUpdateValues.isRejectionByShipperSeenByDriver = "no need to see it";
      }
      updatePromises.push(updateData({
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId,
          journeyStatusId: allowedCurrentStatuses
        },
        updateValues: journeyDecisionUpdateValues,
        connection: null
      }).then(result => {
        results.journeyDecision = result;
        return result;
      }));
    }

    // 3. Update Journey (if journeyDecisionUniqueId provided)
    if (journeyDecisionUniqueId) {
      updatePromises.push(updateData({
        tableName: "Journey",
        conditions: {
          journeyDecisionUniqueId,
          journeyStatusId: allowedCurrentStatuses
        },
        updateValues: {
          journeyStatusId: newStatusId
        },
        connection: null
      }).then(result => {
        results.journey = result;
        return result;
      }));
    }

    // Execute all updates in parallel
    const resultsOfUpdates = await Promise.all(updatePromises);
    logger.debug("@resultsOfUpdates", {
      resultsOfUpdates
    });

    // Whole-job cancellation of a queue order: release any driver queue entry
    // holding this order's offer back to waiting (position kept, no refusal
    // counted). Skipped by cancelShipperRequest, which releases itself AFTER
    // its transaction commits. No-op for non-queue orders and no-offer states.
    const cancelStatuses = [
      journeyStatusMap.cancelledByShipper,
      journeyStatusMap.cancelledByAdmin,
      journeyStatusMap.cancelledBySystem
    ];
    if (!skipQueueRelease && cancelStatuses.includes(newStatusId) && journeyDecisionUniqueId) {
      try {
        const [decisionRow] = await getData({
          tableName: "JourneyDecisions",
          conditions: {
            journeyDecisionUniqueId
          }
        });
        const shipperRequestId = decisionRow?.[0]?.shipperRequestId;
        if (shipperRequestId) {
          const [shipperRequestRow] = await getData({
            tableName: "ShipperRequest",
            conditions: {
              shipperRequestId
            }
          });
          const order = shipperRequestRow?.[0];
          if (order?.queueOrganizationUniqueId) {
            const { releaseEntryOnOrderCancel } = require("../DriverQueue.service");
            await releaseEntryOnOrderCancel({
              shipperRequestUniqueId: order.shipperRequestUniqueId,
              user: {
                userUniqueId: order.shipperRequestCreatedBy
              }
            });
          }
        }
      } catch (error) {
        logger.error("Error releasing queue entry after negative status update", {
          error: error.message,
          journeyDecisionUniqueId,
          newStatusId
        });
      }
    }

    return {
      message: "Journey status updated successfully",
      data: null,
      results
    };
  } catch (error) {
    throw new AppError(error.message || "Unable to process negative journey status update", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};

const updateJourneyStatus = async body => {
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
    connection = null
  } = body;
  try {
    // Count how many tables will be updated
    let tableCount = 0;
    if (journeyUniqueId) {
      tableCount++;
    }
    if (shipperRequestUniqueId && journeyStatusId !== journeyStatusMap.rejectedByShipper && journeyStatusId !== journeyStatusMap.notSelectedInBid) {
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
      return await executeInTransaction(async () => {
        return await updateJourneyStatus({
          ...body
        });
      }, {
        timeout: 15000,
        // 15 second timeout for multi-table updates
        logging: true
      });
    }

    // Single table update or connection provided - execute updates
    const updatePromises = [];

    // Update Journey if journeyUniqueId is provided
    if (journeyUniqueId) {
      const journeyConditions = {
        journeyUniqueId
      };
      const updateValues = {
        journeyStatusId,
        ...(journeyStatusId === journeyStatusMap.journeyCompleted && {
          journeyCompletedAt: currentDate()
        })
      };
      logger.info("Updating Journey table", {
        journeyUniqueId,
        journeyStatusId,
        updateValues,
        hasConnection: !!connection
      });
      const journeyUpdatePromise = updateData({
        tableName: "Journey",
        conditions: journeyConditions,
        updateValues,
        connection: transactionStorage.getStore() ?? connection ?? null
      }).then(result => {
        logger.info("Journey table update result", {
          journeyUniqueId,
          affectedRows: result?.affectedRows,
          changedRows: result?.changedRows,
          warningCount: result?.warningCount
        });
        if (result?.affectedRows === 0) {
          logger.error("Journey table update affected 0 rows - journeyUniqueId not found", {
            journeyUniqueId,
            journeyStatusId
          });
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
          journeyStatusId
        }
      });
    }
    // return;
    // Update ShipperRequest if shipperRequestUniqueId is provided
    // Exclude rejectedByShipper and notSelectedInBid from updating ShipperRequest
    // (these are driver-level statuses, not shipper request statuses)
    if (shipperRequestUniqueId && journeyStatusId !== journeyStatusMap.rejectedByShipper && journeyStatusId !== journeyStatusMap.notSelectedInBid) {
      const shipperConditions = {
        shipperRequestUniqueId
      };
      if (previousStatusId) {
        shipperConditions.journeyStatusId = previousStatusId;
      }
      updatePromises.push(updateData({
        tableName: "ShipperRequest",
        conditions: shipperConditions,
        updateValues: {
          journeyStatusId
        },
        connection: transactionStorage.getStore() ?? connection ?? null
      }));
    }

    // Update JourneyDecisions if journeyDecisionUniqueId is provided
    if (journeyDecisionUniqueId) {
      const journeyDecisionConditions = {
        journeyDecisionUniqueId
      };
      if (previousStatusId) {
        journeyDecisionConditions.journeyStatusId = previousStatusId;
      }
      const updateValues = {
        journeyStatusId
      };
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
      updatePromises.push(updateData({
        tableName: "JourneyDecisions",
        conditions: journeyDecisionConditions,
        updateValues,
        connection: transactionStorage.getStore() ?? connection ?? null
      }));
    }

    // Update DriverRequest if driverRequestUniqueId is provided
    if (driverRequestUniqueId) {
      const driverConditions = {
        driverRequestUniqueId
      };
      const driverUpdateValues = {
        journeyStatusId
      };

      // Reset isCancellationByShipperSeenByDriver when status changes away from cancellation
      if (journeyStatusId !== journeyStatusMap.cancelledByShipper && journeyStatusId !== journeyStatusMap.cancelledByAdmin) {
        driverUpdateValues.isCancellationByShipperSeenByDriver = "no need to see it";
      }
      updatePromises.push(updateData({
        tableName: "DriverRequest",
        conditions: driverConditions,
        updateValues: driverUpdateValues,
        connection: transactionStorage.getStore() ?? connection ?? null
      }));
    }

    // ── NEW: Propagate Status to Company Bidding Tables (Fleet Capacity Release) ──
    if (shipperRequestUniqueId || driverRequestUniqueId) {
      // Always use the ambient transaction connection — never grab a raw pool
      // connection here, as that would deadlock against the outer transaction.
      const txConn = transactionStorage.getStore() ?? connection ?? null;
      const execRaw = (sql, params) => txConn ? txConn.query(sql, params) : pool.query(sql, params);

      // 1. Update CompanyBidVehicleAssignment status if journey completed
      if (journeyStatusId === journeyStatusMap.journeyCompleted) {
        updatePromises.push(execRaw("UPDATE CompanyBidVehicleAssignment SET assignmentStatus = 'completed', assignmentUpdatedAt = ? WHERE shipperRequestUniqueId = ? OR driverRequestUniqueId = ?", [currentDate(), shipperRequestUniqueId, driverRequestUniqueId]).catch(e => logger.error("Propagate Status to CompanyBidVehicleAssignment failed", {
          error: e.message
        })));
      }

      // 2. Propagate journeyStatusId to CompanyBidRequest
      const bidPropSql = `
        UPDATE CompanyBidRequest 
        SET journeyStatusId = ?, companyBidRequestUpdatedAt = ? 
        WHERE companyBidRequestUniqueId IN (
          SELECT DISTINCT cp.companyBidRequestUniqueId 
          FROM (SELECT companyBidRequestUniqueId FROM CompanyBidVehicleAssignment WHERE shipperRequestUniqueId = ? OR driverRequestUniqueId = ?) cp
        )
      `;
      updatePromises.push(execRaw(bidPropSql, [journeyStatusId, currentDate(), shipperRequestUniqueId, driverRequestUniqueId]).catch(e => logger.error("Propagate journeyStatusId to CompanyBidRequest failed", {
        error: e.message
      })));
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
        driverRequest: !!driverRequestUniqueId
      },
      totalUpdates: results.length
    });
    return {
      message: "Journey status updated successfully",
      data: null
    };
  } catch (error) {
    throw new AppError(error.message || "Failed to update journey status", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  updateJourneyStatusByUniqueId,
  updateNegativeJourneyStatus,
  updateJourneyStatus
};
