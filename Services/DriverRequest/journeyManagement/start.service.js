"use strict";

const { v4: uuidv4 } = require("uuid");
const { insertData } = require("../../../CRUD/Create/CreateData");
const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");
const messageTypes = require("../../../Utils/MessageTypes");
const { updateJourneyStatus } = require("../../JourneyStatus");
const { createJourneyRoutePoint } = require("../../JourneyRoutePoints.service");
const { sendFCMNotificationToUser } = require("../../Firebase.service");
const {
  notifyCompanyOnDriverAction,
} = require("../../CompanyAssignment/assignmentHelper");
const {
  fetchJourneyNotificationData,
  buildDriverRequestData,
  buildJourneyDecisionFromJoin,
} = require("../helpers");

const startJourney = async (body) => {
  return await executeInTransaction(
    async (conn) => {
      const journeyUniqueId = uuidv4();
      const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
      const userUniqueId = body?.userUniqueId;
      const journeyStartingLat = body?.journeyStartingLat;
      const journeyStartingLng = body?.journeyStartingLng;

      if (!userUniqueId) {
        throw new AppError(
          "User authentication required",
          AppError.UNAUTHORIZED,
        );
      }
      if (journeyStartingLat == null || journeyStartingLng == null) {
        throw new AppError(
          "journeyStartingLat and journeyStartingLng are required",
          AppError.BAD_REQUEST,
        );
      }

      const validateQuery = `
      SELECT 
        JourneyDecisions.*,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.isPodRequired,
        Users.fullName,
        Users.email,
        Users.phoneNumber
      FROM JourneyDecisions
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      WHERE JourneyDecisions.journeyDecisionUniqueId = ?
      LIMIT 1
    `;

      const [journeyDecisionDriverData] = await conn.query(validateQuery, [
        journeyDecisionUniqueId,
      ]);

      if (!journeyDecisionDriverData?.length) {
        throw new AppError("Journey decision not found", AppError.NOT_FOUND);
      }

      const combinedData = journeyDecisionDriverData[0];

      if (combinedData.journeyStatusId === journeyStatusMap.journeyStarted) {
        throw new AppError(
          "This journey has already been started",
          AppError.BAD_REQUEST,
        );
      }
      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError(
          "This journey has already been completed",
          AppError.BAD_REQUEST,
        );
      }
      // The journey can be started from acceptedByShipper (4) or from any of the
      // loading stages (5 goToLoadingPlace / 6 loading / 7 loaded).
      const startableStatuses = [
        journeyStatusMap.acceptedByShipper,
        journeyStatusMap.goToLoadingPlace,
        journeyStatusMap.loading,
        journeyStatusMap.loaded,
      ];
      if (!startableStatuses.includes(combinedData.journeyStatusId)) {
        throw new AppError(
          "This journey is not accepted by shipper",
          AppError.BAD_REQUEST,
        );
      }
      if (combinedData.userUniqueId !== userUniqueId) {
        throw new AppError(
          "Driver user does not match journey decision",
          AppError.FORBIDDEN,
        );
      }

      const checkJourneySql = `SELECT * FROM Journey WHERE journeyDecisionUniqueId = ? LIMIT 1`;
      const [existingJourneyCheck] = await conn.query(checkJourneySql, [
        journeyDecisionUniqueId,
      ]);

      let finalJourneyUniqueId = journeyUniqueId;

      if (!existingJourneyCheck?.length || existingJourneyCheck.length === 0) {
        await insertData({
          tableName: "Journey",
          colAndVal: {
            journeyUniqueId,
            journeyDecisionUniqueId: body.journeyDecisionUniqueId,
            journeyStatusId: body.journeyStatusId,
            journeyStartingLat,
            journeyStartingLng,
            journeyStartedAt: currentDate(),
            journeyStartedByUser: userUniqueId,
            journeyCreatedBy: userUniqueId,
            journeyCreatedAt: currentDate(),
          },
          connection: conn,
        });

        await createJourneyRoutePoint(
          {
            journeyDecisionUniqueId: body.journeyDecisionUniqueId,
            latitude: journeyStartingLat,
            longitude: journeyStartingLng,
            userUniqueId,
          },
          conn,
        );
      } else {
        finalJourneyUniqueId = existingJourneyCheck[0].journeyUniqueId;
        // The Journey row already exists (queue/company orders create it at
        // accept/confirm, status 4, and the loading stages 5/6/7 keep it).
        // Record the driver's start GPS on the row itself (like the insert
        // branch above) AND as the first route point — startJourney is the
        // moment the trip begins, and the shipper map uses
        // journeyStartingLat/Lng as the blue-line start point.
        await conn.query(
          `UPDATE Journey SET journeyStartingLat = ?, journeyStartingLng = ?,
             journeyStartedAt = ?, journeyStartedByUser = ?,
             journeyUpdatedBy = ?, journeyUpdatedAt = ?
           WHERE journeyUniqueId = ?`,
          [
            journeyStartingLat,
            journeyStartingLng,
            currentDate(),
            userUniqueId,
            userUniqueId,
            currentDate(),
            finalJourneyUniqueId,
          ],
        );
        await createJourneyRoutePoint(
          {
            journeyDecisionUniqueId: body.journeyDecisionUniqueId,
            latitude: journeyStartingLat,
            longitude: journeyStartingLng,
            userUniqueId,
          },
          conn,
        );
      }

      await updateJourneyStatus({
        journeyDecisionUniqueId,
        shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
        driverRequestUniqueId: combinedData.driverRequestUniqueId,
        journeyStatusId: body.journeyStatusId,
        journeyUniqueId: finalJourneyUniqueId,
        shippingDateByDriver: currentDate(),
        connection: conn,
      });

      // Mirror journeyStarted (8) onto the queue entry if this order was
      // queue-allocated (best-effort/idempotent; no-op for non-queue).
      try {
        const {
          updateQueueEntryOnJourneyProgress,
        } = require("../../DriverQueue.service");
        await updateQueueEntryOnJourneyProgress({
          shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
          userUniqueId,
          journeyStatusId: journeyStatusMap.journeyStarted,
        });
      } catch (queueProgressError) {
        logger.error("Error advancing queue entry to journeyStarted", {
          error: queueProgressError.message,
          shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
        });
      }

      return { combinedData, finalJourneyUniqueId };
    },
    { timeout: 15000 },
  ).then(async ({ combinedData, finalJourneyUniqueId }) => {
    // Notifications after transaction
    const {
      sendShipperNotification,
    } = require("../../ShipperRequest/statusVerification.service");

    const journeyDecisionFromJoin = buildJourneyDecisionFromJoin(
      combinedData,
      journeyStatusMap.journeyStarted, // Use updated status, not combinedData.journeyStatusId
    );

    const driverRequestData = buildDriverRequestData(combinedData);

    const {
      shipperRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
    } = await fetchJourneyNotificationData(
      body.journeyDecisionUniqueId,
      [driverRequestData],
      null,
      [journeyDecisionFromJoin],
    );

    if (shipperRequest && journeyDecisionData && driverInfo) {
      await sendShipperNotification({
        shipperRequest,
        journeyDecision: journeyDecisionData,
        driverInfo,
        journeyData,
        messageType: messageTypes.driver_started_journey,
        status: journeyStatusMap.journeyStarted,
      });

      if (shipperRequest?.userUniqueId) {
        sendFCMNotificationToUser({
          userUniqueId: shipperRequest.userUniqueId,
          roleId: 1,
          notification: {
            title: messageTypes.driver_started_journey.message,
            body: messageTypes.driver_started_journey.details,
          },
        });
      }
    }

    // 🔔 Notify company + dispatcher if this is a company-targeted assignment
    notifyCompanyOnDriverAction({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      action: "started_journey",
    });

    // 🔔 Queue org admins (real-time): when the order is a queue order (the
    // queue org is resolved via the batch header), push the journey-started
    // update to the queue org. Best-effort + idempotent — skipped when the
    // order is not linked to a queue organization or the socket layer is down.
    const { notifyQueueOrgOfLoadingStage } = require("../../../Utils/QueueSocket");
    await notifyQueueOrgOfLoadingStage({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      driverPhoneNumber: driverInfo?.driver?.phoneNumber || "",
      latitude: body?.journeyStartingLat,
      longitude: body?.journeyStartingLng,
      stage: "started_journey",
    });

    return {
      message: "Journey started successfully",
      status: journeyStatusMap.journeyStarted,
      uniqueIds: {
        driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
        shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
        journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
        journeyUniqueId: journeyData?.journeyUniqueId || finalJourneyUniqueId,
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

module.exports = { startJourney };
