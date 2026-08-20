"use strict";

const { createNewShipperRequest } = require("../../CRUD/Create/CreateData");
const { handleQueueDispatch } = require("../DriverQueue.service");
const batchService = require("../ShipperRequestBatch");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");

// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
const {
  handleWaitingRequest,
  verifyShipperStatus,
} = require("./statusVerification.service");

/**
 * Creates a new shipper request
 *
 * This function consolidates three creation scenarios:
 * 1. **Shipper self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for shipper) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=shipper, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (shipper/admin): Returns verifyShipperStatus result with status counts
 *   (Shipper/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Shipper's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=shipper, 2=driver, 3=admin)
 *   - shipperRequestBatchUniqueId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For shipper/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If shipper/admin scenario: Returns verifyShipperStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */

/**
 * Creates a new shipper request
 *
 * This function consolidates three creation scenarios:
 * 1. **Shipper self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for shipper) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=shipper, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (shipper/admin): Returns verifyShipperStatus result with status counts
 *   (Shipper/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Shipper's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=shipper, 2=driver, 3=admin)
 *   - shipperRequestBatchUniqueId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For shipper/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If shipper/admin scenario: Returns verifyShipperStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */
const createShipperRequest = async (body, journeyStatusId) => {
  try {
    const { shipperRequestCreatedByRoleId } = body;

    // Admin user creation is handled in controller before calling this function
    // userUniqueId must be set by the caller (controller handles admin case)
    const userUniqueId = body?.userUniqueId;
    if (!userUniqueId) {
      throw new AppError("userUniqueId is required", AppError.BAD_REQUEST);
    }
    const numberOfVehicles = body?.numberOfVehicles || 1;
    // First check if the user has an active request based on shipperRequestBatchUniqueId
    const shipperRequestBatchUniqueId = body?.shipperRequestBatchUniqueId;
    if (!shipperRequestBatchUniqueId) {
      throw new AppError("Batch uniqueId Can't be null", AppError.BAD_REQUEST);
    }

    // Use context-aware executor for raw query with locking
    const executor = transactionStorage.getStore() || pool;
    const batchCheckSql = `SELECT * FROM ShipperRequest WHERE shipperRequestBatchUniqueId = ? AND userUniqueId = ? FOR UPDATE`;
    const [dataByBatchId] = await executor.query(batchCheckSql, [
      shipperRequestBatchUniqueId,
      userUniqueId,
    ]);
    if (dataByBatchId?.length >= numberOfVehicles) {
      // User has already created all required requests for this batch
      throw new AppError(
        `All required requests have already been created for this batch.`,
        AppError.BAD_REQUEST,
      );
    }

    // A batch unique ID must stay "one for all": it is bound to ONE shipper and
    // ONE requestMode. The batch header is the single source of truth for this.
    // company_target batches defer individual ShipperRequest rows until a bid is
    // accepted, so the row-count check above alone cannot catch a second create
    // call that reuses the batch ID with a different mode (e.g. company_target
    // header followed by an individual_target create would silently mint rows
    // under the company_target batch). Reject any reuse that mismatches the
    // existing header.
    const [batchHeaderRows] = await executor.query(
      `SELECT shipperUserUniqueId, requestMode
         FROM ShipperRequestBatch
        WHERE batchUniqueId = ? LIMIT 1`,
      [shipperRequestBatchUniqueId],
    );
    if (batchHeaderRows.length > 0) {
      const header = batchHeaderRows[0];
      const incomingMode = body.requestMode || "individual_target";
      if (
        header.shipperUserUniqueId !== userUniqueId ||
        (header.requestMode && header.requestMode !== incomingMode)
      ) {
        throw new AppError(
          `shipperRequestBatchUniqueId is already in use and cannot be reused with a different shipper or request mode.`,
          AppError.BAD_REQUEST,
        );
      }
    }
    const newRequests = [];
    const noOfRecords = numberOfVehicles - dataByBatchId?.length;

    // Step 1: Create all requests in parallel for better performance
    // Parallel execution is safe because:
    // - Each request generates a unique UUID (shipperRequestUniqueId) - no conflicts
    // - Database auto-increment IDs (shipperRequestId) - order doesn't matter
    // - No dependencies between requests - each is independent
    // - Batch limit check happens before creation, so we create exactly noOfRecords
    if (noOfRecords > 0) {
      // Step 1a: Create the batch header ONCE before spawning parallel requests.
      // If this runs inside Promise.all, every concurrent call does SELECT → sees nothing
      // → all try to INSERT the same batchUniqueId → duplicate key crash.
      await batchService.upsertBatch({
        batchUniqueId: shipperRequestBatchUniqueId,
        shipperUserUniqueId: userUniqueId,
        vehicleTypeUniqueId: body.vehicle?.vehicleTypeUniqueId,
        totalVehicles: body.numberOfVehicles || 1,
        requestMode: body.requestMode || "individual_target",
        targetCompanyUniqueId: body.targetCompanyUniqueId || null,
        originLatitude: body.originLocation?.latitude ?? null,
        originLongitude: body.originLocation?.longitude ?? null,
        originPlace: body.originLocation?.description || "",
        destinationLatitude: body.destination?.latitude ?? null,
        destinationLongitude: body.destination?.longitude ?? null,
        destinationPlace: body.destination?.description || "",
        shippableItemName: body.shippableItemName || null,
        shippableItemQtyInQuintal: body.shippableItemQtyInQuintal || null,
        shippingDate: body.shippingDate || null,
        deliveryDate: body.deliveryDate || null,
        shippingCost: body.shippingCost || null,
        isPodRequired: body.isPodRequired !== undefined ? body.isPodRequired : true,
        journeyStatusId,
      });

      // ── company_target mode: DEFER individual sr creation ──────────────────
      // For company_target requests, we only create the batch header now.
      // Individual ShipperRequest rows will be created lazily when the shipper
      // accepts a company bid (in updateBidStatus → accepted_by_shipper).
      //
      // Why?  1. Faster creation (1 insert vs N inserts)
      //       2. If deal fails → no orphaned sr rows to clean up
      //       3. No race conditions during bid acceptance
      const isCompanyTarget =
        (body.requestMode || "individual_target") === "company_target";
      if (isCompanyTarget) {
        logger.info(
          "company_target batch created (PR rows deferred to bid acceptance)",
          {
            shipperRequestBatchUniqueId,
            totalVehicles: body.numberOfVehicles || 1,
            userUniqueId,
          },
        );
        return await verifyShipperStatus({
          userUniqueId,
        });
      }

      // Step 1b: Now create individual ShipperRequest rows in parallel — safe because
      //          the batch header already exists and upsertBatch is no longer called inside.
      const promises = Array(noOfRecords)
        .fill()
        .map(() =>
          createNewShipperRequest(body, userUniqueId, journeyStatusId),
        );

      // Wait for all requests to be created in parallel
      const results = await Promise.all(promises);

      // Extract created requests from results
      results.forEach((result) => {
        if (result?.data?.[0]) {
          newRequests.push(result.data[0]);
        }
      });
    }

    // Step 2: Process driver finding in parallel for all waiting requests
    // Parallel execution is safe because:
    // - Each request operates on different shipperRequestId (no conflicts)
    // - Database operations (insert/update) are independent per shipper request
    // - Local arrays prevent race conditions on shared data structures
    // Note: Minor race condition on notifiedDrivers Set (check-then-add) may cause
    // duplicate notifications to the same driver, but this is acceptable and non-critical
    // Only individual requests get auto-matched to nearby drivers.
    // company_target requests go through company bid → dispatcher assignment flow.
    const waitingRequests = newRequests.filter(
      (req) =>
        req?.journeyStatusId === journeyStatusMap.waiting &&
        req?.requestMode !== "company_target",
    );

    /**
     * Queue-dispatch orders (body.queueOrganizationUniqueId set) are matched by
     * QUEUE POSITION (FIFO) — the front waiting driver of the order's vehicle type
     * is offered the order (see DriverQueue.service.handleQueueDispatch).
     * These are NOT matched by distance, so they skip the handleWaitingRequest pass below.
     */
    const queueRequests = waitingRequests.filter(
      (req) => req?.queueOrganizationUniqueId,
    );

    /**
     * Non-queue orders (no queueOrganizationUniqueId) — matched by GEOLOCATION/DISTANCE
     * via handleWaitingRequest (radius-based driver search).
     */
    const distanceRequests = waitingRequests.filter(
      (req) => !req?.queueOrganizationUniqueId,
    );

    // Step 2a: Auto-offer each queue order to the FRONT waiting driver of its type.
    // An empty queue leaves the order waiting (offered:false) — the QueueOrgAdmin
    // can still dispatch it manually, or the order retries on the next driver check-in.
    // Sequential (NOT Promise.all): the create flow already runs inside an outer
    // transaction, so parallel dispatch calls would share ONE connection and their
    // FOR UPDATE locks would not serialize each other — both orders could be offered
    // to the SAME front driver. Dispatching one at a time lets each offer advance the
    // queue (offered drivers are skipped) so a batch of N orders fills N distinct slots.
    if (queueRequests.length > 0) {
      for (const createdRequest of queueRequests) {
        await handleQueueDispatch({
          queueOrganizationUniqueId: createdRequest.queueOrganizationUniqueId,
          vehicleTypeUniqueId: createdRequest.vehicleTypeUniqueId,
          shipperRequestUniqueId: createdRequest.shipperRequestUniqueId,
          user: { userUniqueId },
        });
      }
    }

    // Step 2b: distance-based driver finding for non-queue orders.
    if (distanceRequests.length > 0) {
      // Shared Set for notification deduplication across parallel requests
      // Note: There's a small window where duplicate notifications could occur if
      // the same driver is found by multiple requests simultaneously, but this is rare
      // and non-critical (driver just gets notified twice, which is acceptable)
      const notifiedDrivers = new Set();

      // Process all waiting requests in parallel for better performance
      await Promise.all(
        distanceRequests.map(async (createdRequest) => {
          // Local arrays per request to avoid race conditions on shared arrays
          const localDriversData = [];
          const localDrivers = [];
          const localDecisions = [];
          await handleWaitingRequest({
            shipperRequest: createdRequest,
            shipperRequestId: createdRequest.shipperRequestId,
            totalRecords: null,
            // Not needed for create flow
            pageSize: null,
            page: null,
            driversData: localDriversData,
            drivers: localDrivers,
            decisions: localDecisions,
            notifiedDrivers,
            // Shared Set for deduplication (minor race condition acceptable)
            userUniqueId, // Pass userUniqueId for audit columns
          });
        }),
      );
    }
    if (shipperRequestCreatedByRoleId === usersRoles.driverRoleId) {
      return newRequests;
    }
    return await verifyShipperStatus({
      userUniqueId,
    });
  } catch (error) {
    logger.error("Error in createShipperRequest service", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userUniqueId: body?.userUniqueId,
      shipperRequestCreatedByRoleId: body?.shipperRequestCreatedByRoleId,
      shipperRequestBatchUniqueId: body?.shipperRequestBatchUniqueId,
      vehicleTypeUniqueId: body?.vehicle?.vehicleTypeUniqueId,
    });
    throw new AppError(
      error.message || "Unable to create request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Gets a shipper request by shipper request ID
 * @param {number} shipperRequestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response with request data
 */

module.exports = {
  createShipperRequest,
};
