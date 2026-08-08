"use strict";

const {
  getData,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId
} = require("../../CRUD/Read/ReadData");
const {
  pool
} = require("../../Middleware/Database.config");
const {
  updateData
} = require("../../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToDriver
} = require("../../Utils/Notifications");
const {
  sendFCMNotificationToUser
} = require("../Firebase.service");
const {
  getVehicleDrivers
} = require("../VehicleDriver.service");
const {
  
  updateNegativeJourneyStatus
} = require("../JourneyStatus");
const {
  createCanceledJourney
} = require("../CanceledJourneys");
const {
  journeyStatusMap,
  usersRoles,
  listOfDocumentsTypeAndId,
  usersRolesList
} = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const {
  verifyShipperStatus
} = require("./statusVerification.service");
const {
  executeInTransaction
} = require("../../Utils/DatabaseTransaction");
const {
  currentDate
} = require("../../Utils/CurrentDate");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Lazy require or internal check
// const { verifyDriverJourneyStatus } = require("../DriverRequest.service");

/**
 * Accepts a driver's request/offer
 * @param {Object} body - Request body
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @param {string} body.driverRequestUniqueId - Driver request unique ID
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @param {string} body.userUniqueId - Shipper's unique ID
 * @returns {Promise<Object>} Shipper status after acceptance
 */

/**
 * Cancels a shipper request
 * @param {Object} body - Cancellation data
 * @param {number} body.cancellationJourneyStatusId - Cancellation status ID
 * @param {Object} body.user - User object with userUniqueId and roleId
 * @param {string} body.ownerUserUniqueId - Owner's unique ID
 * @param {number} body.cancellationReasonsTypeId - Cancellation reason type ID
 * @param {string} body.shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response
 */
