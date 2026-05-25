const {
  getData,
  performJoinSelect,
  
  checkActiveDriverRequest,
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");


const {
  
  sendSocketIONotificationToAdmin,
  
} = require("../../Utils/Notifications");




const { currentDate } = require("../../Utils/CurrentDate");

const {
  createCanceledJourney,
} = require("../CanceledJourneys");
const {
  getJourneyDataByContextType,
} = require("../CanceledJourneys/cancelHelper");
const messageTypes = require("../../Utils/MessageTypes");
const {
  journeyStatusMap,
  CANCELED_JOURNEY_CONTEXTS,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");

const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { fetchJourneyNotificationData } = require("./helpers");
const AppError = require("../../Utils/AppError");

/**
 * Cancels a driver request, updating related journey decisions and shipper requests
 * Handles both rejection (before acceptance) and cancellation (after acceptance)
 * @param {Object} data - Cancellation data containing ownerUserUniqueId, user, roleId, cancellationReasonsTypeId, and optional shipperUserUniqueId
 * @returns {Promise<Object>} Response containing cancellation status and related data
 */
const cancelDriverRequest = async (data) => {
  try {
    const user = data?.user;
    const roleId = data?.roleId;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId = data?.ownerUserUniqueId,
      shipperUserUniqueId = data?.shipperUserUniqueId;
    const rawReasonId = data?.cancellationReasonsTypeId;
    const cancellationReasonsTypeId =
      rawReasonId !== null &&
      rawReasonId !== "undefined" &&
      !Number.isNaN(Number(rawReasonId))
        ? Number(rawReasonId)
        : 1; // default to 1 if missing/invalid to satisfy FK

    // Check if the driver has any active requests
    const getActiveRequest = await checkActiveDriverRequest(ownerUserUniqueId);
    // return { message: "success", data: getActiveRequest };
    if (getActiveRequest.length === 0) {
      throw new AppError("No active driver requests found for this user", 404);
    }
    const activeData = getActiveRequest?.[0];
    const driverRequestId = activeData?.driverRequestId;
    const currentJourneyStatusId = activeData?.journeyStatusId;

    /**
     * Determine the appropriate journey status based on when the driver cancels/rejects:
     *
     * rejectedByDriver (15): Used when driver rejects BEFORE accepting the request
     *   - Occurs at status 1 (waiting) or 2 (requested)
     *   - No JourneyDecision record exists yet
     *   - Driver never committed to participate in the bid
     *   - Shipper doesn't need to be notified (no expectation was set)
     *
     * cancelledByDriver (9): Used when driver cancels AFTER accepting the request
     *   - Occurs at status 3+ (acceptedByDriver, acceptedByShipper, journeyStarted, etc.)
     *   - JourneyDecision record exists (driver had accepted and provided bidding price)
     *   - Driver committed but then withdrew their commitment
     *   - Shipper should be notified (expectation was set and then broken)
     */
    // Determine the appropriate journey status based on when the driver cancels/rejects
    let journeyStatusId =
      currentJourneyStatusId >= journeyStatusMap.acceptedByDriver
        ? journeyStatusMap.cancelledByDriver
        : journeyStatusMap.rejectedByDriver;

    // Fetch all necessary data BEFORE transaction (read operations)
    // Check if the request exists in JourneyDecisions
    const journeyDecisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { driverRequestId },
    });

    const shipperRequestId = journeyDecisions?.[0]?.shipperRequestId;
    const journeyDecisionUniqueId =
      journeyDecisions?.[0]?.journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions?.[0]?.journeyDecisionId;
    const journeyStatusIdOfJourneyDecision =
      journeyDecisions?.[0]?.journeyStatusId;

    // Fetch journey data (read operation - before transaction)
    let journey = null;
    if (journeyDecisionUniqueId) {
      const journeyData = await getData({
        tableName: "Journey",
        conditions: {
          "Journey.journeyDecisionUniqueId": journeyDecisionUniqueId,
        },
      });
      journey = journeyData?.length > 0 ? journeyData[0] : null;
    }

    // Determine final status
    const finalStatus =
      userUniqueId === ownerUserUniqueId
        ? journeyStatusId // Use the determined status (rejectedByDriver or cancelledByDriver)
        : journeyStatusMap.cancelledByAdmin;

    // Fetch shipper details (read operation - before transaction)
    let shipper = null;
    let shipperRequestUniqueId = null;
    let shouldUpdateShipperToWaiting = false;

    if (shipperRequestId) {
      shipper = await performJoinSelect({
        baseTable: "ShipperRequest",
        joins: [
          {
            table: "Users",
            on: "ShipperRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { shipperRequestId },
      });

      if (!shipper || shipper.length === 0 || !shipper[0]?.phoneNumber) {
        throw new AppError(
          "Unable to fetch shipper details or phone number",
          404,
        );
      }

      shipperRequestUniqueId = shipper?.[0].shipperRequestUniqueId;
    }

    // Wrap all status updates in a single transaction to ensure atomicity
    // All operations must succeed or all must fail to maintain data consistency
    await executeInTransaction(
      async (connection) => {
        // 1. Update DriverRequest status (always required)
        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestId },
          updateValues: { journeyStatusId }, // Set journeyStatusId to 9 (cancelledByDriver) or 15 (rejectedByDriver)
          connection, // Pass connection for transaction support
        });

        // 2. Check count of journey decisions WITHIN transaction BEFORE updating status
        // This ensures we count accurately even if other transactions are modifying data
        // We check BEFORE updating to know if this was the only active driver
        let journeyDecisionCount = 0;
        if (shipperRequestUniqueId && journeyDecisions?.length > 0) {
          // Count journey decisions for this shipper request using transaction connection
          // This ensures we see a consistent snapshot within the transaction
          // Count ALL journey decisions (including this one) to determine total drivers matched
          // If count === 1, this is the only driver ever matched, so shipper goes back to waiting
          // If count > 1, multiple drivers were matched, so shipper status stays unchanged
          // Count only ACTIVE decisions (statuses 1-5) to determine if any active drivers remain
          const countSql = `
            SELECT COUNT(*) as count 
            FROM JourneyDecisions 
            INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId 
            WHERE ShipperRequest.shipperRequestUniqueId = ?
              AND JourneyDecisions.journeyStatusId IN (${activeJourneyStatuses.join(", ")})
          `;
          const [countResult] = await connection.query(countSql, [
            shipperRequestUniqueId,
          ]);
          journeyDecisionCount = countResult[0]?.count || 0;

          // Determine if shipper status should be updated to waiting
          // Only update if this is the only driver (only 1 JourneyDecision exists for this shipper)
          // If shipper has multiple drivers (count > 1), leave status unchanged
          // This logic: if only 1 driver was ever matched, and we're cancelling it, shipper has no drivers left
          shouldUpdateShipperToWaiting = journeyDecisionCount === 1;
        }

        // 3. Update JourneyDecisions if a decision record exists
        // Note: For rejectedByDriver (early rejection), there may not be a JourneyDecision record
        //       since the driver never accepted the request. This update only runs if one exists.
        if (journeyDecisions?.length > 0 && journeyDecisionUniqueId) {
          /**
           * Set isCancellationByDriverSeenByShipper status:
           *
           * "no need to see it": For rejectedByDriver (15)
           *   - Driver rejected before accepting, so shipper never expected this driver
           *   - No notification needed since no commitment was made
           *   - Prevents unnecessary notifications in shipper's cancellation list
           *
           * "not seen by shipper yet": For cancelledByDriver (9)
           *   - Driver cancelled after accepting, breaking their commitment
           *   - Shipper should be notified via WebSocket (if online) or HTTP GET (if offline)
           *   - This status triggers notification in verifyShipperStatus
           *   - Shipper can mark as seen via PUT /api/shipperRequest/markCancellationAsSeen
           */
          const cancellationSeenStatus =
            journeyStatusId === journeyStatusMap.rejectedByDriver
              ? "no need to see it"
              : "not seen by shipper yet";

          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId:
                userUniqueId === ownerUserUniqueId
                  ? journeyStatusId // Use the determined status (rejectedByDriver or cancelledByDriver)
                  : journeyStatusMap.cancelledByAdmin, // 10 for admin cancellation
              isCancellationByDriverSeenByShipper: cancellationSeenStatus,
            },
            connection, // Pass connection for transaction support
          });
        }

        // 4. Update ShipperRequest status (only if this is the only driver)
        // If shipper has multiple drivers, leave status unchanged
        if (shipperRequestId && shouldUpdateShipperToWaiting) {
          // Update the ShipperRequest to reflect the cancellation.
          // For company_target mode, the company still owns the bid, so slot returns to acceptedByShipper (4)
          // For individual_target mode, the slot returns to waiting (1) for a new driver
          // We check for requestMode === 'company_target' or if targetCompanyUniqueId is set.
          const isCompanyTarget = shipper && shipper.length > 0 && 
            (shipper[0].requestMode === 'company_target' || shipper[0].targetCompanyUniqueId != null);
            
          const revertStatus = isCompanyTarget ? journeyStatusMap.acceptedByShipper : journeyStatusMap.waiting;

          await updateData({
            tableName: "ShipperRequest",
            conditions: { shipperRequestId },
            updateValues: {
              journeyStatusId: revertStatus,
            },
            connection, // Pass connection for transaction support
          });
        }

        // 5. Update Journey table (if the journey had already started)
        if (journey && journey.journeyId) {
          await updateData({
            tableName: "Journey",
            conditions: { journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.cancelledByDriver,
            },
            connection, // Pass connection for transaction support
          });
        }

        // 6. Update CompanyBidVehicleAssignment if this driver was on a company bid.
        // ENUM values: 'rejected_by_driver' (pre-confirm) | 'cancelled_by_driver' (post-confirm)
        const assignmentStatusStr =
          journeyStatusId === journeyStatusMap.rejectedByDriver
            ? "rejected_by_driver"
            : "cancelled_by_driver";
        await connection.query(
          `UPDATE CompanyBidVehicleAssignment
           SET assignmentStatus = ?, assignmentUpdatedAt = ?
           WHERE driverRequestUniqueId = (
             SELECT driverRequestUniqueId FROM DriverRequest WHERE driverRequestId = ? LIMIT 1
           )
             AND assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')`,
          [assignmentStatusStr, currentDate(), driverRequestId],
        );
      },
      {
        timeout: 20000, // 20 second timeout for cancellation operations
        logging: true, // Log transaction operations
      },
    );

    // After successful transaction commit, handle notifications and audit logging
    // Initialize notificationData at function scope to ensure it's always available
    let notificationData = null;

    // Only send notification for cancelledByDriver (9) or cancelledByAdmin (10), NOT for rejectedByDriver (15)
    // rejectedByDriver doesn't need notification since driver never committed
    if (
      shipperRequestId &&
      (finalStatus === journeyStatusMap.cancelledByDriver ||
        finalStatus === journeyStatusMap.cancelledByAdmin)
    ) {
      // Use helper function to fetch all notification data
      // Pass journeyDecisions array to avoid re-fetching (already fetched above at line 1545)
      notificationData = await fetchJourneyNotificationData(
        journeyDecisionUniqueId,
        null, // No driverRequest data available
        null, // No vehicle data available
        journeyDecisions, // Pass already-fetched journey decision array to avoid re-fetching
      );

      // Check if helper returned valid data
      if (
        notificationData?.shipperRequest &&
        notificationData?.journeyDecision &&
        notificationData?.driverInfo
      ) {
        // Determine message type based on status
        const cancellationMessageType =
          finalStatus === journeyStatusMap.cancelledByAdmin
            ? messageTypes.admin_cancelled_request
            : messageTypes.driver_cancelled_request;

        const shipperRequest = notificationData.shipperRequest;

        // Send WebSocket notification with formattedData structure (after successful transaction)
        if (shipperRequest?.phoneNumber) {
          // Import here to avoid circular dependency
          const {
            sendShipperNotification,
          } = require("../ShipperRequest/statusVerification.service");

          await sendShipperNotification({
            shipperRequest,
            journeyDecision: notificationData.journeyDecision,
            driverInfo: notificationData.driverInfo,
            journeyData: notificationData.journeyData || journey || {},
            messageType: cancellationMessageType,
            status: finalStatus,
            data:
              finalStatus === journeyStatusMap.cancelledByAdmin
                ? "Admin cancelled your request."
                : "Driver cancelled your request.",
          });

          // Send FCM notification (after successful transaction)
          if (shipperRequest.userUniqueId) {
            sendFCMNotificationToUser({
              userUniqueId: shipperRequest.userUniqueId,
              roleId: 1,
              notification: {
                title: cancellationMessageType.message,
                body: cancellationMessageType.details,
              },
            });
          }
        }
      }
    }

    // Register cancellation in createCanceledJourney table if journeyDecisionUniqueId exists
    // This is audit/analytics data - executed after successful transaction commit
    // Note: journey data was already fetched above, reuse it here
    if (journeyDecisionUniqueId) {
      // Reuse the journey data fetched earlier (consolidated fetching)
      const journeyId = journey?.journeyId;
      const hasJourney = !!journey;
      const journeyStarted =
        journeyStatusIdOfJourneyDecision === journeyStatusMap.journeyStarted;

      // Determine context type and ID based on journey state
      let contextType, contextId;

      if (journeyStarted && journeyId) {
        // Journey has started - register with Journey context
        contextType = CANCELED_JOURNEY_CONTEXTS.JOURNEY;
        contextId = journeyId;
      } else if (
        journeyStatusIdOfJourneyDecision > journeyStatusMap.waiting &&
        journeyStatusIdOfJourneyDecision < journeyStatusMap.journeyStarted
      ) {
        // Journey decision exists but journey hasn't started - register with JourneyDecisions context
        contextType = CANCELED_JOURNEY_CONTEXTS.JOURNEY_DECISIONS;
        contextId = journeyDecisionId;
      } else if (!hasJourney) {
        // No journey exists yet - register with JourneyDecisions context
        contextType = CANCELED_JOURNEY_CONTEXTS.JOURNEY_DECISIONS;
        contextId = journeyDecisionId;
      } else {
        // Waiting status - don't register cancellation
        contextType = null;
        contextId = null;
      }

      // Register cancellation if context is determined (after successful transaction)
      if (contextType && contextId) {
        const canceledJourneyResult = await createCanceledJourney({
          contextId,
          contextType,
          canceledBy: userUniqueId,
          cancellationReasonsTypeId,
          roleId,
          driverUserUniqueId: ownerUserUniqueId,
          shipperUserUniqueId,
        });

        // Send admin notification only when no journey exists (first cancellation registration)
        // This happens after successful transaction commit
        if (!hasJourney) {
          const cancellationDetails =
            canceledJourneyResult?.data?.cancellationDetails;
          const journeyData = await getJourneyDataByContextType({
            contextType,
            contextId,
          });

          sendSocketIONotificationToAdmin({
            message: {
              message: "success",
              messageType: "cancelledJourney",
              data: [
                {
                  cancellationDetails,
                  journeyDetails: journeyData,
                },
              ],
            },
          });
        }
      }
    }

    // Build response structure - use notificationData if available, otherwise return simple response
    if (
      notificationData?.shipperRequest &&
      notificationData?.journeyDecision &&
      notificationData?.driverInfo
    ) {
      // Return structured response matching other functions
      const uniqueIds = {
        driverRequestUniqueId:
          notificationData.driverInfo?.driver?.driverRequestUniqueId,
        shipperRequestUniqueId:
          notificationData.shipperRequest?.shipperRequestUniqueId,
        journeyDecisionUniqueId:
          notificationData.journeyDecision?.journeyDecisionUniqueId,
        journeyUniqueId: notificationData.journeyData?.journeyUniqueId || null,
      };

      return {
        message: "success",
        status: finalStatus,
        uniqueIds,
        driver: {
          driver: notificationData.driverInfo?.driver || null,
          vehicle: notificationData.driverInfo?.vehicleOfDriver || null,
        },
        shipper: notificationData.shipperRequest || null,
        journey: notificationData.journeyData || null,
        decision: notificationData.journeyDecision || null,
      };
    }

    // Return simple response for rejectedByDriver or when notificationData is not available
    return {
      status: finalStatus || null,
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    logger.error("Unable to cancel driver request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to cancel driver request",
      error.statusCode || 500,
    );
  }
};

module.exports = { cancelDriverRequest };
