"use strict";

const { v4: uuidv4 } = require("uuid");
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
  sendSocketIONotificationToShipper,
} = require("../../../Utils/Notifications");
const {
  notifyCompanyOnDriverAction,
} = require("../../CompanyAssignment/assignmentHelper");
const {
  fetchJourneyNotificationData,
  buildDriverRequestData,
  buildJourneyDecisionFromJoin,
} = require("../helpers");

// ── Loading stages (4.1 / 4.2 / 4.3) ─────────────────────────────────────────
// Inserted between acceptedByShipper (4) and journeyStarted (8):
//   5 goToLoadingPlace  — driver confirmed heading to the loading place
//   6 loading           — driver arrived, loading in progress
//   7 loaded            — loading completed, ready to depart
// Each stage records the driver's GPS + a route point (like startJourney) and
// notifies the shipper + company/queue admin. Proof-of-loading attachments
// (photos, signed docs) are accepted only on the final stage (loaded) and are
// optional - merged into Journey.journeyProofOfLoading.
const LOADING_STAGE_CONFIG = {
  goToLoadingPlace: {
    expectedStatus: journeyStatusMap.acceptedByShipper,
    targetStatus: journeyStatusMap.goToLoadingPlace,
    latColumn: "journeyGoingToLoadingLat",
    lngColumn: "journeyGoingToLoadingLng",
    timeColumn: "journeyGoingToLoadingAt",
    messageType: messageTypes.driver_going_to_loading_place,
    companyAction: "going_to_loading_place",
    successMessage: "Driver confirmed going to loading place",
  },
  loading: {
    expectedStatus: journeyStatusMap.goToLoadingPlace,
    targetStatus: journeyStatusMap.loading,
    latColumn: "journeyLoadingStartedLat",
    lngColumn: "journeyLoadingStartedLng",
    timeColumn: "loadingStartedAt",
    messageType: messageTypes.driver_started_loading,
    companyAction: "started_loading",
    successMessage: "Driver started loading",
  },
  loaded: {
    expectedStatus: journeyStatusMap.loading,
    targetStatus: journeyStatusMap.loaded,
    latColumn: "journeyLoadingCompletedLat",
    lngColumn: "journeyLoadingCompletedLng",
    timeColumn: "loadingCompletedAt",
    messageType: messageTypes.driver_completed_loading,
    companyAction: "completed_loading",
    successMessage: "Driver completed loading",
    acceptsProof: true,
  },
};

const mergeProofOfLoading = (existing, incoming) => {
  const base = Array.isArray(existing) ? existing : existing ? [existing] : [];
  const add = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];
  const merged = [...base, ...add];
  return merged.length ? JSON.stringify(merged) : null;
};

