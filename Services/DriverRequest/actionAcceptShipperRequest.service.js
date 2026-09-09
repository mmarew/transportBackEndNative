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
      throw new AppError(
        "Journey decision unique id is required",
        AppError.BAD_REQUEST,
      );
    }
    if (!driverRequestUniqueId) {
      throw new AppError(
        "Driver request unique id is required",
        AppError.BAD_REQUEST,
      );
    }
    if (!shipperRequestUniqueId) {
      throw new AppError(
        "Shipper request unique id is required",
        AppError.BAD_REQUEST,
      );
    }
    if (shippingCostByDriver !== undefined && shippingCostByDriver <= 0) {
      throw new AppError(
        "Shipping cost by driver must be greater than 0",
        AppError.BAD_REQUEST,
      );
    }
    // check if the driver request is already exists.
    // queueOrganizationUniqueId is BATCH-CANONICAL (see tableManage.service —
    // ShipperRequest.queueOrganizationUniqueId was dropped), so it is read off
    // ShipperRequestBatch via the batch join, never off ShipperRequest.*.
    // userUniqueId for owner validation comes from DriverRequest.* (same driver
    // that owns the request), so a separate Users join is unnecessary.
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
          table: "ShipperRequestBatch",
          on: "ShipperRequest.shipperRequestBatchUniqueId = ShipperRequestBatch.batchUniqueId",
        },
      ],
      conditions: {
        "DriverRequest.driverRequestUniqueId": driverRequestUniqueId,
      },
      selectColumns: `
        DriverRequest.*,
        JourneyDecisions.journeyDecisionUniqueId,
        ShipperRequest.shipperRequestId AS pr_shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.requestMode,
        ShipperRequest.isBiddingApproved,
        ShipperRequest.shipperRequestBatchUniqueId,
        ShipperRequest.shippingCost,
        ShipperRequestBatch.queueOrganizationUniqueId,
        ShipperRequestBatch.shippingCost AS batchShippingCost
      `,
    });

    // if the request is not found, return error
    if (!existingRequest?.length) {
      throw new AppError("Request not found", AppError.NOT_FOUND);
    }

    const requestData = existingRequest[0];

    // Queue-dispatch orders are FIXED PRICE — the price is set by the queue
    // organization at order creation, so no driver counter-bid is required.
    // Accepting is a DECISION transition only, never a Journey birth:
    //   • FIFO queue order → acceptedByShipper (4) — the queue has already
    //     selected the single front driver, so the driver accepting binds the
    //     order.
    //   • BID queue order → acceptedByDriver (3) — the driver agrees while the
    //     shipper still has to SELECT the winner (see ShipperRequest
    //     actionAccept.service: winner 4 / losers 17).
    // The Journey row is created only when the driver heads to the loading
    // place (goToLoadingPlace = 5) — see journeyManagement
    // transitionLoadingStage. Same standard as nearby/street matching.
    // queueOrganizationUniqueId is BATCH-CANONICAL (ShipperRequest no longer
    // has the column — tableManage.service migration), so it is read from the
    // ShipperRequestBatch join above, never off ShipperRequest.*.
    const isQueueOrder = Boolean(requestData.queueOrganizationUniqueId);
    // BID-BASE orders (isBiddingApproved=TRUE, PER-ORDER flag) are queue-org
    // orders too, but they are matched on the BIDDING BOARD — the offer is a
    // bare JourneyDecision (findNearbyDrivers + handleWaitingRequest), never a
    // linked DriverQueue entry like a FIFO offer. The accept gate below is
    // therefore FIFO-only; a bid offer's freshness is governed by the
    // decision-status check (status must still be 2 = requested; if the order
    // was reassigned, the release flow moves the decision past requested).
    const bidFlag = requestData.isBiddingApproved;
    const isBidOrder =
      bidFlag === true || bidFlag === 1 || bidFlag === "1";
    if (!isQueueOrder && !shippingCostByDriver) {
      throw new AppError(
        "Shipping cost by driver is required",
        AppError.BAD_REQUEST,
      );
    }
    const targetStatusId = isQueueOrder && !isBidOrder
      ? journeyStatusMap.acceptedByShipper
      : journeyStatusMap.acceptedByDriver;

    // Validate that the userUniqueId from token matches the driver who owns this request
    if (requestData.userUniqueId !== userUniqueId) {
      throw new AppError(
        "Driver user does not match driver request",
        AppError.FORBIDDEN,
      );
    }

    // if the request is found, check if the request is valid to accept
    // Validate that all unique IDs match to ensure request integrity
    if (
      requestData.journeyDecisionUniqueId !== journeyDecisionUniqueId ||
      requestData.shipperRequestUniqueId !== shipperRequestUniqueId ||
      requestData.driverRequestUniqueId !== driverRequestUniqueId
    ) {
      throw new AppError(
        "Request found is not valid to accept",
        AppError.BAD_REQUEST,
      );
    }

    // Block company_target requests — they must go through the company assignment flow
    if (requestData.requestMode === "company_target") {
      throw new AppError(
        "This is a company batch request. Use PATCH /api/company/assignments/:assignmentUniqueId/status with assignmentStatus: 'confirmed_by_driver' instead.",
        AppError.BAD_REQUEST,
      );
    }

    // QUEUE GATE (pre-journey): a FIFO queue order's offer must still be live
    // for THIS driver before the Journey is created. If the offer window already
    // expired (entry retained at no_answer/16) the FIRST (holding) driver may
    // still late-accept while nobody else has taken the order — that is
    // honoured here. If the order already moved to another driver (offer had
    // been reassigned) or the entry is gone, this throws 409 BEFORE
    // createJourney so no orphan Journey is ever produced.
    // Skipped for BID-BASE orders: their offer lives on the JourneyDecision
    // itself (no entry linkage), so the decision-status check below is the gate.
    if (isQueueOrder && !isBidOrder) {
      const { assertQueueOfferAcceptable } = require("../DriverQueue.service");
      await assertQueueOfferAcceptable({
        shipperRequestUniqueId,
        driverUserUniqueId: userUniqueId,
      });
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

        // Acceptance is a pure DECISION transition — no Journey is created
        // here. FIFO queue orders land on acceptedByShipper (4), BID queue
        // orders on acceptedByDriver (3); the Journey row is born only when the
        // driver heads to the loading place (goToLoadingPlace = 5) — see
        // journeyManagement transitionLoadingStage (which creates it on demand
        // and stamps the agreed fare).
        await updateJourneyStatus({
          ...body,
          journeyStatusId: targetStatusId,
        });
      },
      { timeout: 10000, logging: true },
    );

    // FIFO queue orders: driver accepted → the queue entry leaves the dispatch
    // line (marked agreed). BID orders are NOT finalised here — the entry stays
    // REQUESTED-linked until the shipper selects (winner marked agreed there,
    // losers released). See ShipperRequest/actionAccept.service.js.
    if (isQueueOrder && !isBidOrder) {
      const { markEntryAgreed } = require("../DriverQueue.service");
      await markEntryAgreed({ shipperRequestUniqueId, userUniqueId });
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
      messageType: isQueueOrder
        ? messageTypes.queue_order_assigned
        : messageTypes.driver_accepted_shipper_request,
      status: targetStatusId,
    });

    // Send FCM notification
    if (shipperRequest?.userUniqueId) {
      const notificationType = isQueueOrder
        ? messageTypes.queue_order_assigned
        : messageTypes.driver_accepted_shipper_request;
      sendFCMNotificationToUser({
        userUniqueId: shipperRequest.userUniqueId,
        roleId: 1,
        notification: {
          title: notificationType.message,
          body: notificationType.details,
        },
      });
    }

    // Build response structure matching verifyDriverJourneyStatus/handleExistingJourney format
    // Use data we already have instead of calling verifyDriverJourneyStatus
    const journeyResponse = journeyData || null;
    const uniqueIds = {
      driverRequestUniqueId: driverInfo?.driver?.driverRequestUniqueId,
      shipperRequestUniqueId: shipperRequest?.shipperRequestUniqueId,
      journeyDecisionUniqueId: journeyDecisionData?.journeyDecisionUniqueId,
      journeyUniqueId: journeyResponse?.journeyUniqueId || null,
    };

    const response = {
      message: "Shipper request accepted",
      status: targetStatusId,
      uniqueIds,
      driver: {
        driver: driverInfo?.driver || null,
        vehicle: driverInfo?.vehicleOfDriver || null,
      },
      shipper: shipperRequest || null,
      journey: journeyResponse,
      decision: journeyDecisionData || null,
    };

    // ── Phase 1: Auto-release conflicting offers ──────────────────────────
    // Driver accepted an individual request → release any pending company
    // assignments so the driver isn't double-booked.
    await releaseConflictingOffers(userUniqueId, "individual");

    // ── Phase 2: Not-selected release (FIFO queue orders) ──────────────────
    // A FIFO queue-order accept lands straight on acceptedByShipper (4) — the
    // shipper never runs the separate accept that normally marks the other
    // invited drivers as notSelectedInBid (17) (see ShipperRequest
    // actionAccept.service). Release those stale same-order invites now, or a
    // late accept of one would mint a second Journey on the same order.
    // BID orders are NOT finalised here: their losers are released by the
    // shipper's own selection step (actionAccept.service loops 2/3→17).
    if (isQueueOrder && !isBidOrder) {
      await releaseNotSelectedBidInvitees({
        shipperRequestUniqueId,
        excludeJourneyDecisionUniqueId: journeyDecisionUniqueId,
      });
    }

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

