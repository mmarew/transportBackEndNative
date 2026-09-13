"use strict";

const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const {
  journeyStatusMap,
  usersRoles,
} = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");
const messageTypes = require("../../../Utils/MessageTypes");
const { updateJourneyStatus } = require("../../JourneyStatus");
const { createJourneyRoutePoint } = require("../../JourneyRoutePoints.service");
const { createCommission } = require("../../Commission.service");
const {
  prepareAndCreateNewBalance,
} = require("../../UserBalance.service/UserBalance.post.service");
const { sendFCMNotificationToUser } = require("../../Firebase.service");
const {
  notifyCompanyOnDriverAction,
} = require("../../CompanyAssignment/assignmentHelper");
const { getUserSubscriptionsWithFilters } = require("../../UserSubscription");
const {
  fetchJourneyNotificationData,
  buildDriverRequestData,
  buildJourneyDecisionFromJoin,
} = require("../helpers");

/**
 * Complete a journey — marks the journey as completed (status 9), calculates
 * service charges (commission or subscription), closes the queue slot if the
 * order came from a queue dispatch, and optionally auto-confirms POD.
 *
 * Auto-confirm logic (runs after the transaction commits):
 * - If `isPodRequired=false` on the ShipperRequest, a CONFIRMED
 *   DeliveryConfirmation is created automatically with source `'AUTO_NO_POD'`.
 *   No photos or signatures are needed.
 * - If `isPodRequired=true`, no auto-confirm occurs — the driver must submit
 *   receipt photos or the shipper must submit a formal POD.
 *
 * @param {Object} body - Request body.
 * @param {string} body.journeyDecisionUniqueId - UUID of the journey decision.
 * @param {string} body.userUniqueId - UUID of the driver completing the journey.
 * @param {string} body.shipperRequestUniqueId - UUID of the shipper request.
 * @param {string} body.journeyUniqueId - UUID of the journey to complete.
 * @param {string} body.driverRequestUniqueId - UUID of the driver request.
 * @param {number} [body.journeyCompletingLat] - GPS latitude at completion.
 * @param {number} [body.journeyCompletingLng] - GPS longitude at completion.
 * @returns {Promise<{message: string, status: number, data: Object}>}
 */
