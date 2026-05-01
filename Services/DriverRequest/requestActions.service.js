const {
  getData,
  performJoinSelect,
  getDriverRequestByRequestUniqueId,
  checkActiveDriverRequest,
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createDriverRequest } = require("../../CRUD/Create/CreateData");
const { getUserByUserUniqueId, createUser } = require("../User.service");
const {
  sendSocketIONotificationToPassenger,
  sendSocketIONotificationToAdmin,
  sendNotificationToDriver,
} = require("../../Utils/Notifications");
const { sendSms } = require("../../Utils/smsSender");
const { createJourneyRoutePoint } = require("../JourneyRoutePoints.service");
const {
  getTariffRateByVehicleTypeUniqueId,
} = require("../TariffRateForVehicleTypes.service");
const { createJourneyDecision } = require("../JourneyDecisions.service");
const { currentDate } = require("../../Utils/CurrentDate");
const { createJourney } = require("../Journey.service");
const {
  createCanceledJourney,
  getJourneyDataByContextType,
} = require("../CanceledJourneys.service");
const messageTypes = require("../../Utils/MessageTypes");
const {
  journeyStatusMap,
  CANCELED_JOURNEY_CONTEXTS,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("../JourneyStatus.service");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { fetchJourneyNotificationData } = require("./helpers");
const AppError = require("../../Utils/AppError");

/**
 * Allows driver to take goods from street and create a passenger request on behalf of passenger
 * This is used when drivers find passengers on the street and need to register the transport
 * @param {Object} body - Request body containing passenger and journey details
 * @param {Object} user - Driver user object from authentication
 * @returns {Promise<Object>} Response containing passenger, driver, journey, and decision data
 */
const takeFromStreet = async (body, user) => {
  try {
    // first verify if driver has active request
    const {
      verifyDriverJourneyStatus,
    } = require("./statusVerification.service");
    const driverStatus = await verifyDriverJourneyStatus({
      userUniqueId: user?.userUniqueId,
    });
    // console.log("@takeFromStreet driverStatus", driverStatus);

    // if driver has active request return the current status
    if (driverStatus) {
      const journeyStatusId = driverStatus?.driver?.driver?.journeyStatusId;
      // if driver accepted request return driverStatus
      if (journeyStatusId >= 3) {
        return driverStatus;
      } else if (journeyStatusId >= 1) {
        // if journeyStatusId is one or two, cancel current request
        const cancelResult = await cancelDriverRequest({
          ownerUserUniqueId: user.userUniqueId,
          user: user,
          roleId: user.roleId,
          cancellationReasonsTypeId: body.cancellationReasonsTypeId || 1, // Provide a default reason ID
        });

        // If cancellation failed, return the error
        if (cancelResult.message === "error") {
          throw new AppError(
            cancelResult.error || "Failed to cancel current request",
            400,
          );
        }

        // Wait a moment for the cancellation to process
        // await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // if there is no active request create new passenger and passenger request and link with driver request and create journey decision and journey

    const journeyStatusId = journeyStatusMap.journeyStarted;
    const userUniqueId = user?.userUniqueId;
    const randNumber = Math.floor(Math.random() * 100000000);
    const requestedFrom = "street";
    const phoneNumber = body?.phoneNumber;
    const data = {
      passengerRequestBatchId: body.passengerRequestBatchId,
      phoneNumber,
      requestedFrom,
      fullName: null,
      email: `fakeEmail_${randNumber}@passenger.com`,
      roleId: 1,
      statusId: 1,
      userRoleStatusDescription: "this is passenger",
    };
    const responseData = {
      passenger: null,
      driver: null,
      journey: null,
      decision: null,
    };

    // ✅ Wrap user creation + all database operations in transaction for full atomicity
    // User creation now happens INSIDE transaction (if needed)
    // This ensures user creation + passenger request + driver request + journey decision + journey + route points are all atomic
    // All operations must succeed together or all fail together (prevents orphaned records)
    let userPassenger,
      passengerRequest,
      driverRequest,
      journeyDecision,
      journeyServices,
      targetRequest;

    await executeInTransaction(
      async (connection) => {
        // Create passenger user INSIDE transaction (with connection for transaction support)
        // This ensures if request creation fails, user creation is rolled back (no orphaned users)
        userPassenger = await createUser({ ...body, ...data }, connection);

        if (userPassenger.message === "error") {
          throw new Error(
            userPassenger.error || "Unable to create user data to ship goods",
          );
        }

        const dataOfPassenger = userPassenger?.data;
        if (!dataOfPassenger?.userUniqueId) {
          throw new Error("Failed to get userUniqueId from created user");
        }

        // Create passenger request (with connection for transaction support)
        const { createPassengerRequest } = require("../PassengerRequest");
        passengerRequest = await createPassengerRequest(
          {
            ...body,
            userUniqueId: dataOfPassenger.userUniqueId, // Set passenger's userUniqueId after creating passenger user
            // shipperRequestCreatedBy and shipperRequestCreatedByRoleId are already in body from controller
          },
          journeyStatusId, // journeyStarted (5) - driver already picked up goods from street
          connection, // ✅ Pass connection for transaction support
        );

        // Validate passenger request creation
        // Service returns array when driver role (2), or error object on failure
        if (
          !passengerRequest ||
          (!Array.isArray(passengerRequest) &&
            passengerRequest.message === "error") ||
          (Array.isArray(passengerRequest) && passengerRequest.length === 0)
        ) {
          throw new Error(
            Array.isArray(passengerRequest)
              ? "Failed to create passenger request (empty array)"
              : passengerRequest?.error || "Failed to create passenger request",
          );
        }

        targetRequest = Array.isArray(passengerRequest)
          ? passengerRequest[0]
          : null;
        if (!targetRequest) {
          throw new Error("Failed to extract passenger request from result");
        }

        // Create driver request (with connection for transaction support)
        driverRequest = await createDriverRequest(
          body,
          userUniqueId,
          journeyStatusId,
          connection, // ✅ Pass connection for transaction support
        );

        // Validate driver request
        if (!driverRequest?.data?.[0]) {
          throw new Error("Failed to create driver request");
        }

        // Create journey decision (with connection for transaction support)
        const {
          shippingDate: shippingDateByDriver,
          deliveryDate: deliveryDateByDriver,
          shippingCost: shippingCostByDriver,
        } = body;
        const decisionData = {
          passengerRequestId: targetRequest.passengerRequestId,
          driverRequestId: driverRequest.data[0].driverRequestId,
          journeyStatusId,
          decisionTime: currentDate(),
          decisionBy: "driver",
          shippingDateByDriver,
          deliveryDateByDriver,
          shippingCostByDriver,
          journeyDecisionCreatedBy: userUniqueId,
        };

        journeyDecision = await createJourneyDecision(
          decisionData,
          connection, // ✅ Pass connection for transaction support
        );

        // Validate journey decision
        if (journeyDecision?.message === "error") {
          throw new Error(
            journeyDecision.error || "Failed to create journey decision",
          );
        }

        // Create journey (with connection for transaction support)
        const journeyDecisionUniqueId =
          journeyDecision.data[0].journeyDecisionUniqueId;
        const journeyData = {
          journeyDecisionUniqueId,
          startTime: currentDate(),
          endTime: currentDate(),
          fare: 0,
          journeyStatusId,
          journeyCreatedBy: userUniqueId,
        };

        journeyServices = await createJourney(
          journeyData,
          connection, // ✅ Pass connection for transaction support
        );

        // Validate journey
        if (!journeyServices?.data?.[0]) {
          throw new Error("Failed to create journey");
        }

        // Create journey route points (with connection for transaction support)
        const originLocation = body.originLocation;
        JourneyPoints = await createJourneyRoutePoint(
          {
            journeyDecisionUniqueId:
              journeyDecision.data[0].journeyDecisionUniqueId,
            latitude: originLocation.latitude,
            longitude: originLocation.longitude,
            userUniqueId: userUniqueId,
          },
          connection, // ✅ Pass connection for transaction support
        );

        // Store decision and journey in responseData for later use
        responseData.decision = journeyDecision.data[0];
        responseData.journey = journeyServices.data[0];
      },
      {
        timeout: 30000, // 30 seconds - enough for user creation + all database operations
        logging: true,
      },
    );

    // After transaction commits successfully, send SMS and fetch read-only data (outside transaction)
    // SMS is external service and shouldn't be part of transaction
    if (phoneNumber) {
      const driverName = user?.fullName || "Driver";
      const itemName = body?.shippableItemName || "your items";
      const welcomeMessage = `Hello! Your transport of ${itemName} with ${driverName} has been registered and started. Thank you for using our transport service. Have a safe journey!`;
      try {
        await sendSms(phoneNumber, null, welcomeMessage);
      } catch (smsError) {
        // Don't fail the request if SMS fails, just log the error
        logger.warn("Failed to send SMS in takeFromStreet", {
          phoneNumber,
          error: smsError.message,
        });
      }
    }

    // Fetch read-only data (outside transaction)
    // This follows the pattern: "Read BEFORE transaction, Write INSIDE transaction, Read AFTER transaction"
    // fetch vehicle joined with ownership and types for the driver
    const vehicleRows = await performJoinSelect({
      baseTable: "Vehicle",
      joins: [
        {
          table: "VehicleOwnership",
          on: "VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId",
        },
        {
          table: "VehicleTypes",
          on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
        },
      ],
      conditions: {
        "VehicleOwnership.userUniqueId": userUniqueId,
      },
      limit: 1,
    });
    const vehicleTypeUniqueId = vehicleRows?.[0]?.vehicleTypeUniqueId;
    const vehicleTariffRate =
      await getTariffRateByVehicleTypeUniqueId(vehicleTypeUniqueId);
    const driver = await getUserByUserUniqueId(userUniqueId);
    const driverData = {
      driver: { ...driver.data, ...driverRequest.data[0] },
      vehicle: vehicleRows?.[0],
      vehicleTariffRate: vehicleTariffRate.data[0],
    };
    responseData.passenger = {
      ...userPassenger?.dataOfPassenger,
      ...targetRequest,
    };
    responseData.driver = driverData;
    responseData.status = journeyStatusId;
    return responseData;
  } catch (error) {
    // Log error with context for debugging
    logger.error("Error in takeFromStreet", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userUniqueId: user?.userUniqueId,
      body: {
        phoneNumber: body?.phoneNumber,
        passengerRequestBatchId: body?.passengerRequestBatchId,
        shippableItemName: body?.shippableItemName,
      },
    });
    throw new AppError(
      error.message || "Unable to create request",
      error.statusCode || 500,
    );
  }
};

/**
 * Creates a new driver request and accepts an existing passenger request
 * This is used when a driver wants to accept a specific passenger request
 * @param {Object} body - Request body containing passengerRequestUniqueId and userUniqueId
 * @returns {Promise<Object>} Response containing driver status with passenger request
 */
const createAndAcceptNewRequest = async (body, connection = null) => {
  try {
    // return;
    const { passengerRequestUniqueId, userUniqueId } = body;
    // get passenger request data by passengerRequestUniqueId,
    const {
      getPassengerRequest4allOrSingleUser,
    } = require("../PassengerRequest");
    const passengerRequestResult = await getPassengerRequest4allOrSingleUser({
      data: {
        target: "all",
        filters: { passengerRequestUniqueId },
        page: 1,
        limit: 1,
      },
    });

    const passengerRequest =
      passengerRequestResult?.formattedData?.[0]?.passengerRequest || null;
    logger.debug("@passengerRequest", { passengerRequest });
    const passengerJourneyStatusId = passengerRequest?.journeyStatusId;
    const passengerRequestId = passengerRequest?.passengerRequestId;
    // check if the passenger request is already accepted by driver
    if (passengerJourneyStatusId > journeyStatusMap.acceptedByDriver) {
      throw new AppError("Passenger request already accepted by driver", 400);
    }
    if (!passengerJourneyStatusId) {
      throw new AppError("Passenger request not found", 404);
    }
    // validate if the request exists
    if (passengerRequest?.message === "error") {
      throw new AppError(
        passengerRequest.error || "Passenger request error",
        400,
      );
    }
    // verify if there was any shipper-driver relation/decision before
    // Only match ACTIVE decisions (statuses 1-5) — ignore completed, cancelled, etc.
    const { pool } = require("../../Middleware/Database.config");
    const sql = `SELECT * FROM JourneyDecisions, PassengerRequest, DriverRequest 
    WHERE PassengerRequest.passengerRequestId=? 
    AND JourneyDecisions.passengerRequestId=PassengerRequest.passengerRequestId 
    AND JourneyDecisions.driverRequestId=DriverRequest.driverRequestId 
    AND DriverRequest.userUniqueId=?
    AND JourneyDecisions.journeyStatusId IN (${activeJourneyStatuses.join(", ")})`;

    const sqlValues = [passengerRequestId, userUniqueId];
    const executor = connection || pool;
    const [journeyDecisions] = await executor.query(sql, sqlValues);

    // if linkage exists, handle existing data
    if (journeyDecisions.length > 0) {
      // 1)update journeyDecision status to accepted by driver
      const journeyDecision = journeyDecisions?.[0];
      const journeyDecisionUniqueId = journeyDecision?.journeyDecisionUniqueId;
      const driverRequestId = journeyDecision?.driverRequestId;

      // Wrap all updates in a transaction to ensure atomicity
      await executeInTransaction(
        async (connection) => {
          // Update JourneyDecisions
          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
              shippingCostByDriver: body.shippingCostByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // Update PassengerRequest
          await updateData({
            tableName: "PassengerRequest",
            conditions: { passengerRequestUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // Update DriverRequest
          await updateData({
            tableName: "DriverRequest",
            conditions: { driverRequestId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });
        },
        {
          timeout: 10000, // 10 second timeout for driver acceptance
          logging: true,
        },
      );
    }
    // if linkage doesn't exist, create new linkage
    else {
      // Wrap all operations in a transaction to ensure atomicity
      await executeInTransaction(
        async (connection) => {
          // Check for existing active driver request using transaction connection
          const sqlToCheckActiveRequest = `
            SELECT * FROM DriverRequest 
            WHERE userUniqueId = ? 
            AND journeyStatusId IN (${activeJourneyStatuses.join(", ")})
            LIMIT 1
          `;
          const [existingActiveRequests] = await connection.query(
            sqlToCheckActiveRequest,
            [userUniqueId],
          );

          // If active request exists, handle based on status
          if (existingActiveRequests?.length > 0) {
            const activeRequest = existingActiveRequests[0];
            const activeRequestStatus = activeRequest.journeyStatusId;

            // If status > 2 (ongoing journey), return error - cannot cancel
            if (activeRequestStatus >= journeyStatusMap.acceptedByDriver) {
              throw new Error(
                "Cannot create new request. You have an ongoing journey. Please complete or cancel it first.",
              );
            }

            // If status is 1 (waiting) or 2 (acceptedByDriver), cancel it
            if (
              activeRequestStatus === journeyStatusMap.waiting ||
              activeRequestStatus === journeyStatusMap.requested
            ) {
              // Cancel the existing request
              await updateData({
                tableName: "DriverRequest",
                conditions: { driverRequestId: activeRequestId },
                updateValues: {
                  journeyStatusId: journeyStatusMap.cancelledByDriver,
                },
                connection,
              });
            }
          }

          // Create new driver request within transaction
          const newDriverRequest = await createDriverRequest(
            body,
            userUniqueId,
            journeyStatusMap.acceptedByDriver,
            connection, // Pass connection for transaction support
          );

          // validate if the insert was successful or not
          if (newDriverRequest?.message === "error") {
            throw new Error(
              newDriverRequest?.error || "Failed to create driver request",
            );
          }

          const driverRequestData = newDriverRequest?.data?.[0];
          const driverRequestId = driverRequestData?.driverRequestId;

          if (!driverRequestId) {
            throw new Error("Failed to get driver request ID");
          }

          // Create journey decision within transaction
          const journeyDecisionData = {
            passengerRequestId: passengerRequestId, // Use the variable extracted earlier
            driverRequestId,
            journeyStatusId: journeyStatusMap?.acceptedByDriver,
            decisionTime: currentDate(),
            decisionBy: "driver",
            shippingCostByDriver: body?.shippingCostByDriver,
            journeyDecisionCreatedBy: userUniqueId,
          };

          const newJourneyDecision = await createJourneyDecision(
            journeyDecisionData,
            connection, // Pass connection for transaction support
          );

          // validate if the insert was successful or not
          if (newJourneyDecision?.message === "error") {
            throw new Error(
              newJourneyDecision?.data || "Failed to create journey decision",
            );
          }

          // Update passenger request status to accepted by driver within transaction
          const updatedPassengerRequest = await updateData({
            tableName: "PassengerRequest",
            conditions: { passengerRequestUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.acceptedByDriver,
            },
            connection, // Pass connection for transaction support
          });

          // validate if the update was successful
          if (updatedPassengerRequest.affectedRows === 0) {
            throw new Error("Passenger request not found or update failed");
          }
        },
        {
          timeout: 15000, // 15 second timeout for creating new linkage
          logging: true,
        },
      );
    }

    const {
      verifyDriverJourneyStatus,
    } = require("./statusVerification.service");
    return await verifyDriverJourneyStatus({
      userUniqueId,
    });
  } catch (error) {
    logger.error("Unable to create and accept request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to create and accept request",
      error.statusCode || 500,
    );
  }
};

/**
 * Accepts a passenger request that was previously matched to the driver
 * This is used when a driver accepts a request that was already linked via JourneyDecisions
 * @param {Object} body - Request body containing passengerRequestUniqueId, journeyDecisionUniqueId, driverRequestUniqueId, and userUniqueId
 * @returns {Promise<Object>} Response containing driver status with accepted passenger request
 */
const acceptPassengerRequest = async (body) => {
  try {
    const {
      passengerRequestUniqueId,
      journeyDecisionUniqueId,
      driverRequestUniqueId,
      userUniqueId,
      shippingCostByDriver,
    } = body;

    // Validate that the userUniqueId from token is provided
    if (!userUniqueId) {
      throw new AppError("User authentication required", 401);
    }
    if (!shippingCostByDriver) {
      throw new AppError("Shipping cost by driver is required", 400);
    }
    if (!journeyDecisionUniqueId) {
      throw new AppError("Journey decision unique id is required", 400);
    }
    if (!driverRequestUniqueId) {
      throw new AppError("Driver request unique id is required", 400);
    }
    if (!passengerRequestUniqueId) {
      throw new AppError("Passenger request unique id is required", 400);
    }
    if (shippingCostByDriver <= 0) {
      throw new AppError("Shipping cost by driver must be greater than 0", 400);
    }
    // check if the driver request is already exists
    // Include Users join to get userUniqueId for validation
    const existingRequest = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "JourneyDecisions",
          on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        },
        {
          table: "PassengerRequest",
          on: "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
        },
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        "DriverRequest.driverRequestUniqueId": driverRequestUniqueId,
      },
    });

    // if the request is not found, return error
    if (!existingRequest?.length) {
      throw new AppError("Request not found", 404);
    }

    const requestData = existingRequest[0];

    // Validate that the userUniqueId from token matches the driver who owns this request
    if (requestData.userUniqueId !== userUniqueId) {
      throw new AppError("Driver user does not match driver request", 403);
    }

    // if the request is found, check if the request is valid to accept
    // Validate that all unique IDs match to ensure request integrity
    if (
      requestData.journeyDecisionUniqueId !== journeyDecisionUniqueId ||
      requestData.passengerRequestUniqueId !== passengerRequestUniqueId ||
      requestData.driverRequestUniqueId !== driverRequestUniqueId
    ) {
      throw new AppError("Request found is not valid to accept", 400);
    }

    // Validate current status allows accepting
    // Driver can only accept when JourneyDecisions status is 2 (requested)
    // If status is already 3 (acceptedByDriver) or higher, driver has already accepted or passenger has accepted
    // Fetch JourneyDecisions status explicitly to avoid ambiguity from join result
    const journeyDecisionStatus = await getData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      limit: 1,
    });

    const currentStatusId = journeyDecisionStatus?.[0]?.journeyStatusId;
    if (currentStatusId !== journeyStatusMap.requested) {
      throw new AppError(
        "This request cannot be accepted at this time. The request may have already been processed or is no longer available for acceptance.",
        400,
      );
    }

    await updateJourneyStatus(body);

    // Send notification directly to passenger without processing all requests
    // This is more efficient - only processes the ONE request that changed
    // Import here to avoid circular dependency
    const {
      sendPassengerNotification,
    } = require("../PassengerRequest/statusVerification.service");

    // Fetch all journey notification data using helper function
    // Pass existingRequest[0] (requestData) as driverRequest to avoid re-fetching (already fetched from join query)
    const {
      passengerRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
    } = await fetchJourneyNotificationData(
      journeyDecisionUniqueId,
      [requestData], // Pass already-fetched driver request data from join query (includes Users join)
    );

    // Add error handling if helper returns error
    if (!passengerRequest || !journeyDecisionData || !driverInfo) {
      throw new AppError("Unable to fetch journey data", 404);
    }

    // Send notification directly - no need to process all passenger requests
    await sendPassengerNotification({
      passengerRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
      messageType: messageTypes.driver_accepted_shipper_request,
      status: journeyStatusMap.acceptedByDriver,
    });

    // Send FCM notification
    if (passengerRequest?.userUniqueId) {
      sendFCMNotificationToUser({
        userUniqueId: passengerRequest.userUniqueId,
        roleId: 1,
        notification: {
          title: messageTypes.driver_accepted_shipper_request.message,
          body: messageTypes.driver_accepted_shipper_request.details,
        },
      });
    }

    // Build response structure matching verifyDriverJourneyStatus/handleExistingJourney format
    // Use data we already have instead of calling verifyDriverJourneyStatus
    const uniqueIds = {
      driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
      passengerRequestUniqueId: passengerRequest?.passengerRequestUniqueId,
      journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
      journeyUniqueId: journeyData?.journeyUniqueId || null,
    };

    const response = {
      message: "success",
      status: journeyStatusMap.acceptedByDriver,
      uniqueIds,
      driver: {
        driver: driverInfo?.driver || null,
        vehicle: driverInfo?.vehicleOfDriver || null,
      },
      passenger: passengerRequest || null,
      journey: journeyData || null,
      decision: journeyDecisionData || null,
    };

    return response;
  } catch (error) {
    console.error("Error accepting passenger request:", {
      error: error.message,
    });
    throw new AppError(
      error.message || "Unable to accept passenger request",
      error.statusCode || 500,
    );
  }
};