/**
 * releaseNotSelectedBidInvitees
 * ─────────────────────────────
 * FIFO queue orders invite one driver at a time. When the driver-side accept
 * (`acceptShipperRequest`) binds the order (acceptedByShipper), any OTHER open
 * invitation on the same order (e.g. a previously offered driver still at
 * requested, or a bid-driver offered in parallel) is stale by design — mark
 * those decisions (and their DriverRequests) as notSelectedInBid (17). BID
 * orders do NOT reach this path: their losers are released when the shipper
 * selects, by ShipperRequest/actionAccept.service.
 */
const releaseNotSelectedBidInvitees = async ({
  shipperRequestUniqueId,
  excludeJourneyDecisionUniqueId,
}) => {
  const { pool } = require("../../Middleware/Database.config");
  const [others] = await pool.query(
    `SELECT jd.journeyDecisionUniqueId, jd.driverRequestId, dr.driverRequestUniqueId
       FROM JourneyDecisions jd
       INNER JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
       INNER JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      WHERE sr.shipperRequestUniqueId = ?
        AND jd.journeyDecisionUniqueId <> ?
        AND jd.journeyStatusId IN (?, ?)`,
    [
      shipperRequestUniqueId,
      excludeJourneyDecisionUniqueId,
      journeyStatusMap.requested,
      journeyStatusMap.acceptedByDriver,
    ],
  );

  for (const other of others) {
    await updateJourneyStatus({
      journeyStatusId: journeyStatusMap.notSelectedInBid,
      journeyDecisionUniqueId: other.journeyDecisionUniqueId,
      driverRequestUniqueId: other.driverRequestUniqueId,
      shipperRequestUniqueId,
    });
  }
  if (others.length > 0) {
    logger.info("Released not-selected bid invitees", {
      shipperRequestUniqueId,
      excluded: excludeJourneyDecisionUniqueId,
      released: others.map((o) => o.journeyDecisionUniqueId),
    });
  }
};

module.exports = { acceptShipperRequest };