//collect scervice charge from journey completion by commision or allow user to do by subscription if it has an active subscription
const completeJourney = async (body) => {
  return await executeInTransaction(
    async (conn) => {
      const {
        journeyDecisionUniqueId,
        userUniqueId,
        shipperRequestUniqueId,
        journeyUniqueId,
        driverRequestUniqueId,
      } = body;

      if (
        !journeyDecisionUniqueId ||
        !shipperRequestUniqueId ||
        !driverRequestUniqueId ||
        !journeyUniqueId ||
        !userUniqueId
      ) {
        throw new AppError("Missing required unique IDs", AppError.BAD_REQUEST);
      }

      if (
        body?.journeyCompletingLat == null ||
        body?.journeyCompletingLng == null
      ) {
        throw new AppError(
          "journeyCompletingLat and journeyCompletingLng are required",
          AppError.BAD_REQUEST,
        );
      }

      const validateQuery = `
      SELECT JourneyDecisions.*, DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.isPodRequired,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.shippingCost,
        ShipperRequest.requestMode,
        ShipperRequest.targetCompanyUniqueId,
        srb.queueOrganizationUniqueId,
        Journey.journeyUniqueId,
        Journey.journeyStartedAt, Journey.journeyCompletedAt,
        Users.fullName,
        Users.phoneNumber FROM JourneyDecisions
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join
      LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
      JOIN Journey ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      WHERE JourneyDecisions.journeyDecisionUniqueId = ?
        AND ShipperRequest.shipperRequestUniqueId = ?
        AND DriverRequest.driverRequestUniqueId = ?
        AND Journey.journeyUniqueId = ?
      LIMIT 1
    `;

      const [journeyDecisionDriverData] = await conn.query(validateQuery, [
        journeyDecisionUniqueId,
        shipperRequestUniqueId,
        driverRequestUniqueId,
        journeyUniqueId,
      ]);

      if (!journeyDecisionDriverData?.length) {
        throw new AppError(
          "Journey data not found or UUIDs mismatch",
          AppError.NOT_FOUND,
        );
      }

      const combinedData = journeyDecisionDriverData[0];

      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError(
          "This journey has already been completed",
          AppError.BAD_REQUEST,
        );
      }

      const isAdmin =
        body.roleId === usersRoles?.adminRoleId ||
        body.roleId === usersRoles?.supperAdminRoleId;
      if (!isAdmin && combinedData?.userUniqueId !== userUniqueId) {
        throw new AppError(
          "Driver user does not match journey decision",
          AppError.FORBIDDEN,
        );
      }

      const subscriptionInfo = await getUserSubscriptionsWithFilters({
        driverUniqueId: userUniqueId,
        page: 1,
        limit: 1,
        isActive: true,
      });

      const subscriptionData = subscriptionInfo?.data?.[0] || null;

      await updateJourneyStatus({
        journeyDecisionUniqueId,
        shipperRequestUniqueId,
        driverRequestUniqueId,
        journeyUniqueId,
        journeyStatusId: body.journeyStatusId,
        deliveryDateByDriver: currentDate(),
        connection: conn,
      });

      // Record the driver's actual completion GPS so the platform can verify
      // that the job really ended at the delivered location (mirrors
      // journeyStartingLat/Lng captured in startJourney).
      await conn.query(
        `UPDATE Journey
            SET journeyCompletingLat   = ?,
                journeyCompletingLng   = ?,
                journeyCompletedAt     = ?,
                journeyCompletedByUser = ?,
                journeyUpdatedAt       = ?
          WHERE journeyUniqueId = ?`,
        [
          body.journeyCompletingLat ?? null,
          body.journeyCompletingLng ?? null,
          currentDate(),
          userUniqueId,
          currentDate(),
          journeyUniqueId,
        ],
      );

      const paymentAmount =
        combinedData?.shippingCostByDriver ?? combinedData?.shippingCost;

      // Company-assignment journeys are billed to the transport company, not the
      // driver — skip commission deduction for those flows.
      // A journey is a company flow when the JourneyDecision was created by the
      // company OR the ShipperRequest is company-targeted OR an active company
      // assignment links this shipper request + driver + decision.
      const [companyAssignRows] = await conn.query(
        `SELECT 1 FROM CompanyBidVehicleAssignment
         WHERE shipperRequestUniqueId = ?
           AND driverUserUniqueId = ?
           AND journeyDecisionUniqueId = ?
           AND assignmentDeletedAt IS NULL
           AND assignmentStatus NOT IN
             ('rejected_by_driver', 'cancelled_by_company',
              'cancelled_by_shipper', 'cancelled_by_driver')
         LIMIT 1`,
        [shipperRequestUniqueId, userUniqueId, journeyDecisionUniqueId],
      );
      const isCompanyFlow =
        combinedData?.decisionBy === "company" ||
        combinedData?.requestMode === "company_target" ||
        Boolean(combinedData?.targetCompanyUniqueId) ||
        companyAssignRows?.length > 0;

      if (!subscriptionData && !isCompanyFlow) {
        if (!paymentAmount || paymentAmount <= 0) {
          throw new AppError(
            "Invalid payment amount from journey decision",
            AppError.BAD_REQUEST,
          );
        }
        // Credit the driver with the earned fare BEFORE deducting the platform
        // commission. The driver's fare funds the commission, so completing a
        // journey must never fail due to a pre-existing zero balance.
        await prepareAndCreateNewBalance({
          addOrDeduct: "add",
          amount: paymentAmount,
          driverUniqueId: userUniqueId,
          transactionUniqueId: body?.journeyDecisionUniqueId,
          transactionType: "Deposit",
          userBalanceCreatedBy: userUniqueId,
        });
        await createCommission(
          {
            journeyDecisionUniqueId: body?.journeyDecisionUniqueId,
            paymentAmount,
            commissionCreatedBy: userUniqueId,
          },
          conn,
        );
      }

      await createJourneyRoutePoint(
        {
          journeyDecisionUniqueId: body?.journeyDecisionUniqueId,
          latitude: body?.journeyCompletingLat,
          longitude: body?.journeyCompletingLng,
          userUniqueId,
        },
        conn,
      );

      return combinedData;
    },
    { timeout: 20000 },
  ).then(async (combinedData) => {
    // Notifications after successful transaction commit
    const {
      sendShipperNotification,
    } = require("../../ShipperRequest/statusVerification.service");

    const journeyDecisionFromJoin = buildJourneyDecisionFromJoin(
      combinedData,
      journeyStatusMap.journeyCompleted, // Use updated status, not combinedData.journeyStatusId
    );

    const driverRequestData = buildDriverRequestData(combinedData);

    const notificationDataResult = await fetchJourneyNotificationData(
      body.journeyDecisionUniqueId,
      [driverRequestData],
      null,
      [journeyDecisionFromJoin],
    );

    const {
      shipperRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
    } = notificationDataResult;

    if (shipperRequest && journeyDecisionData && driverInfo) {
      await sendShipperNotification({
        shipperRequest,
        journeyDecision: journeyDecisionData,
        driverInfo,
        journeyData,
        messageType: messageTypes.driver_completed_journey,
        status: journeyStatusMap.journeyCompleted,
        data: null,
      });

      if (shipperRequest?.userUniqueId) {
        sendFCMNotificationToUser({
          userUniqueId: shipperRequest.userUniqueId,
          roleId: 1,
          notification: {
            title: messageTypes.driver_completed_journey.message,
            body: messageTypes.driver_completed_journey.details,
          },
        });
      }
    }

    // 🔔 Notify company + dispatcher if company-targeted assignment
    notifyCompanyOnDriverAction({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      action: "completed_journey",
    });

    // Close the queue slot: a COMPLETED queue order consumes the driver's slot.
    // Mark the entry journeyCompleted (same closure as checkout/leave) so the
    // driver is out of the queue and MUST re-register for the next placement.
    // Best-effort + idempotent — only touches entries still agreed and holding
    // this order; non-queue journeys are untouched.
    if (combinedData?.queueOrganizationUniqueId) {
      const {
        closeEntryOnJourneyCompletion,
      } = require("../../DriverQueue.service");
      try {
        await closeEntryOnJourneyCompletion({
          shipperRequestUniqueId: body.shipperRequestUniqueId,
          userUniqueId: body.userUniqueId,
          driverName: driverInfo?.driver?.fullName || "",
        });
      } catch (closeError) {
        logger.error("Error closing queue slot after journey completion", {
          error: closeError.message,
          shipperRequestUniqueId: body.shipperRequestUniqueId,
        });
      }
    }

    /**
     * Auto-confirm POD based on isPodRequired flag.
     *
     * Runs AFTER the main transaction commits (fire-and-forget). When
     * `isPodRequired=false` on the ShipperRequest, creates a CONFIRMED
     * DeliveryConfirmation with source `'AUTO_NO_POD'` — no photos or
     * signatures needed. Errors are logged but do not affect the journey
     * completion response.
     *
     * When `isPodRequired=true`, no action is taken here. The driver must
     * submit receipt photos (POST /api/deliveryConfirmations/receipt) or
     * the shipper must submit a formal POD.
     */
    try {
      const isPodRequired = combinedData?.isPodRequired;
      if (isPodRequired === false || isPodRequired === 0) {
        const {
          createReceiptConfirmation,
        } = require("../../DeliveryConfirmation.service");
        await createReceiptConfirmation({
          journeyUniqueId: body.journeyUniqueId,
          driverUserUniqueId: body.userUniqueId,
          photoUrls: [],
          source: "AUTO_NO_POD",
          notes: "Auto-confirmed: POD not required for this shipment",
          latitude: body.journeyCompletingLat ?? null,
          longitude: body.journeyCompletingLng ?? null,
        });
        logger.info("Auto-confirmed delivery (isPodRequired=false)", {
          journeyUniqueId: body.journeyUniqueId,
        });
      }
    } catch (autoConfirmError) {
      logger.error("Failed to auto-confirm delivery on journey completion", {
        journeyUniqueId: body.journeyUniqueId,
        error: autoConfirmError.message,
      });
    }

    return {
      message: "Journey completed successfully",
      status: journeyStatusMap.journeyCompleted,
      uniqueIds: {
        driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
        shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
        journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
        journeyUniqueId: journeyData?.journeyUniqueId || body.journeyUniqueId,
      },
      driver: {
        driver: driverInfo?.driver || null,
        vehicle: driverInfo?.vehicleOfDriver || null,
      },
      shipper: shipperRequest || null,
      journey: journeyData || null,
      decision: journeyDecisionData || null,
    };
  });
};

module.exports = { completeJourney };