/**
 * Handles the case when a driver doesn't answer a passenger request
 * Updates existing passenger request status based on number of active drivers
 * - If only 1 active driver: Updates passenger status to waiting (1), updates driver and decision to noAnswerFromDriver (13)
 * - If multiple active drivers: Leaves passenger status unchanged, updates driver and decision to noAnswerFromDriver (13)
 * @param {Object} body - Request body containing passengerRequestUniqueId and driverRequestUniqueId
 * @returns {Promise<Object>} Response containing status and message type
 */
const noAnswerFromDriver = async (body) => {
  const passengerRequestUniqueId = body.passengerRequestUniqueId;
  const {
    getPassengerRequest4allOrSingleUser,
  } = require("../PassengerRequest");
  const passengerRequestResult = await getPassengerRequest4allOrSingleUser({
    data: {
      target: "all",
      filters: { passengerRequestUniqueId },
      page: 1,
      limit: 1,
    },
  });
  const passengerRequestFormatted =
    passengerRequestResult?.formattedData?.[0] || null;
  const driverRequestUniqueId = body.driverRequestUniqueId;
  const driverRequest = await getDriverRequestByRequestUniqueId(
    driverRequestUniqueId,
  );

  // Extract passenger request data from formatted structure
  // formattedData[0] has structure: {passengerRequest: {...}, driverRequests: [...], decisions: [...], journey: {...}}
  const passengerData =
    passengerRequestFormatted?.passengerRequest ||
    passengerRequestFormatted?.data ||
    null;
  const driverData =
    driverRequest?.data?.[0] || driverRequest?.data || driverRequest[0] || null;

  // Validate passenger data exists
  if (!passengerData) {
    throw new AppError("Passenger request not found", 404);
  }

  // Validate driver data exists
  if (!driverData) {
    throw new AppError("Driver request not found", 404);
  }

  // Check if driver already responded (status > 2 and < 5 means acceptedByDriver or acceptedByPassenger)
  if (passengerData.journeyStatusId > 2 && passengerData.journeyStatusId < 5) {
    return {
      message: "success",
      data: messageTypes.driver_answered_calls,
    };
  }

  // Fetch all necessary data BEFORE transaction (read operations)
  // Get driverRequestId from driverData
  const passengerRequestId = passengerData?.passengerRequestId;

  // Determine if passenger should be updated to waiting
  // This will be set within the transaction based on active driver count
  let shouldUpdatePassengerToWaiting = false;

  // Wrap status updates in a single transaction to ensure atomicity
  // All operations must succeed or all must fail to maintain data consistency
  await executeInTransaction(
    async (connection) => {
      // 1. Count active JourneyDecisions for this passenger request (status IN 2, 3, 4)
      // This ensures we count accurately even if other transactions are modifying data
      // We check BEFORE updating to know if this is the only active driver
      let journeyDecisionCount = 0;
      if (passengerRequestUniqueId) {
        // Count journey decisions for this passenger request using transaction connection
        // This ensures we see a consistent snapshot within the transaction
        // Count only active JourneyDecisions (status IN 2, 3, 4): requested, acceptedByDriver, acceptedByPassenger
        // If count === 1, this is the only active driver, so passenger goes back to waiting
        // If count > 1, multiple drivers are active, so passenger status stays unchanged
        const countSql = `
          SELECT COUNT(*) as count 
          FROM JourneyDecisions 
          INNER JOIN PassengerRequest ON JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId 
          WHERE PassengerRequest.passengerRequestUniqueId = ?
            AND JourneyDecisions.journeyStatusId IN (?, ?, ?)
        `;
        const [countResult] = await connection.query(countSql, [
          passengerRequestUniqueId,
          journeyStatusMap.requested, // 2
          journeyStatusMap.acceptedByDriver, // 3
          journeyStatusMap.acceptedByPassenger, // 4
        ]);
        journeyDecisionCount = countResult[0]?.count || 0;

        // Determine if passenger status should be updated to waiting
        // Only update if this is the only active driver (only 1 JourneyDecision with status IN 2, 3, 4)
        // If passenger has multiple active drivers (count > 1), leave status unchanged
        // This logic: if only 1 active driver was matched, and they don't answer, passenger has no active drivers left
        shouldUpdatePassengerToWaiting = journeyDecisionCount === 1;
      }

      // 2. Update journey status to noAnswerFromDriver (within transaction)
      // This updates DriverRequest, JourneyDecisions, and Journey (if exists)
      await updateJourneyStatus({
        ...body,
        connection, // Pass connection for transaction support
      });

      // 3. Update PassengerRequest status (only if this is the only active driver)
      // If passenger has multiple active drivers, leave status unchanged
      if (passengerRequestId && shouldUpdatePassengerToWaiting) {
        // Update the PassengerRequest to reflect the no answer and set journeyStatusId to 1 (waiting)
        // This happens when this driver is the only active one, so passenger request returns to waiting state
        await updateData({
          tableName: "PassengerRequest",
          conditions: { passengerRequestId },
          updateValues: {
            journeyStatusId: journeyStatusMap.waiting,
          }, // Set journeyStatusId to 1 (return to waiting state)
          connection, // Pass connection for transaction support
        });
      }
    },
    {
      timeout: 15000, // 15 second timeout for no answer operations
      logging: true,
    },
  );

  // After successful transaction commit, handle notifications
  const driverPhoneNumber = driverData.phoneNumber;
  const passengerPhoneNumber = passengerData?.phoneNumber;

  // Determine final passenger status for response
  const finalPassengerStatus = shouldUpdatePassengerToWaiting
    ? journeyStatusMap.waiting
    : passengerData.journeyStatusId;

  const messageToPassenger = {
    messageType: messageTypes.request_other_driver,
    message: "success",
    passenger: {
      ...passengerData,
      journeyStatusId: finalPassengerStatus,
    },
    status: finalPassengerStatus,
  };

  const messageToDriver = {
    message: "success",
    passenger: null,
    driver: null,
    status: null,
    messageType: messageTypes.driver_not_answered,
  };

  // Send notifications after successful transaction commit
  sendNotificationToDriver({
    message: messageToDriver,
    phoneNumber: driverPhoneNumber,
  });
  sendSocketIONotificationToPassenger({
    message: messageToPassenger,
    phoneNumber: passengerPhoneNumber,
  });

  return {
    status: finalPassengerStatus,
    message: "success",
    data: messageTypes.driver_not_answered,
  };
};

