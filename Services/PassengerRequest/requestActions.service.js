const {
  getData,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const { pool } = require("../../Middleware/Database.config");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToDriver,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { getVehicleDrivers } = require("../VehicleDriver.service");
const {
  updateJourneyStatus,
  updateNegativeJourneyStatus,
} = require("../JourneyStatus.service");
const { createCanceledJourney } = require("../CanceledJourneys.service");
const {
  journeyStatusMap,
  usersRoles,
  listOfDocumentsTypeAndId,
  usersRolesList,
} = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { verifyPassengerStatus } = require("./statusVerification.service");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { currentDate } = require("../../Utils/CurrentDate");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { verifyDriverJourneyStatus } = require("../DriverRequest");
// Lazy require or internal check
// const { verifyDriverJourneyStatus } = require("../DriverRequest.service");

/**
 * Accepts a driver's request/offer
 * @param {Object} body - Request body
 * @param {string} body.userUniqueId - Passenger's unique ID
 * @param {string} body.journeyDecisionUniqueId - Journey decision unique ID
 * @param {string} body.driverRequestUniqueId - Driver request unique ID
 * @param {string} body.passengerRequestUniqueId - Passenger request unique ID
 * @param {string} body.userUniqueId - Passenger's unique ID
 * @returns {Promise<Object>} Passenger status after acceptance
 */
const acceptDriverRequest = async (body) => {
  try {
    const {
      passengerRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      userUniqueId,
    } = body;

    // Validate required fields
    if (
      !passengerRequestUniqueId ||
      !driverRequestUniqueId ||
      !journeyDecisionUniqueId ||
      !userUniqueId
    ) {
      throw new AppError(
        "passengerRequestUniqueId, driverRequestUniqueId, journeyDecisionUniqueId, and userUniqueId are required",
        400,
      );
    }

    return await executeInTransaction(async () => {
      // Fetch ALL open bids for this passenger — both status 2 (requested) and status 3 (acceptedByDriver).
      // Without this, bids still at status 2 (not yet interacted with) are skipped and never marked
      // as `notSelectedInBid`, leaving stale decisions in the DB with an incorrect status.
      const connectedDrivers = await performJoinSelect({
        baseTable: "DriverRequest",
        selectColumns:
          "DriverRequest.*, Users.phoneNumber, DriverRequest.userUniqueId AS driverUserUniqueId, PassengerRequest.userUniqueId AS passengerUserUniqueId, PassengerRequest.passengerRequestUniqueId, JourneyDecisions.journeyDecisionUniqueId, JourneyDecisions.driverRequestId as jd_driverRequestId, PassengerRequest.passengerRequestId as pr_passengerRequestId",
        joins: [
          {
            table: "JourneyDecisions",
            on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
          },
          {
            table: "PassengerRequest",
            on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
          },
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          "PassengerRequest.userUniqueId": userUniqueId,
          "JourneyDecisions.journeyStatusId": [
            journeyStatusMap.requested, // 2 — driver bid, not yet interacted
            journeyStatusMap.acceptedByDriver, // 3 — driver accepted, waiting on passenger
          ],
        },
      });

      if (!connectedDrivers?.length) {
        throw new AppError("No driver requests found to accept", 404);
      }

      for (let i = 0; i < connectedDrivers?.length; i++) {
        const driver = connectedDrivers[i];
        const phoneNumber = driver?.phoneNumber;
        const targetDriverUserUniqueId = driver?.driverUserUniqueId;

        const isAccepted =
          driverRequestUniqueId === driver.driverRequestUniqueId;

        const updatePayload = {
          journeyStatusId: isAccepted
            ? journeyStatusMap.acceptedByPassenger
            : journeyStatusMap.notSelectedInBid,
          driverRequestUniqueId: driver?.driverRequestUniqueId,
          journeyDecisionUniqueId: driver?.journeyDecisionUniqueId,
          passengerRequestUniqueId: driver?.passengerRequestUniqueId,
        };

        await updateJourneyStatus(updatePayload);

        // Verification of driver journey status (lazy required/internal check)
        const driverStatus = await verifyDriverJourneyStatus({
          userUniqueId: driver?.driverUserUniqueId,
        });

        const notification = {
          title: isAccepted ? "Offer accepted" : "Offer not selected",
          body: isAccepted
            ? "Passenger accepted your price."
            : "Passenger selected another offer.",
        };
        const data = {
          type: "driver_offer_status",
          status: isAccepted ? "success" : "not_selected",
          driverRequestUniqueId: String(driver?.driverRequestUniqueId || ""),
          journeyDecisionUniqueId: String(journeyDecisionUniqueId || ""),
          passengerUserUniqueId: String(userUniqueId || ""),
        };

        if (targetDriverUserUniqueId) {
          await sendFCMNotificationToUser({
            userUniqueId: targetDriverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification,
            data,
          }).catch((e) => logger.error("Error sending FCM notification", e));
        }

        if (driverStatus) {
          await sendSocketIONotificationToDriver({
            message: driverStatus,
            phoneNumber,
          });
        }
      }

      const statusResult = await verifyPassengerStatus({
        userUniqueId,
      });

      return {
        message: "success",
        totalRecords: statusResult?.totalRecords || null,
        pageSize: statusResult?.pageSize || 10,
        page: statusResult?.page || 1,
      };
    });
  } catch (error) {
    logger.error("Unable to accept driver request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to accept driver request",
      error.statusCode || 500,
    );
  }
};

/**
 * Rejects a driver's offer
 * @param {Object} body - Request body with rejection data
 * @returns {Promise<Object>} Passenger status after rejection
 */
const rejectDriverOffer = async (body) => {
  try {
    // Validate required fields
    const requiredFields = [
      "passengerRequestId",
      "passengerRequestUniqueId",
      "driverRequestUniqueId",
      "journeyDecisionUniqueId",
      "journeyStatusId",
    ];
    const missingFields =
      requiredFields?.filter((field) => !body?.[field]) || [];

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Get all requests which are accepted by driver passenger requests for this passenger
    const allPassengerRequests = await getData({
      tableName: "JourneyDecisions",
      conditions: {
        passengerRequestId: body.passengerRequestId,
        journeyStatusId: journeyStatusMap.acceptedByDriver,
      },
    });
    logger.debug("@allPassengerRequests", { allPassengerRequests });

    // Wrap all updates in a transaction to ensure atomicity
    let negativeStatusUpdateResult;
    await executeInTransaction(
      async () => {
        // Update PassengerRequest if there is only one request (all-or-nothing)
        if (allPassengerRequests.length <= 1) {
          await updateData({
            tableName: "PassengerRequest",
            conditions: {
              passengerRequestUniqueId: body.passengerRequestUniqueId,
            },
            updateValues: {
              journeyStatusId: journeyStatusMap.waiting,
            },
          });
        }

        // Use dedicated updater function for negative status updates with transaction connection
        negativeStatusUpdateResult = await updateNegativeJourneyStatus({
          driverRequestUniqueId: body.driverRequestUniqueId,
          journeyDecisionUniqueId: body.journeyDecisionUniqueId,
          newStatusId: journeyStatusMap.rejectedByPassenger,
        });
      },
      {
        timeout: 10000, // 10 second timeout for reject operation
        logging: true,
      },
    );

    // Verify update was successful
    if (
      negativeStatusUpdateResult.message === "error" ||
      !negativeStatusUpdateResult.results?.driverRequest?.affectedRows ||
      !negativeStatusUpdateResult.results?.journeyDecision?.affectedRows
    ) {
      throw new Error(
        negativeStatusUpdateResult.error || "One or more updates failed",
      );
    }

    // Fetch driver and passenger data for notification
    const [driverRequestData, passengerRequestData, journeyDecisionData] =
      await Promise.all([
        performJoinSelect({
          baseTable: "DriverRequest",
          joins: [
            {
              table: "Users",
              on: "DriverRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: {
            driverRequestUniqueId: body.driverRequestUniqueId,
          },
        }),
        performJoinSelect({
          baseTable: "PassengerRequest",
          joins: [
            {
              table: "Users",
              on: "PassengerRequest.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: {
            passengerRequestUniqueId: body.passengerRequestUniqueId,
          },
        }),
        getData({
          tableName: "JourneyDecisions",
          conditions: {
            journeyDecisionUniqueId: body.journeyDecisionUniqueId,
          },
        }),
      ]);

    const driver = driverRequestData?.[0];
    const passenger = passengerRequestData?.[0];
    const journeyDecision = journeyDecisionData?.[0];

    // Send notification to driver if driver data is available
    if (driver?.phoneNumber && driver?.userUniqueId) {
      // Get vehicle data for driver
      const vehicleData = await getVehicleDrivers({
        driverUserUniqueId: driver.userUniqueId,
        assignmentStatus: "active",
        limit: 1,
        page: 1,
      });
      // Get driver profile photo
      const vehicle = vehicleData?.data?.[0];
      const message = {
        messageTypes: messageTypes.passenger_rejected_request,
        message: "success",
        status: journeyStatusMap.rejectedByPassenger,
        passenger: passenger ? passenger : null,
        driver: {
          driver: driver,
          vehicle: vehicle || null,
        },
        decisions: journeyDecision ? journeyDecision : null,
        journey: null,
      };

      // Send WebSocket notification to driver
      try {
        await sendSocketIONotificationToDriver({
          message,
          phoneNumber: driver.phoneNumber,
        });
      } catch (error) {
        if (logger && typeof logger.error === "function") {
          logger.error(
            "Error sending WebSocket notification to driver:",
            error,
          );
        } else {
          console.error(
            "Error sending WebSocket notification to driver:",
            error,
          );
        }
      }

      // Send FCM push notification to driver
      try {
        await sendFCMNotificationToUser({
          userUniqueId: driver.userUniqueId,
          roleId: usersRoles.driverRoleId,
          notification: {
            title: "Offer rejected",
            body: "Passenger has excluded your offer from the bid.",
          },
          data: {
            type: "driver_offer_rejected",
            status: "rejected",
            driverRequestUniqueId: String(body.driverRequestUniqueId || ""),
            journeyDecisionUniqueId: String(body.journeyDecisionUniqueId || ""),
            passengerRequestUniqueId: String(
              body.passengerRequestUniqueId || "",
            ),
          },
        });
      } catch (error) {
        if (logger && typeof logger.error === "function") {
          logger.error("Error sending FCM notification to driver:", error);
        } else {
          console.error("Error sending FCM notification to driver:", error);
        }
      }
    }

    // Return success message - client should call verifyPassengerStatus endpoint for full status
    return {
      message: "success",
      data: "Driver offer rejected successfully",
    };
  } catch (error) {
    throw new AppError(
      error.message || "Unable to reject driver offer",
      error.statusCode || 500,
    );
  }
};

/**
 * Cancels a passenger request
 * @param {Object} body - Cancellation data
 * @param {number} body.cancellationJourneyStatusId - Cancellation status ID
 * @param {Object} body.user - User object with userUniqueId and roleId
 * @param {string} body.ownerUserUniqueId - Owner's unique ID
 * @param {number} body.cancellationReasonsTypeId - Cancellation reason type ID
 * @param {string} body.passengerRequestUniqueId - Passenger request unique ID
 * @returns {Promise<Object>} Success or error response
 */
const cancelPassengerRequest = async (body) => {
  try {
    const {
      cancellationJourneyStatusId,
      user,
      ownerUserUniqueId,
      cancellationReasonsTypeId,
      passengerRequestUniqueId,
    } = body;

    const { userUniqueId, roleId } = user;

    if (!userUniqueId || !roleId || !passengerRequestUniqueId) {
      throw new AppError(
        "Missing required fields to cancel passenger request",
        400,
      );
    }

    // Optimized: Fetch passenger request with User join AND journey decisions in a single query
    // Using LEFT JOIN for JourneyDecisions since they may not exist for all requests
    const sql = `
      SELECT 
        -- PassengerRequest columns
        PassengerRequest.*,
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
        JourneyDecisions.isCancellationByDriverSeenByPassenger,
        JourneyDecisions.isRejectionByPassengerSeenByDriver
      FROM PassengerRequest
      INNER JOIN Users ON PassengerRequest.userUniqueId = Users.userUniqueId
      LEFT JOIN JourneyDecisions ON JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId
      WHERE PassengerRequest.passengerRequestUniqueId = ?
    `;

    const executor = transactionStorage.getStore() || pool;
    const [combinedResults] = await executor.query(sql, [
      passengerRequestUniqueId,
    ]);
    logger.debug("@combinedResults", { combinedResults });
    if (!combinedResults || combinedResults.length === 0) {
      throw new AppError("Passenger request not found", 404);
    }

    // Extract passenger request data from first row (all rows have same passenger data)
    const firstRow = combinedResults[0];
    const passengerRequest = {
      ...firstRow,
      // Remove JourneyDecisions columns from passengerRequest object
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
      isCancellationByDriverSeenByPassenger: undefined,
      isRejectionByPassengerSeenByDriver: undefined,
    };
    // Clean up undefined properties
    Object.keys(passengerRequest).forEach(
      (key) =>
        passengerRequest[key] === undefined && delete passengerRequest[key],
    );

    const requestOwnerUserUniqueId = passengerRequest.userUniqueId;
    const passengerRequestId = passengerRequest.passengerRequestId;

    // Check if the request is already cancelled
    // const cancelledStatuses = [
    //   journeyStatusMap.cancelledByPassenger, // 7
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

    // Verify authorization: user must own the request OR be admin/super admin
    const isOwner = requestOwnerUserUniqueId === userUniqueId;
    const isAdmin =
      roleId === usersRolesList.admin.roleId ||
      roleId === usersRolesList.supperAdmin.roleId;

    if (!isOwner && !isAdmin) {
      throw new AppError(
        "Unauthorized: You can only cancel your own requests or must be an admin/super admin",
        403,
      );
    }

    // Extract journey decisions from all rows (filter out rows where journeyDecisionId is NULL)
    const journeyDecisions = combinedResults
      .filter((row) => row.journeyDecisionId !== null)
      .map((row) => ({
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
        isCancellationByDriverSeenByPassenger:
          row.isCancellationByDriverSeenByPassenger,
        isRejectionByPassengerSeenByDriver:
          row.isRejectionByPassengerSeenByDriver,
      }));

    // Use passenger data from the combined fetch (already includes User join)
    const passenger = passengerRequest || null;
    logger.debug("@journeyDecisions", { journeyDecisions });

    // Wrap all database updates in a transaction to ensure atomicity
    // This prevents partial updates where PassengerRequest is updated but DriverRequest/JourneyDecisions are not
    // Store driver notification data to send after transaction commits
    const driverNotificationData = [];

    await executeInTransaction(
      async () => {
        // 1. Update PassengerRequest
        await updateData({
          tableName: "PassengerRequest",
          conditions: { passengerRequestId },
          updateValues: {
            journeyStatusId: cancellationJourneyStatusId, // Can be cancelledByPassenger (7) or cancelledByAdmin (10)
          },
        });

        // 1b. Update CompanyBidVehicleAssignment if this was a company bid
        await updateData({
          tableName: "CompanyBidVehicleAssignment",
          conditions: { passengerRequestUniqueId },
          updateValues: {
            assignmentStatus: "cancelled",
            assignmentUpdatedAt: currentDate(),
          },
        });

        // 2. If journey decisions found, update all related tables atomically
        if (journeyDecisions.length) {
          // Process all journey decisions - collect data for notifications but only update DB in transaction
          for (const journeyDecision of journeyDecisions) {
            const { journeyDecisionUniqueId, driverRequestId } =
              journeyDecision;

            // Use dedicated updater function for negative status updates with transaction connection
            await updateNegativeJourneyStatus({
              driverRequestId,
              journeyDecisionUniqueId,
              newStatusId: cancellationJourneyStatusId,
            });

            // Store driverRequestId and journeyDecision for notification after transaction
            driverNotificationData.push({
              driverRequestId,
              journeyDecisionUniqueId,
              journeyDecision,
            });
          }
        }
      },
      {
        timeout: 20000, // 20 second timeout for critical cancellation operation
        logging: true, // Log transaction operations
      },
    );

    // After transaction commits successfully, send notifications
    if (journeyDecisions.length && driverNotificationData.length) {
      // Process all notifications in parallel (outside transaction)
      const notificationPromises = driverNotificationData.map(
        async ({
          driverRequestId,
          journeyDecisionUniqueId,
          journeyDecision,
        }) => {
          // Get driver data with user info
          const driverDataArray = await performJoinSelect({
            baseTable: "DriverRequest",
            joins: [
              {
                table: "Users",
                on: "DriverRequest.userUniqueId = Users.userUniqueId",
              },
            ],
            conditions: {
              driverRequestId,
            },
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
            page: 1,
          });
          const vehicle = vehicleResult?.data?.[0] || null;

          // Get driver profile photo
          const documents =
            await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
              driverUserUniqueId,
              listOfDocumentsTypeAndId.profilePhoto,
            );
          const profilePhotoData = documents?.data;
          const lastDataIndex = profilePhotoData?.length - 1;
          const driverProfilePhoto =
            profilePhotoData?.[lastDataIndex]?.attachedDocumentName;

          // Get journey data if exists
          const [journey] = await getData({
            tableName: "Journey",
            conditions: { journeyDecisionUniqueId },
          });

          // Structure driver info with profile photo
          const driver = { ...driverRequest, driverProfilePhoto };

          const notificationMessage =
            userUniqueId === ownerUserUniqueId
              ? "Passenger cancelled Journey."
              : "System cancelled Journey.";

          // Determine appropriate message type based on who cancelled
          const cancellationMessageType =
            cancellationJourneyStatusId ===
            journeyStatusMap.cancelledByPassenger
              ? messageTypes?.passenger_cancelled_request
              : messageTypes?.admin_cancelled_request;

          // Send Socket.IO notification to driver with complete data
          // Format matches rejection notification format for consistency
          await sendSocketIONotificationToDriver({
            message: {
              messageTypes: cancellationMessageType,
              message: "success",
              status: cancellationJourneyStatusId,
              passenger: passenger ? passenger : null,
              driver: {
                driver: driver,
                vehicle: vehicle || null,
              },
              decisions: journeyDecision ? journeyDecision : null,
              journey: journey || null,
            },
            phoneNumber: driverRequest.phoneNumber,
          });

          // Also send Firebase push notification to the driver
          try {
            await sendFCMNotificationToUser({
              userUniqueId: driverUserUniqueId,
              roleId: usersRoles.driverRoleId,
              notification: {
                title: "Request canceled",
                body: notificationMessage,
              },
              data: {
                type: "driver_request_canceled",
                status: "canceled",
                passengerRequestId: String(passengerRequestId || ""),
                passengerUserUniqueId: String(ownerUserUniqueId || ""),
              },
            });
          } catch (e) {
            if (logger && typeof logger.error === "function") {
              logger.error("Error sending FCM notification to driver:", e);
            } else {
              console.error("Error sending FCM notification to driver:", e);
            }
          }
        },
      );

      // Wait for all notifications to complete
      await Promise.all(notificationPromises).catch((error) => {
        // Log notification errors but don't fail the cancellation
        if (logger && typeof logger.error === "function") {
          logger.error(
            "Error sending notifications after cancellation:",
            error,
          );
        } else {
          console.error(
            "Error sending notifications after cancellation:",
            error,
          );
        }
      });
    }

    // Check if cancellation is already registered
    const canceledJourneyBefore = await getData({
      tableName: "CanceledJourneys",
      conditions: {
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
      },
    });

    if (canceledJourneyBefore.length === 0) {
      // Create new cancellation record
      await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: currentDate(),
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
        cancellationReasonsTypeId,
        roleId,
        passengerUserUniqueId: requestOwnerUserUniqueId,
      });
    }

    // Get updated status counts after cancellation
    // This updates totalRecords with new counts (cancelled requests removed from active counts)
    const statusResult = await verifyPassengerStatus({
      userUniqueId: requestOwnerUserUniqueId,
      sendNotificationsToDrivers: false, // Don't send notifications, just get counts
    });

    // Return success with cancellation status, unique IDs, and updated status counts
    return {
      message: "success",
      status: cancellationJourneyStatusId,
      data:
        cancellationJourneyStatusId === journeyStatusMap.cancelledByPassenger
          ? "You have successfully cancelled your request."
          : "Request has been cancelled by admin.",
      // Provide unique IDs so frontend knows what was cancelled
      uniqueIds: {
        passengerRequestUniqueId,
        passengerRequestId,
      },
      // Include updated status counts (totalRecords) for frontend to update UI
      totalRecords: statusResult?.totalRecords || null,
    };
  } catch (error) {
    throw new AppError(
      error.message || "Unable to cancel passenger request",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  acceptDriverRequest,
  rejectDriverOffer,
  cancelPassengerRequest,
};