const transitionLoadingStage = (stage) => async (body) => {
  const config = LOADING_STAGE_CONFIG[stage];
  if (!config) {
    throw new AppError("Unknown loading stage", AppError.BAD_REQUEST);
  }
  const {
    journeyDecisionUniqueId,
    userUniqueId,
    latitude,
    longitude,
    proofOfLoading: incomingProof,
  } = body;
  // Proof-of-loading attachments are accepted on the final stage (loaded) only;
  // stray proof sent on earlier stages is ignored.
  const proofOfLoading = config.acceptsProof ? incomingProof : undefined;

  return await executeInTransaction(
    async (conn) => {
      if (!journeyDecisionUniqueId || !userUniqueId) {
        throw new AppError(
          "journeyDecisionUniqueId and userUniqueId are required",
          AppError.BAD_REQUEST,
        );
      }
      if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
      ) {
        throw new AppError(
          "latitude and longitude are required",
          AppError.BAD_REQUEST,
        );
      }

      const validateQuery = `
        SELECT
          JourneyDecisions.*,
          DriverRequest.driverRequestUniqueId,
          DriverRequest.userUniqueId,
          ShipperRequest.shipperRequestUniqueId,
          ShipperRequest.shippingCost,
          ShipperRequest.isPodRequired,
          ShipperRequestBatch.shippingCost AS batchShippingCost,
          Journey.journeyUniqueId,
          Journey.journeyProofOfLoading,
          Users.fullName,
          Users.email,
          Users.phoneNumber
        FROM JourneyDecisions
        JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
        JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
        LEFT JOIN ShipperRequestBatch
          ON ShipperRequestBatch.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
        JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
        LEFT JOIN Journey ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
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

      if (combinedData.userUniqueId !== userUniqueId) {
        throw new AppError(
          "Driver user does not match journey decision",
          AppError.FORBIDDEN,
        );
      }
      if (combinedData.journeyStatusId !== config.expectedStatus) {
        throw new AppError(
          `This journey must be in the expected stage before ${config.successMessage}`,
          AppError.BAD_REQUEST,
        );
      }

      const existingProof = combinedData.journeyProofOfLoading
        ? JSON.parse(combinedData.journeyProofOfLoading)
        : [];
      const proof = mergeProofOfLoading(existingProof, proofOfLoading);

      let journeyUniqueId = combinedData.journeyUniqueId || uuidv4();
      const stageUpdate = {
        journeyStatusId: config.targetStatus,
        [config.latColumn]: latitude,
        [config.lngColumn]: longitude,
        ...(config.timeColumn ? { [config.timeColumn]: currentDate() } : {}),
        ...(proof ? { journeyProofOfLoading: proof } : {}),
        journeyUpdatedBy: userUniqueId,
        journeyUpdatedAt: currentDate(),
      };

      if (combinedData.journeyUniqueId) {
        await conn.query(
          `UPDATE Journey SET ${Object.keys(stageUpdate)
            .map((col) => `${col} = ?`)
            .join(", ")} WHERE journeyUniqueId = ?`,
          [...Object.values(stageUpdate), combinedData.journeyUniqueId],
        );
      } else {
        // Nearby-match journeys create the Journey row only at startJourney;
        // the loading stages are the first tracked moment, so create it here.
        //
        // Race-condition guard: two concurrent calls (e.g. double-tap / network
        // retry) can both read journeyUniqueId = NULL before either commits,
        // then both attempt to INSERT. Use INSERT IGNORE so the second
        // concurrent insert is silently skipped instead of throwing ER_DUP_ENTRY.
        const insertColAndVal = {
          journeyUniqueId,
          journeyDecisionUniqueId,
          journeyStatusId: config.targetStatus,
          ...stageUpdate,
          fare:
            combinedData.batchShippingCost ??
            combinedData.shippingCost ??
            combinedData.shippingCostByDriver ??
            0,
          journeyCreatedBy: userUniqueId,
          journeyCreatedAt: currentDate(),
        };
        const insertColumns = Object.keys(insertColAndVal).join(", ");
        const insertPlaceholders = Object.keys(insertColAndVal)
          .map(() => "?")
          .join(", ");
        const insertValues = Object.values(insertColAndVal);
        await conn.query(
          `INSERT IGNORE INTO Journey (${insertColumns}) VALUES (${insertPlaceholders})`,
          insertValues,
        );
        // Re-fetch the authoritative journeyUniqueId in case our INSERT was
        // ignored (i.e. a concurrent transaction already committed the row).
        const [existingJourneyRows] = await conn.query(
          `SELECT journeyUniqueId FROM Journey WHERE journeyDecisionUniqueId = ? LIMIT 1`,
          [journeyDecisionUniqueId],
        );
        if (existingJourneyRows?.length) {
          // Overwrite the locally-generated UUID with the real persisted one.
          // This ensures updateJourneyStatus and the route-point write reference
          // the correct row even when our INSERT was the losing concurrent call.
          journeyUniqueId = existingJourneyRows[0].journeyUniqueId;
        }
      }

      await updateJourneyStatus({
        journeyDecisionUniqueId,
        shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
        driverRequestUniqueId: combinedData.driverRequestUniqueId,
        journeyUniqueId,
        journeyStatusId: config.targetStatus,
        connection: conn,
      });

      // Mirror the loading-stage progress onto the queue entry, if this order
      // was queue-allocated (best-effort/idempotent; no-op for non-queue).
      try {
        const {
          updateQueueEntryOnJourneyProgress,
        } = require("../../DriverQueue.service");
        await updateQueueEntryOnJourneyProgress({
          shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
          userUniqueId,
          journeyStatusId: config.targetStatus,
        });
      } catch (queueProgressError) {
        logger.error("Error advancing queue entry loading stage", {
          error: queueProgressError.message,
          shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
        });
      }

      await createJourneyRoutePoint(
        {
          journeyDecisionUniqueId,
          latitude,
          longitude,
          userUniqueId,
        },
        conn,
      );

      return { combinedData, journeyUniqueId };
    },
    { timeout: 15000 },
  ).then(async ({ combinedData, journeyUniqueId }) => {
    const {
      sendShipperNotification,
    } = require("../../ShipperRequest/statusVerification.service");

    const journeyDecisionFromJoin = buildJourneyDecisionFromJoin(
      combinedData,
      config.targetStatus,
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
        messageType: config.messageType,
        status: config.targetStatus,
      });

      if (shipperRequest?.userUniqueId) {
        sendFCMNotificationToUser({
          userUniqueId: shipperRequest.userUniqueId,
          roleId: 1,
          notification: {
            title: config.messageType.message,
            body: config.messageType.details,
          },
        });
      }
    }

    // 🔴 Live mirror: push the driver's position to the shipper at the exact
    // moment of this loading stage, so the shipper's map shows the driver move
    // (same event the driver's LocationTracker streams continuously between
    // stages). Payload shape matches the driver app's locationUpdateToShipper
    // event so the shipper's socketHandler keys it by driverRequestUniqueId.
    if (shipperRequest?.phoneNumber) {
      try {
        await sendSocketIONotificationToShipper({
          eventName: "locationUpdateToShipper",
          phoneNumber: shipperRequest.phoneNumber,
          message: {
            latitude,
            longitude,
            driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
            shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
            journeyDecisionUniqueId: body.journeyDecisionUniqueId,
            journeyUniqueId: journeyData?.journeyUniqueId || journeyUniqueId,
            message: "Driver location updated",
            messageTypes: messageTypes.update_drivers_location_to_shipper,
          },
        });
      } catch (locationError) {
        logger.error("Error pushing loading-stage location to shipper", {
          error: locationError.message,
          stack: locationError.stack,
        });
      }
    }

    // 🔔 Notify company dispatcher + queue admin if this is a company/queue assignment
    notifyCompanyOnDriverAction({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      action: config.companyAction,
    });

    // 🔔 Queue org admins (real-time): when the order is a queue order and the
    // load happens at the queue site, push the loading-stage update to the
    // queue org. Best-effort + idempotent — skipped when the order is not
    // linked to a queue organization (batch header) or the socket layer is down.
    const { notifyQueueOrgOfLoadingStage } = require("../../../Utils/QueueSocket");
    await notifyQueueOrgOfLoadingStage({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      driverPhoneNumber: driverInfo?.driver?.phoneNumber || "",
      latitude,
      longitude,
      stage: config.companyAction, // 'going_to_loading_place' | 'started_loading' | 'completed_loading'
    });

    return {
      message: config.successMessage,
      status: config.targetStatus,
      uniqueIds: {
        driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
        shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
        journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
        journeyUniqueId: journeyData?.journeyUniqueId || journeyUniqueId,
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

const goToLoadingPlace = transitionLoadingStage("goToLoadingPlace");
const startLoading = transitionLoadingStage("loading");
const loadCompleted = transitionLoadingStage("loaded");

module.exports = { goToLoadingPlace, startLoading, loadCompleted };
