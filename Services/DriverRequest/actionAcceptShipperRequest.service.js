const { performJoinSelect } = require("../../CRUD/Read/ReadData");

const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("../JourneyStatus");

const logger = require("../../Utils/logger");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { fetchJourneyNotificationData } = require("./helpers");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const AppError = require("../../Utils/AppError");
const {
  releaseConflictingOffers,
} = require("./actionReleaseConflictingOffers.service");

/**
 * Accepts a shipper request that was previously matched to the driver
 * This is used when a driver accepts a request that was already linked via JourneyDecisions
 * @param {Object} body - Request body containing shipperRequestUniqueId, journeyDecisionUniqueId, driverRequestUniqueId, and userUniqueId
 * @returns {Promise<Object>} Response containing driver status with accepted shipper request
 */
const acceptShipperRequest = async (body) => {
  try {
    const {
      shipperRequestUniqueId,
      journeyDecisionUniqueId,
      driverRequestUniqueId,
      userUniqueId,
      shippingCostByDriver,
    } = body;

    // Validate that the userUniqueId from token is provided
    if (!userUniqueId) {
      throw new AppError("User authentication required", AppError.UNAUTHORIZED);
    }
    if (!journeyDecisionUniqueId) {
      throw new AppError("Journey decision unique id is required", AppError.BAD_REQUEST);
    }
    if (!driverRequestUniqueId) {
      throw new AppError("Driver request unique id is required", AppError.BAD_REQUEST);
    }
    if (!shipperRequestUniqueId) {
      throw new AppError("Shipper request unique id is required", AppError.BAD_REQUEST);
    }
    if (shippingCostByDriver !== undefined && shippingCostByDriver <= 0) {
      throw new AppError("Shipping cost by driver must be greater than 0", AppError.BAD_REQUEST);
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
          table: "ShipperRequest",
          on: "ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId",
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
      throw new AppError("Request not found", AppError.NOT_FOUND);
    }

    const requestData = existingRequest[0];

    // Queue-dispatch orders are FIXED PRICE — the price is set by the queue
    // organization at order creation, so no driver counter-bid is required.
    const isQueueOrder = Boolean(requestData.queueOrganizationUniqueId);
    if (!isQueueOrder && !shippingCostByDriver) {
      throw new AppError("Shipping cost by driver is required", AppError.BAD_REQUEST);
    }

    // Validate that the userUniqueId from token matches the driver who owns this request
    if (requestData.userUniqueId !== userUniqueId) {
      throw new AppError("Driver user does not match driver request", AppError.FORBIDDEN);
    }

    // if the request is found, check if the request is valid to accept
    // Validate that all unique IDs match to ensure request integrity
    if (
      requestData.journeyDecisionUniqueId !== journeyDecisionUniqueId ||
      requestData.shipperRequestUniqueId !== shipperRequestUniqueId ||
      requestData.driverRequestUniqueId !== driverRequestUniqueId
    ) {
      throw new AppError("Request found is not valid to accept", AppError.BAD_REQUEST);
    }

    // Block company_target requests — they must go through the company assignment flow
    if (requestData.requestMode === "company_target") {
      throw new AppError(
        "This is a company batch request. Use PATCH /api/company/assignments/:assignmentUniqueId/status with assignmentStatus: 'confirmed_by_driver' instead.",
        AppError.BAD_REQUEST,
      );
    }

    // Validate current status allows accepting
    // Driver can only accept when JourneyDecisions status is 2 (requested)
    // If status is already 3 (acceptedByDriver) or higher, driver has already accepted or shipper has accepted
    //
    // The status check + status write are wrapped in a transaction with a
    // FOR UPDATE lock on the JourneyDecisions row so two concurrent accepts
    // cannot both pass the `currentStatusId !== requested` check (check-then-act
    // race). The first accept's lock serialises the second until commit, and the
    // second then reads status 3 (acceptedByDriver) and is rejected.
    await executeInTransaction(
      async (connection) => {
        const [lockedDecision] = await connection.query(
          `SELECT journeyStatusId
             FROM JourneyDecisions
            WHERE journeyDecisionUniqueId = ?
            LIMIT 1
            FOR UPDATE`,
          [journeyDecisionUniqueId],
        );

        const currentStatusId = lockedDecision?.[0]?.journeyStatusId;
        if (currentStatusId !== journeyStatusMap.requested) {
          throw new AppError(
            "This request cannot be accepted at this time. The request may have already been processed or is no longer available for acceptance.",
            AppError.BAD_REQUEST,
          );
        }

        await updateJourneyStatus({
          ...body,
          // Queue orders are fixed price — record the queue org's price on the decision.
          ...(isQueueOrder && !body.shippingCostByDriver && requestData.shippingCost
            ? { shippingCostByDriver: requestData.shippingCost }
            : {}),
        });
      },
      { timeout: 10000, logging: true },
    );

    // Queue-dispatch orders: driver accepted → the queue entry leaves the
    // dispatch line (marked loaded).
    if (isQueueOrder) {
      const { markEntryLoaded } = require("../DriverQueue.service");
      await markEntryLoaded({ shipperRequestUniqueId, userUniqueId });
    }

    // Send notification directly to shipper without processing all requests
    // This is more efficient - only processes the ONE request that changed
    // Import here to avoid circular dependency
    const {
      sendShipperNotification,
    } = require("../ShipperRequest/statusVerification.service");

    // Fetch all journey notification data using helper function
    // Pass existingRequest[0] (requestData) as driverRequest to avoid re-fetching (already fetched from join query)
    const {
      shipperRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
    } = await fetchJourneyNotificationData(
      journeyDecisionUniqueId,
      [requestData], // Pass already-fetched driver request data from join query (includes Users join)
    );

    // Add error handling if helper returns error
    if (!shipperRequest || !journeyDecisionData || !driverInfo) {
      throw new AppError("Unable to fetch journey data", AppError.NOT_FOUND);
    }

    // Send notification directly - no need to process all shipper requests
    await sendShipperNotification({
      shipperRequest,
      journeyDecision: journeyDecisionData,
      driverInfo,
      journeyData,
      messageType: messageTypes.driver_accepted_shipper_request,
      status: journeyStatusMap.acceptedByDriver,
    });

    // Send FCM notification
    if (shipperRequest?.userUniqueId) {
      sendFCMNotificationToUser({
        userUniqueId: shipperRequest.userUniqueId,
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
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
      journeyUniqueId: journeyData?.journeyUniqueId || null,
    };

    const response = {
      message: "Shipper request accepted",
      status: journeyStatusMap.acceptedByDriver,
      uniqueIds,
      driver: {
        driver: driverInfo?.driver || null,
        vehicle: driverInfo?.vehicleOfDriver || null,
      },
      shipper: shipperRequest || null,
      journey: journeyData || null,
      decision: journeyDecisionData || null,
    };

    // ── Phase 1: Auto-release conflicting offers ──────────────────────────
    // Driver accepted an individual request → release any pending company
    // assignments so the driver isn't double-booked.
    await releaseConflictingOffers(userUniqueId, "individual");

    return response;
  } catch (error) {
    logger.error("Error accepting shipper request:", {
      error: error.message,
    });
    throw new AppError(
      error.message || "Unable to accept shipper request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};
module.exports = { acceptShipperRequest };
