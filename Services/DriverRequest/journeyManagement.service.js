const { v4: uuidv4 } = require("uuid");
const { getData } = require("../../CRUD/Read/ReadData");
const { insertData } = require("../../CRUD/Create/CreateData");

const { sendFCMNotificationToUser } = require("../Firebase.service");
const { notifyCompanyOnDriverAction } = require("../CompanyAssignment/assignmentHelper");
const { createJourneyRoutePoint } = require("../JourneyRoutePoints.service");
const {
  getJourneyDecisionByJourneyDecisionUniqueId,
} = require("../JourneyDecisions.service");
const { updateJourneyStatus } = require("../JourneyStatus");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const { fetchJourneyNotificationData } = require("./helpers");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const { createCommission } = require("../Commission.service");

const {
  getUserSubscriptionsWithFilters,
} = require("../UserSubscription");

const startJourney = async (body) => {
  return await executeInTransaction(
    async (conn) => {
      const journeyUniqueId = uuidv4();
      const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
      const userUniqueId = body?.userUniqueId;
      const latitude = body?.latitude,
        longitude = body?.longitude;

      if (!userUniqueId) {
        throw new AppError("User authentication required", 401);
      }
      if (!latitude || !longitude) {
        throw new AppError("Latitude and longitude are required", 400);
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
        throw new AppError("Journey decision not found", 404);
      }

      const combinedData = journeyDecisionDriverData[0];

      if (combinedData.journeyStatusId === journeyStatusMap.journeyStarted) {
        throw new AppError("This journey has already been started", 400);
      }
      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError("This journey has already been completed", 400);
      }
      if (combinedData.journeyStatusId !== journeyStatusMap.acceptedByShipper) {
        throw new AppError("This journey is not accepted by shipper", 400);
      }
      if (combinedData.userUniqueId !== userUniqueId) {
        throw new AppError("Driver user does not match journey decision", 403);
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
            journeyCreatedBy: userUniqueId,
            journeyCreatedAt: currentDate(),
          },
          connection: conn,
        });

        await createJourneyRoutePoint({
          journeyDecisionUniqueId: body.journeyDecisionUniqueId,
          latitude,
          longitude,
          userUniqueId,
        }, conn);
      } else {
        finalJourneyUniqueId = existingJourneyCheck[0].journeyUniqueId;
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

    const journeyDecisionFromJoin = {
      journeyDecisionUniqueId: combinedData.journeyDecisionUniqueId,
      shipperRequestId: combinedData.shipperRequestId,
      driverRequestId: combinedData.driverRequestId,
      journeyStatusId: journeyStatusMap.journeyStarted, // Use updated status, not combinedData.journeyStatusId
      decisionTime: combinedData.decisionTime,
      decisionBy: combinedData.decisionBy,
      shippingCostByDriver: combinedData.shippingCostByDriver,
      shippingDateByDriver: combinedData.shippingDateByDriver,
      deliveryDateByDriver: combinedData.deliveryDateByDriver,
    };

    // Filter combinedData into driverRequest formal structure
    const driverRequestData = {
      driverRequestUniqueId: combinedData.driverRequestUniqueId,
      userUniqueId: combinedData.userUniqueId,
      fullName: combinedData.fullName,
      email: combinedData.email,
      phoneNumber: combinedData.phoneNumber,
    };

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
      message: "success",
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
        throw new AppError("Missing required unique IDs", 400);
      }

      const validateQuery = `
      SELECT JourneyDecisions.*, DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
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
        throw new AppError("Journey data not found or UUIDs mismatch", 404);
      }

      const combinedData = journeyDecisionDriverData[0];

      if (combinedData.journeyStatusId === journeyStatusMap.journeyCompleted) {
        throw new AppError("This journey has already been completed", 400);
      }

      const isAdmin =
        body.roleId === usersRoles?.adminRoleId ||
        body.roleId === usersRoles?.supperAdminRoleId;
      if (!isAdmin && combinedData?.userUniqueId !== userUniqueId) {
        throw new AppError("Driver user does not match journey decision", 403);
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

      const paymentAmount = combinedData?.shippingCostByDriver;

      if (!subscriptionData) {
        if (!paymentAmount || paymentAmount <= 0) {
          throw new AppError(
            "Invalid payment amount from journey decision",
            400,
          );
        }
        await createCommission({
          journeyDecisionUniqueId: body?.journeyDecisionUniqueId,
          paymentAmount,
          commissionCreatedBy: userUniqueId,
        }, conn);
      }

      await createJourneyRoutePoint({
        journeyDecisionUniqueId: body?.journeyDecisionUniqueId,
        latitude: body?.latitude,
        longitude: body?.longitude,
        userUniqueId,
      }, conn);

      return combinedData;
    },
    { timeout: 20000 },
  ).then(async (combinedData) => {
    // Notifications after successful transaction commit
    const {
      sendShipperNotification,
    } = require("../ShipperRequest/statusVerification.service");

    const journeyDecisionFromJoin = {
      journeyDecisionUniqueId: combinedData.journeyDecisionUniqueId,
      shipperRequestId: combinedData.shipperRequestId,
      driverRequestId: combinedData.driverRequestId,
      journeyStatusId: journeyStatusMap.journeyCompleted, // Use updated status, not combinedData.journeyStatusId
      decisionTime: combinedData.decisionTime,
      decisionBy: combinedData.decisionBy,
      shippingCostByDriver: combinedData.shippingCostByDriver,
      shippingDateByDriver: combinedData.shippingDateByDriver,
      deliveryDateByDriver: combinedData.deliveryDateByDriver,
    };

    // Filter combinedData into driverRequest formal structure
    const driverRequestData = {
      driverRequestUniqueId: combinedData.driverRequestUniqueId,
      userUniqueId: combinedData.userUniqueId,
      fullName: combinedData.fullName,
      phoneNumber: combinedData.phoneNumber,
    };

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
        data: "Journey completed successfully",
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
      message: "success",
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
      throw new AppError("journeyDecisionUniqueId is required", 400);
    }

    if (latitude === undefined || latitude === null) {
      throw new AppError("latitude is required", 400);
    }

    if (longitude === undefined || longitude === null) {
      throw new AppError("longitude is required", 400);
    }

    if (userUniqueId === undefined || userUniqueId === null) {
      throw new AppError("userUniqueId is required", 400);
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90) {
      throw new AppError("Invalid latitude. Must be between -90 and 90", 400);
    }

    if (longitude < -180 || longitude > 180) {
      throw new AppError(
        "Invalid longitude. Must be between -180 and 180",
        400,
      );
    }

    // Fetch journey decision to validate driver owns this journey
    const journeyDecision = await getJourneyDecisionByJourneyDecisionUniqueId(
      journeyDecisionUniqueId,
    );

    if (!journeyDecision?.data || journeyDecision.data.length === 0) {
      throw new AppError("Journey decision not found", 404);
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
        403,
      );
    }

    // Validate journey status - location updates should only be sent for active journeys
    const journeyStatusId = driverRequest[0].journeyStatusId;
    const activeStatuses = [
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByShipper,
      journeyStatusMap.journeyStarted,
    ];

    if (!activeStatuses.includes(journeyStatusId)) {
      throw new AppError(
        "Location updates can only be sent for active journeys (accepted or started)",
        400,
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
          404,
        );
      }

      shipperPhoneNumber = notificationData.shipperRequest?.phoneNumber || null;

      if (!shipperPhoneNumber) {
        throw new AppError("Shipper phone number not found", 404);
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
        400,
      );
    }

    // Note: createJourneyRoutePoint already sends WebSocket notification to shipper
    // with messageType: update_drivers_location_to_shipper
    // No need to send duplicate notification here

    return {
      message: "success",
      data: "Location updated and sent to shipper successfully",
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
      error.statusCode || 500,
    );
  }
};

module.exports = {
  startJourney,
  completeJourney,
  sendUpdatedLocation,
};
