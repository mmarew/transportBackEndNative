const { v4: uuidv4 } = require("uuid");
const { getData } = require("../../CRUD/Read/ReadData");
const { insertData } = require("../../CRUD/Create/CreateData");
const { DOMAIN } = require("../../Utils/Constants");

const { sendFCMNotificationToUser } = require("../Firebase.service");
const {
  notifyCompanyOnDriverAction,
} = require("../CompanyAssignment/assignmentHelper");
const { createJourneyRoutePoint } = require("../JourneyRoutePoints.service");
const {
  getJourneyDecisionByJourneyDecisionUniqueId,
} = require("../JourneyDecisions.service");
const { updateJourneyStatus } = require("../JourneyStatus");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const {
  fetchJourneyNotificationData,
  buildDriverRequestData,
  buildJourneyDecisionFromJoin,
} = require("./helpers");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const { createCommission } = require("../Commission.service");
const {
  prepareAndCreateNewBalance,
} = require("../UserBalance.service/UserBalance.post.service");

const { getUserSubscriptionsWithFilters } = require("../UserSubscription");

const startJourney = async (body) => {
  return await executeInTransaction(
    async (conn) => {
      const journeyUniqueId = uuidv4();
      const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
      const userUniqueId = body?.userUniqueId;
      const journeyStartingLat = body?.journeyStartingLat;
      const journeyStartingLng = body?.journeyStartingLng;

      if (!userUniqueId) {
        throw new AppError("User authentication required", AppError.UNAUTHORIZED);
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
        throw new AppError("This journey has already been started", AppError.BAD_REQUEST);
      }
      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError("This journey has already been completed", AppError.BAD_REQUEST);
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
        throw new AppError("This journey is not accepted by shipper", AppError.BAD_REQUEST);
      }
      if (combinedData.userUniqueId !== userUniqueId) {
        throw new AppError("Driver user does not match journey decision", AppError.FORBIDDEN);
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
            startTime: currentDate(),
            journeyStartingLat,
            journeyStartingLng,
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
             journeyUpdatedBy = ?, journeyUpdatedAt = ?
           WHERE journeyUniqueId = ?`,
          [
            journeyStartingLat,
            journeyStartingLng,
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

      return { combinedData, finalJourneyUniqueId };
    },
    { timeout: 15000 },
  ).then(async ({ combinedData, finalJourneyUniqueId }) => {
    // Notifications after transaction
    const {
      sendShipperNotification,
    } = require("../ShipperRequest/statusVerification.service");

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

      if (body?.journeyCompletingLat == null || body?.journeyCompletingLng == null) {
        throw new AppError(
          "journeyCompletingLat and journeyCompletingLng are required",
          AppError.BAD_REQUEST,
        );
      }

      const validateQuery = `
      SELECT JourneyDecisions.*, DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.shippingCost,
        ShipperRequest.requestMode,
        ShipperRequest.targetCompanyUniqueId,
        Journey.journeyUniqueId,
        Journey.startTime, Journey.endTime,
        Users.fullName,
        Users.phoneNumber FROM JourneyDecisions
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
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
        throw new AppError("Journey data not found or UUIDs mismatch", AppError.NOT_FOUND);
      }

      const combinedData = journeyDecisionDriverData[0];

      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError("This journey has already been completed", AppError.BAD_REQUEST);
      }

      const isAdmin =
        body.roleId === usersRoles?.adminRoleId ||
        body.roleId === usersRoles?.supperAdminRoleId;
      if (!isAdmin && combinedData?.userUniqueId !== userUniqueId) {
        throw new AppError("Driver user does not match journey decision", AppError.FORBIDDEN);
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
            SET journeyCompletingLat = ?,
                journeyCompletingLng = ?,
                journeyUpdatedAt      = ?
          WHERE journeyUniqueId = ?`,
        [body.journeyCompletingLat ?? null, body.journeyCompletingLng ?? null, currentDate(), journeyUniqueId],
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
    } = require("../ShipperRequest/statusVerification.service");

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

const sendUpdatedLocation = async (body) => {
  try {
    const { journeyDecisionUniqueId, latitude, longitude, userUniqueId } = body;

    // Validate required fields
    if (!journeyDecisionUniqueId) {
      throw new AppError("journeyDecisionUniqueId is required", AppError.BAD_REQUEST);
    }

    if (latitude === undefined || latitude === null) {
      throw new AppError("latitude is required", AppError.BAD_REQUEST);
    }

    if (longitude === undefined || longitude === null) {
      throw new AppError("longitude is required", AppError.BAD_REQUEST);
    }

    if (userUniqueId === undefined || userUniqueId === null) {
      throw new AppError("userUniqueId is required", AppError.BAD_REQUEST);
    }

    // Validate coordinate ranges
    if (latitude < DOMAIN.LATITUDE_MIN || latitude > DOMAIN.LATITUDE_MAX) {
      throw new AppError("Invalid latitude. Must be between -90 and 90", AppError.BAD_REQUEST);
    }

    if (longitude < DOMAIN.LONGITUDE_MIN || longitude > DOMAIN.LONGITUDE_MAX) {
      throw new AppError(
        "Invalid longitude. Must be between -180 and 180",
        AppError.BAD_REQUEST,
      );
    }

    // Fetch journey decision to validate driver owns this journey
    const journeyDecision = await getJourneyDecisionByJourneyDecisionUniqueId(
      journeyDecisionUniqueId,
    );

    if (!journeyDecision?.data || journeyDecision.data.length === 0) {
      throw new AppError("Journey decision not found", AppError.NOT_FOUND);
    }

    const journeyDecisionData = journeyDecision.data[0];
    const driverRequestId = journeyDecisionData.driverRequestId;

    // Validate driver owns this journey request
    const driverRequest = await getData({
      tableName: "DriverRequest",
      conditions: {
        driverRequestId,
        userUniqueId, // Ensure driver owns this request
      },
      limit: 1,
    });

    if (!driverRequest || driverRequest.length === 0) {
      throw new AppError(
        "Driver request not found or you don't have permission to update location for this journey",
        AppError.FORBIDDEN,
      );
    }

    // Validate journey status - location updates should only be sent for active journeys
    const journeyStatusId = driverRequest[0].journeyStatusId;
    const activeStatuses = [
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByShipper,
      journeyStatusMap.goToLoadingPlace,
      journeyStatusMap.loading,
      journeyStatusMap.loaded,
      journeyStatusMap.journeyStarted,
    ];

    if (!activeStatuses.includes(journeyStatusId)) {
      throw new AppError(
        "Location updates can only be sent for active journeys (accepted, loading, or started)",
        AppError.BAD_REQUEST,
      );
    }

    // Fetch shipper phone number from journey data if not provided
    let shipperPhoneNumber = body.shipperPhone;
    if (!shipperPhoneNumber) {
      // Pass already-fetched journeyDecision and driverRequest to avoid re-fetching
      const notificationData = await fetchJourneyNotificationData(
        journeyDecisionUniqueId,
        driverRequest, // Already fetched above
        null, // No vehicle data available
        journeyDecision, // Already fetched above - pass to avoid re-fetching
      );

      if (
        notificationData.message === "error" ||
        !notificationData.shipperRequest
      ) {
        throw new AppError(
          "Unable to fetch shipper information for location update",
          AppError.NOT_FOUND,
        );
      }

      shipperPhoneNumber = notificationData.shipperRequest?.phoneNumber || null;

      if (!shipperPhoneNumber) {
        throw new AppError("Shipper phone number not found", AppError.NOT_FOUND);
      }
    }

    // Store location in JourneyRoutePoints table for historical tracking and real-time notification
    // Single table insert - no transaction needed (atomic operation)
    // createJourneyRoutePoint handles storing location and sending notification to shipper
    // Note: createJourneyRoutePoint is already imported at the top of the file
    const routePointResult = await createJourneyRoutePoint({
      journeyDecisionUniqueId,
      latitude,
      longitude,
      userUniqueId,
      shipperPhoneNumber, // Pass for notification (createJourneyRoutePoint sends notification)
      ...(body.additionalData || {}), // Include any additional data for notification
    });

    // If route point creation failed, return error
    if (!routePointResult.success) {
      throw new AppError(
        routePointResult.message || "Failed to store location",
        AppError.BAD_REQUEST,
      );
    }

    // Note: createJourneyRoutePoint already sends WebSocket notification to shipper
    // with messageType: update_drivers_location_to_shipper
    // No need to send duplicate notification here

    return {
      message: "Location updated successfully",
      data: null,
      journeyRoutePointsUniqueId:
        routePointResult.data?.journeyRoutePointsUniqueId,
      latitude,
      longitude,
      timestamp: currentDate(),
      journeyDecisionUniqueId,
    };
  } catch (error) {
    logger.error("@sendUpdatedLocation error:", error);
    throw new AppError(
      error.message || "Unable to send updated location",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

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
    timeColumn: null,
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
  const base = Array.isArray(existing)
    ? existing
    : existing
      ? [existing]
      : [];
  const add = Array.isArray(incoming)
    ? incoming
    : incoming
      ? [incoming]
      : [];
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
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
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
          Journey.journeyUniqueId,
          Journey.journeyProofOfLoading,
          Users.fullName,
          Users.email,
          Users.phoneNumber
        FROM JourneyDecisions
        JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
        JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
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
        throw new AppError("Driver user does not match journey decision", AppError.FORBIDDEN);
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

      const journeyUniqueId = combinedData.journeyUniqueId || uuidv4();
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
        await insertData({
          tableName: "Journey",
          colAndVal: {
            journeyUniqueId,
            journeyDecisionUniqueId,
            journeyStatusId: config.targetStatus,
            startTime: currentDate(),
            ...stageUpdate,
            journeyCreatedBy: userUniqueId,
            journeyCreatedAt: currentDate(),
          },
          connection: conn,
        });
      }

      await updateJourneyStatus({
        journeyDecisionUniqueId,
        shipperRequestUniqueId: combinedData.shipperRequestUniqueId,
        driverRequestUniqueId: combinedData.driverRequestUniqueId,
        journeyUniqueId,
        journeyStatusId: config.targetStatus,
        connection: conn,
      });

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
    } = require("../ShipperRequest/statusVerification.service");

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

    // 🔔 Notify company dispatcher + queue admin if this is a company/queue assignment
    notifyCompanyOnDriverAction({
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      driverName: driverInfo?.driver?.fullName || "",
      action: config.companyAction,
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

module.exports = {
  startJourney,
  completeJourney,
  sendUpdatedLocation,
  goToLoadingPlace,
  startLoading,
  loadCompleted,
};