const cancelShipperRequest = async body => {
  try {
    const {
      cancellationJourneyStatusId,
      user,
      ownerUserUniqueId,
      cancellationReasonsTypeId,
      shipperRequestUniqueId
    } = body;
    const {
      userUniqueId,
      roleId
    } = user;
    if (!userUniqueId || !roleId || !shipperRequestUniqueId) {
      throw new AppError("Missing required fields to cancel shipper request", AppError.BAD_REQUEST);
    }

    // Optimized: Fetch shipper request with User join AND journey decisions in a single query
    // Using LEFT JOIN for JourneyDecisions since they may not exist for all requests
    const sql = `
      SELECT 
        -- ShipperRequest columns
        ShipperRequest.*,
        -- Users columns (prefixed to avoid conflicts)
        Users.userUniqueId,
        Users.fullName,
        Users.phoneNumber,
        Users.email,
        -- JourneyDecisions columns (will be NULL if no decisions exist)
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.journeyStatusId as decisionJourneyStatusId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        JourneyDecisions.isNotSelectedSeenByDriver,
        JourneyDecisions.isCancellationByDriverSeenByShipper,
        JourneyDecisions.isRejectionByShipperSeenByDriver
      FROM ShipperRequest
      INNER JOIN Users ON ShipperRequest.userUniqueId = Users.userUniqueId
      LEFT JOIN JourneyDecisions ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      WHERE ShipperRequest.shipperRequestUniqueId = ?
    `;
    const executor = transactionStorage.getStore() || pool;
    const [combinedResults] = await executor.query(sql, [shipperRequestUniqueId]);
    logger.debug("@combinedResults", {
      combinedResults
    });
    if (!combinedResults || combinedResults.length === 0) {
      throw new AppError("Shipper request not found", AppError.NOT_FOUND);
    }

    // Extract shipper request data from first row (all rows have same shipper data)
    const firstRow = combinedResults[0];
    const shipperRequest = {
      ...firstRow,
      // Remove JourneyDecisions columns from shipperRequest object
      journeyDecisionId: undefined,
      journeyDecisionUniqueId: undefined,
      driverRequestId: undefined,
      decisionJourneyStatusId: undefined,
      decisionTime: undefined,
      decisionBy: undefined,
      shippingDateByDriver: undefined,
      deliveryDateByDriver: undefined,
      shippingCostByDriver: undefined,
      isNotSelectedSeenByDriver: undefined,
      isCancellationByDriverSeenByShipper: undefined,
      isRejectionByShipperSeenByDriver: undefined
    };
    // Clean up undefined properties
    Object.keys(shipperRequest).forEach(key => shipperRequest[key] === undefined && delete shipperRequest[key]);
    const requestOwnerUserUniqueId = shipperRequest.userUniqueId;
    const shipperRequestId = shipperRequest.shipperRequestId;

    // Check if the request is already cancelled
    // const cancelledStatuses = [
    //   journeyStatusMap.cancelledByShipper, // 7
    //   journeyStatusMap.cancelledByDriver, // 9
    //   journeyStatusMap.cancelledByAdmin, // 10
    //   journeyStatusMap.cancelledBySystem, // 12
    // ];

    // if (cancelledStatuses.includes(currentJourneyStatusId)) {
    //   return {
    //     message: "error",
    //     error: "This request has already been cancelled.",
    //   };
    // }

    // Verify authorization: user must own the request OR be admin/super admin,
    // OR a queue org admin (role 11) cancelling a queue-dispatch order.
    const isOwner = requestOwnerUserUniqueId === userUniqueId;
    const isAdmin =
      roleId === usersRolesList.admin.roleId ||
      roleId === usersRolesList.supperAdmin.roleId ||
      roleId === usersRolesList.queueOrgAdmin.roleId;
    if (!isOwner && !isAdmin) {
      throw new AppError("Unauthorized: You can only cancel your own requests or must be an admin/super admin", AppError.FORBIDDEN);
    }

    // Extract journey decisions from all rows (filter out rows where journeyDecisionId is NULL)
    const journeyDecisions = combinedResults.filter(row => row.journeyDecisionId !== null).map(row => ({
      journeyDecisionId: row.journeyDecisionId,
      journeyDecisionUniqueId: row.journeyDecisionUniqueId,
      driverRequestId: row.driverRequestId,
      journeyStatusId: row.decisionJourneyStatusId,
      decisionTime: row.decisionTime,
      decisionBy: row.decisionBy,
      shippingDateByDriver: row.shippingDateByDriver,
      deliveryDateByDriver: row.deliveryDateByDriver,
      shippingCostByDriver: row.shippingCostByDriver,
      isNotSelectedSeenByDriver: row.isNotSelectedSeenByDriver,
      isCancellationByDriverSeenByShipper: row.isCancellationByDriverSeenByShipper,
      isRejectionByShipperSeenByDriver: row.isRejectionByShipperSeenByDriver
    }));

    // Use shipper data from the combined fetch (already includes User join)
    const shipper = shipperRequest || null;
    logger.debug("@journeyDecisions", {
      journeyDecisions
    });

    // Wrap all database updates in a transaction to ensure atomicity
    // This prevents partial updates where ShipperRequest is updated but DriverRequest/JourneyDecisions are not
    // Store driver notification data to send after transaction commits
    const driverNotificationData = [];
    await executeInTransaction(async () => {
      // 1. Update ShipperRequest
      await updateData({
        tableName: "ShipperRequest",
        conditions: {
          shipperRequestId
        },
        updateValues: {
          journeyStatusId: cancellationJourneyStatusId // Can be cancelledByShipper (7) or cancelledByAdmin (10)
        }
      });

      // 1b. Update CompanyBidVehicleAssignment if this was a company bid
      await updateData({
        tableName: "CompanyBidVehicleAssignment",
        conditions: {
          shipperRequestUniqueId
        },
        updateValues: {
          assignmentStatus: "cancelled",
          assignmentUpdatedAt: currentDate()
        }
      });

      // 2. If journey decisions found, update all related tables atomically
      if (journeyDecisions.length) {
        // Process all journey decisions - collect data for notifications but only update DB in transaction
        for (const journeyDecision of journeyDecisions) {
          const {
            journeyDecisionUniqueId,
            driverRequestId
          } = journeyDecision;

          // Use dedicated updater function for negative status updates with transaction connection
          await updateNegativeJourneyStatus({
            driverRequestId,
            journeyDecisionUniqueId,
            newStatusId: cancellationJourneyStatusId,
            // Queue release happens once, after this transaction commits.
            skipQueueRelease: true
          });

          // Store driverRequestId and journeyDecision for notification after transaction
          driverNotificationData.push({
            driverRequestId,
            journeyDecisionUniqueId,
            journeyDecision
          });
        }
      }
    }, {
      timeout: 20000,
      // 20 second timeout for critical cancellation operation
      logging: true // Log transaction operations
    });

    // 3. Queue-dispatch order cancelled at the job level: release any driver
    //    entry still holding this order's offer back to waiting (position kept,
    //    no refusal counted). No-op for non-queue orders and no-offer states.
    if (shipperRequest?.queueOrganizationUniqueId) {
      try {
        const { releaseEntryOnOrderCancel } = require("../DriverQueue.service");
        await releaseEntryOnOrderCancel({
          shipperRequestUniqueId,
          user: { userUniqueId },
        });
      } catch (error) {
        logger.error("Error releasing queue entry on order cancel", {
          error: error.message,
          shipperRequestUniqueId,
        });
      }
    }

    // After transaction commits successfully, send notifications
    if (journeyDecisions.length && driverNotificationData.length) {
      // Process all notifications in parallel (outside transaction)
      const notificationPromises = driverNotificationData.map(async ({
        driverRequestId,
        journeyDecisionUniqueId,
        journeyDecision
      }) => {
        // Get driver data with user info
        const driverDataArray = await performJoinSelect({
          baseTable: "DriverRequest",
          joins: [{
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId"
          }],
          conditions: {
            driverRequestId
          }
        });
        const driverRequest = driverDataArray?.[0];
        if (!driverRequest?.phoneNumber) {
          return; // Skip if no phone number
        }
        const driverUserUniqueId = driverRequest?.userUniqueId;

        // Get vehicle data for the driver
        const vehicleResult = await getVehicleDrivers({
          driverUserUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1
        });
        const vehicle = vehicleResult?.data?.[0] || null;

        // Get driver profile photo
        const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(driverUserUniqueId, listOfDocumentsTypeAndId.profilePhoto);
        const profilePhotoData = documents?.data;
        const lastDataIndex = profilePhotoData?.length - 1;
        const driverProfilePhoto = profilePhotoData?.[lastDataIndex]?.attachedDocumentName;

        // Get journey data if exists
        const [journey] = await getData({
          tableName: "Journey",
          conditions: {
            journeyDecisionUniqueId
          }
        });

        // Structure driver info with profile photo
        const driver = {
          ...driverRequest,
          driverProfilePhoto
        };
        const notificationMessage = userUniqueId === ownerUserUniqueId ? "Shipper cancelled Journey." : "System cancelled Journey.";

        // Determine appropriate message type based on who cancelled
        const cancellationMessageType = cancellationJourneyStatusId === journeyStatusMap.cancelledByShipper ? messageTypes?.shipper_cancelled_request : messageTypes?.admin_cancelled_request;

        // Send Socket.IO notification to driver with complete data
        // Format matches rejection notification format for consistency
        await sendSocketIONotificationToDriver({
          message: {
            messageTypes: cancellationMessageType,
            message: "Journey cancelled",
            status: cancellationJourneyStatusId,
            shipper: shipper ? shipper : null,
            driver: {
              driver: driver,
              vehicle: vehicle || null
            },
            decisions: journeyDecision ? journeyDecision : null,
            journey: journey || null
          },
          phoneNumber: driverRequest.phoneNumber
        });

        // Also send Firebase push notification to the driver
        try {
          await sendFCMNotificationToUser({
            userUniqueId: driverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification: {
              title: "Request canceled",
              body: notificationMessage
            },
            data: {
              type: "driver_request_canceled",
              status: "canceled",
              shipperRequestId: String(shipperRequestId || ""),
              shipperUserUniqueId: String(ownerUserUniqueId || "")
            }
          });
        } catch (e) {
          logger.error("Error sending FCM notification to driver:", e);
        }
      });

      // Wait for all notifications to complete
      await Promise.all(notificationPromises).catch(error => {
        // Log notification errors but don't fail the cancellation
        logger.error("Error sending notifications after cancellation:", error);
      });
    }

    // Check if cancellation is already registered
    const canceledJourneyBefore = await getData({
      tableName: "CanceledJourneys",
      conditions: {
        contextId: shipperRequestId,
        contextType: "ShipperRequest"
      }
    });
    if (canceledJourneyBefore.length === 0) {
      // Create new cancellation record
      await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: currentDate(),
        contextId: shipperRequestId,
        contextType: "ShipperRequest",
        cancellationReasonsTypeId,
        roleId,
        shipperUserUniqueId: requestOwnerUserUniqueId
      });
    }

    // Get updated status counts after cancellation
    // This updates totalRecords with new counts (cancelled requests removed from active counts)
    const statusResult = await verifyShipperStatus({
      userUniqueId: requestOwnerUserUniqueId,
      sendNotificationsToDrivers: false // Don't send notifications, just get counts
    });

    // Return success with cancellation status, unique IDs, and updated status counts
    return {
      message: "Shipper request cancelled successfully",
      status: cancellationJourneyStatusId,
      data: {
        message: cancellationJourneyStatusId === journeyStatusMap.cancelledByShipper ? "You have successfully cancelled your request." : "Request has been cancelled by admin.",
        totalRecords: statusResult?.data?.totalRecords || null,
      },
      uniqueIds: {
        shipperRequestUniqueId,
        shipperRequestId
      },
    };
  } catch (error) {
    throw new AppError(error.message || "Unable to cancel shipper request", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  cancelShipperRequest
};
