const { cancelDriverRequest } = require("./actionCancelDriverRequest.service");
const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { resolveBatchId } = require("./helpers");

const { createDriverRequest } = require("../../CRUD/Create/CreateData");
const { getUserByUserUniqueId, createUser } = require("../User.service");

const { sendSms } = require("../../Utils/smsSender");
const { createJourneyRoutePoint } = require("../JourneyRoutePoints.service");
const {
  getTariffRateByVehicleTypeUniqueId,
} = require("../TariffRateForVehicleTypes.service");
const { createJourneyDecision } = require("../JourneyDecisions.service");
const { currentDate } = require("../../Utils/CurrentDate");
const { createJourney } = require("../Journey");

const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../Utils/logger");

const AppError = require("../../Utils/AppError");

/**
 * Allows driver to take goods from street and create a shipper request on behalf of shipper
 * This is used when drivers find shippers on the street and need to register the transport
 * @param {Object} body - Request body containing shipper and journey details
 * @param {Object} user - Driver user object from authentication
 * @returns {Promise<Object>} Response containing shipper, driver, journey, and decision data
 */
const takeFromStreet = async (body, user) => {
  try {
    // first verify if driver has active request
    const { verifyDriverJourneyStatus } = require("./statusVerification");
    const driverStatus = await verifyDriverJourneyStatus({
      userUniqueId: user?.userUniqueId,
    });
    // console.log("@takeFromStreet driverStatus", driverStatus);

    // if driver has active request return the current status
    if (driverStatus) {
      const journeyStatusId = driverStatus?.driver?.driver?.journeyStatusId;
      // if driver accepted request return driverStatus
      if (journeyStatusId >= journeyStatusMap.acceptedByDriver) {
        return driverStatus;
      } else if (journeyStatusId >= journeyStatusMap.waiting) {
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
            AppError.BAD_REQUEST,
          );
        }

        // Wait a moment for the cancellation to process
        // await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // if there is no active request create new shipper and shipper request and link with driver request and create journey decision and journey

    const journeyStatusId = journeyStatusMap.journeyStarted;
    const userUniqueId = user?.userUniqueId;
    // Street pickups are single-request batches; if the driver app did not
    // supply a batch id, generate one so createShipperRequest can upsert it.
    if (!body?.shipperRequestBatchUniqueId) {
      body.shipperRequestBatchUniqueId = uuidv4();
    }
    const randNumber = Math.floor(Math.random() * 100000000);
    const requestedFrom = "street";
    const phoneNumber = body?.phoneNumber;
    const data = {
      shipperRequestBatchUniqueId: body.shipperRequestBatchUniqueId,
      phoneNumber,
      requestedFrom,
      fullName: null,
      email: `fakeEmail_${randNumber}@shipper.com`,
      roleId: 1,
      statusId: 1,
      userRoleStatusDescription: "this is shipper",
    };
    const responseData = {
      shipper: null,
      driver: null,
      journey: null,
      decision: null,
    };

    // ✅ Wrap user creation + all database operations in transaction for full atomicity
    // User creation now happens INSIDE transaction (if needed)
    // This ensures user creation + shipper request + driver request + journey decision + journey + route points are all atomic
    // All operations must succeed together or all fail together (prevents orphaned records)
    let userShipper,
      shipperRequest,
      driverRequest,
      journeyDecision,
      journeyServices,
      targetRequest;

    await executeInTransaction(
      async (connection) => {
        // Create shipper user INSIDE transaction (with connection for transaction support)
        // This ensures if request creation fails, user creation is rolled back (no orphaned users)
        userShipper = await createUser({ ...body, ...data }, connection);

        if (userShipper.message === "error") {
          throw new Error(
            userShipper.error || "Unable to create user data to ship goods",
          );
        }

        const dataOfShipper = userShipper?.data;
        if (!dataOfShipper?.userUniqueId) {
          throw new Error("Failed to get userUniqueId from created user");
        }

        // Create shipper request (with connection for transaction support)
        const { createShipperRequest } = require("../ShipperRequest");
        shipperRequest = await createShipperRequest(
          {
            ...body,
            userUniqueId: dataOfShipper.userUniqueId, // Set shipper's userUniqueId after creating shipper user
            // shipperRequestCreatedBy and shipperRequestCreatedByRoleId are already in body from controller
          },
          journeyStatusId, // journeyStarted (5) - driver already picked up goods from street
          connection, // ✅ Pass connection for transaction support
        );

        // Validate shipper request creation
        // Service returns array when driver role (2), or error object on failure
        if (
          !shipperRequest ||
          (!Array.isArray(shipperRequest) &&
            shipperRequest.message === "error") ||
          (Array.isArray(shipperRequest) && shipperRequest.length === 0)
        ) {
          throw new Error(
            Array.isArray(shipperRequest)
              ? "Failed to create shipper request (empty array)"
              : shipperRequest?.error || "Failed to create shipper request",
          );
        }

        targetRequest = Array.isArray(shipperRequest)
          ? shipperRequest[0]
          : null;
        if (!targetRequest) {
          throw new Error("Failed to extract shipper request from result");
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
          shipperRequestId: targetRequest.shipperRequestId,
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
          // The driver's actual start GPS (shipper may have placed a wrong pickup)
          journeyStartingLat:
            body?.currentLocation?.latitude ??
            body?.originLocation?.latitude ??
            null,
          journeyStartingLng:
            body?.currentLocation?.longitude ??
            body?.originLocation?.longitude ??
            null,
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
        await createJourneyRoutePoint(
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
    responseData.shipper = {
      ...userShipper?.dataOfShipper,
      ...targetRequest,
    };
    const batchId = await resolveBatchId(
      responseData.shipper?.shipperRequestBatchUniqueId,
      "takeFromStreet",
    );
    if (batchId !== null) {
      responseData.shipper.batchId = batchId;
    }
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
        shipperRequestBatchUniqueId: body?.shipperRequestBatchUniqueId,
        shippableItemName: body?.shippableItemName,
      },
    });
    throw new AppError(
      error.message || "Unable to create request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};
module.exports = { takeFromStreet };