/**
 * Cancels a driver request, updating related journey decisions and passenger requests
 * Handles both rejection (before acceptance) and cancellation (after acceptance)
 * @param {Object} data - Cancellation data containing ownerUserUniqueId, user, roleId, cancellationReasonsTypeId, and optional passengerUserUniqueId
 * @returns {Promise<Object>} Response containing cancellation status and related data
 */
const cancelDriverRequest = async (data) => {
  try {
    const user = data?.user;
    const roleId = data?.roleId;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId = data?.ownerUserUniqueId,
      passengerUserUniqueId = data?.passengerUserUniqueId;
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
     *   - Passenger doesn't need to be notified (no expectation was set)
     *
     * cancelledByDriver (9): Used when driver cancels AFTER accepting the request
     *   - Occurs at status 3+ (acceptedByDriver, acceptedByPassenger, journeyStarted, etc.)
     *   - JourneyDecision record exists (driver had accepted and provided bidding price)
     *   - Driver committed but then withdrew their commitment
     *   - Passenger should be notified (expectation was set and then broken)
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

    const passengerRequestId = journeyDecisions?.[0]?.passengerRequestId;
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

    // Fetch passenger details (read operation - before transaction)
    let passenger = null;
    let passengerRequestUniqueId = null;
    let shouldUpdatePassengerToWaiting = false;

    if (passengerRequestId) {
      passenger = await performJoinSelect({
        baseTable: "PassengerRequest",
        joins: [
          {
            table: "Users",
            on: "PassengerRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { passengerRequestId },
      });

      if (!passenger || passenger.length === 0 || !passenger[0]?.phoneNumber) {
        throw new AppError(
          "Unable to fetch passenger details or phone number",
          404,
        );
      }

      passengerRequestUniqueId = passenger?.[0].passengerRequestUniqueId;
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
        if (passengerRequestUniqueId && journeyDecisions?.length > 0) {
          // Count journey decisions for this passenger request using transaction connection
          // This ensures we see a consistent snapshot within the transaction
          // Count ALL journey decisions (including this one) to determine total drivers matched
          // If count === 1, this is the only driver ever matched, so passenger goes back to waiting
          // If count > 1, multiple drivers were matched, so passenger status stays unchanged
          // Count only ACTIVE decisions (statuses 1-5) to determine if any active drivers remain
          const countSql = `
            SELECT COUNT(*) as count 
            FROM JourneyDecisions 
            INNER JOIN PassengerRequest ON JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId 
            WHERE PassengerRequest.passengerRequestUniqueId = ?
              AND JourneyDecisions.journeyStatusId IN (${activeJourneyStatuses.join(", ")})
          `;
          const [countResult] = await connection.query(countSql, [
            passengerRequestUniqueId,
          ]);
          journeyDecisionCount = countResult[0]?.count || 0;

          // Determine if passenger status should be updated to waiting
          // Only update if this is the only driver (only 1 JourneyDecision exists for this passenger)
          // If passenger has multiple drivers (count > 1), leave status unchanged
          // This logic: if only 1 driver was ever matched, and we're cancelling it, passenger has no drivers left
          shouldUpdatePassengerToWaiting = journeyDecisionCount === 1;
        }

        // 3. Update JourneyDecisions if a decision record exists
        // Note: For rejectedByDriver (early rejection), there may not be a JourneyDecision record
        //       since the driver never accepted the request. This update only runs if one exists.
        if (journeyDecisions?.length > 0 && journeyDecisionUniqueId) {
          /**
           * Set isCancellationByDriverSeenByPassenger status:
           *
           * "no need to see it": For rejectedByDriver (15)
           *   - Driver rejected before accepting, so passenger never expected this driver
           *   - No notification needed since no commitment was made
           *   - Prevents unnecessary notifications in passenger's cancellation list
           *
           * "not seen by passenger yet": For cancelledByDriver (9)
           *   - Driver cancelled after accepting, breaking their commitment
           *   - Passenger should be notified via WebSocket (if online) or HTTP GET (if offline)
           *   - This status triggers notification in verifyPassengerStatus
           *   - Passenger can mark as seen via PUT /api/passengerRequest/markCancellationAsSeen
           */
          const cancellationSeenStatus =
            journeyStatusId === journeyStatusMap.rejectedByDriver
              ? "no need to see it"
              : "not seen by passenger yet";

          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId:
                userUniqueId === ownerUserUniqueId
                  ? journeyStatusId // Use the determined status (rejectedByDriver or cancelledByDriver)
                  : journeyStatusMap.cancelledByAdmin, // 10 for admin cancellation
              isCancellationByDriverSeenByPassenger: cancellationSeenStatus,
            },
            connection, // Pass connection for transaction support
          });
        }

        // 4. Update PassengerRequest status (only if this is the only driver)
        // If passenger has multiple drivers, leave status unchanged
        if (passengerRequestId && shouldUpdatePassengerToWaiting) {
          // Update the PassengerRequest to reflect the cancellation and set journeyStatusId to 1 (waiting)
          // This happens when this driver is the only one, so passenger request returns to waiting state
          await updateData({
            tableName: "PassengerRequest",
            conditions: { passengerRequestId },
            updateValues: {
              journeyStatusId: journeyStatusMap.waiting,
            }, // Set journeyStatusId to 1 (return to waiting state)
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
      passengerRequestId &&
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
        notificationData?.passengerRequest &&
        notificationData?.journeyDecision &&
        notificationData?.driverInfo
      ) {
        // Determine message type based on status
        const cancellationMessageType =
          finalStatus === journeyStatusMap.cancelledByAdmin
            ? messageTypes.admin_cancelled_request
            : messageTypes.driver_cancelled_request;

        const passengerRequest = notificationData.passengerRequest;

        // Send WebSocket notification with formattedData structure (after successful transaction)
        if (passengerRequest?.phoneNumber) {
          // Import here to avoid circular dependency
          const {
            sendPassengerNotification,
          } = require("../PassengerRequest/statusVerification.service");

          await sendPassengerNotification({
            passengerRequest,
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
          if (passengerRequest.userUniqueId) {
            sendFCMNotificationToUser({
              userUniqueId: passengerRequest.userUniqueId,
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
          passengerUserUniqueId,
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
      notificationData?.passengerRequest &&
      notificationData?.journeyDecision &&
      notificationData?.driverInfo
    ) {
      // Return structured response matching other functions
      const uniqueIds = {
        driverRequestUniqueId:
          notificationData.driverInfo?.driver?.driverRequestUniqueId,
        passengerRequestUniqueId:
          notificationData.passengerRequest?.passengerRequestUniqueId,
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
        passenger: notificationData.passengerRequest || null,
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

module.exports = {
  takeFromStreet,
  createAndAcceptNewRequest,
  acceptPassengerRequest,
  noAnswerFromDriver,
  cancelDriverRequest,
};
