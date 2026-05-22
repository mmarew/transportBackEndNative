"use strict";

const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const messageTypes = require("../Utils/MessageTypes");
const logger = require("../Utils/logger");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../Utils/Notifications");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const { getData } = require("../CRUD/Read/ReadData");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");

// ── Updatable columns (whitelist) ─────────────────────────────────────────────
// Only these fields may be changed via PATCH. The order does not matter.
const UPDATABLE_COLS = [
  "totalVehicles",
  "requestMode",
  "targetCompanyUniqueId",
  "vehicleTypeUniqueId",
  "originPlace",
  "destinationPlace",
  "shippableItemName",
  "shippableItemQtyInQuintal",
  "shippingDate",
  "deliveryDate",
  "shippingCost",
  "journeyStatusId",
];

// ── Cancellation reason guard ────────────────────────────────────────────────
/**
 * Validates that the supplied cancellationReasonsTypeId is appropriate for
 * a company/batch cancellation context.
 *
 * Rules:
 *   - If no ID is provided → nothing to check, pass through.
 *   - If the reason exists and its requestMode is 'individual' → reject.
 *     Individual reasons (e.g. "Driver arrived too late", "Found another driver
 *     on the street") are meaningless for a company freight batch.
 *   - requestMode 'company' or 'both' → allowed.
 *   - Reason not found in DB → reject with 404.
 *
 * @param {number|null|undefined} cancellationReasonsTypeId
 * @throws {AppError} 400 if the reason is individual-only, 404 if not found.
 */
const assertCompanyCancellationReason = async (cancellationReasonsTypeId) => {
  if (!cancellationReasonsTypeId) return; // optional field — nothing to validate

  const [rows] = await db().query(
    `SELECT cancellationReasonsTypeId, cancellationReason, requestMode
       FROM CancellationReasonsType
      WHERE cancellationReasonsTypeId = ?
        AND cancellationReasonTypeDeletedAt IS NULL
      LIMIT 1`,
    [cancellationReasonsTypeId],
  );

  if (!rows || rows.length === 0) {
    throw new AppError(
      `Cancellation reason ID ${cancellationReasonsTypeId} not found`,
      404,
    );
  }

  const reason = rows[0];
  if (reason.requestMode === "individual") {
    throw new AppError(
      `Cancellation reason "${reason.cancellationReason}" is only valid for individual requests, not company freight batches. ` +
      `Please choose a reason with requestMode 'company' or 'both'.`,
      400,
    );
  }
};

// ── CREATE / UPSERT ──────────────────────────────────────────────────────────

/**
 * ### Single Source of Truth — Create or sync a batch header
 *
 * Called by `createNewShipperRequest` every time a new individual request
 * is added to a batch.  Rules:
 *
 * - **First request in a batch** → INSERT the batch header row.
 * - **Subsequent requests in the same batch** → UPDATE only `totalVehicles`
 *   and `journeyStatusId` so the counter stays accurate.
 *
 * **Junior Note: Why not `ON DUPLICATE KEY UPDATE`?**
 * MySQL pre-increments `AUTO_INCREMENT` BEFORE checking for a duplicate key.
 * If a duplicate is found it rolls back the insert but keeps the incremented
 * counter, creating permanent gaps (e.g. 1, 5, 9…).  The SELECT-first pattern
 * below avoids this entirely: we only reach the INSERT branch when we are
 * certain the row does not yet exist.
 *
 * @param {Object} data - All batch metadata needed for the header row.
 */
exports.upsertBatch = async ({
  batchUniqueId,
  shipperUserUniqueId,
  vehicleTypeUniqueId,
  totalVehicles,
  requestMode,
  targetCompanyUniqueId,
  originLatitude,
  originLongitude,
  originPlace,
  destinationLatitude,
  destinationLongitude,
  destinationPlace,
  shippableItemName,
  shippableItemQtyInQuintal,
  shippingDate,
  deliveryDate,
  shippingCost,
  journeyStatusId,
}) => {
  // 1. Check existence first — avoids AUTO_INCREMENT wastage
  const [existing] = await db().query(
    `SELECT batchId FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
    [batchUniqueId],
  );

  if (existing.length === 0) {
    // First request in this batch → create the header row
    await db().query(
      `INSERT INTO ShipperRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, targetCompanyUniqueId,
         originLatitude, originLongitude, originPlace,
         destinationLatitude, destinationLongitude, destinationPlace,
         shippableItemName, shippableItemQtyInQuintal, shippingDate, deliveryDate,
         shippingCost, journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchUniqueId,
        shipperUserUniqueId,
        vehicleTypeUniqueId,
        totalVehicles,
        requestMode,
        targetCompanyUniqueId,
        originLatitude ?? null,
        originLongitude ?? null,
        originPlace,
        destinationLatitude ?? null,
        destinationLongitude ?? null,
        destinationPlace,
        shippableItemName,
        shippableItemQtyInQuintal,
        shippingDate,
        deliveryDate,
        shippingCost,
        journeyStatusId,
        currentDate(),
      ],
    );
  } else {
    // Subsequent request in same batch → sync mutable counters only
    await db().query(
      `UPDATE ShipperRequestBatch
         SET totalVehicles = ?, journeyStatusId = ?, batchUpdatedAt = ?
       WHERE batchUniqueId = ?`,
      [totalVehicles, journeyStatusId, currentDate(), batchUniqueId],
    );
  }
};

// ── GET with filters + pagination ─────────────────────────────────────────────

/**
 * ### List ShipperRequestBatches
 *
 * Supports any combination of optional filters. Only the filters actually
 * sent in `query` are added to the WHERE clause — everything else is ignored.
 *
 * **Junior Note: "Only filter what was sent"**
 * We build the WHERE clause dynamically using an array of clauses and a
 * parallel params array.  Each `if (filters.xxx)` block appends both the
 * SQL fragment AND its binding value, keeping them perfectly in sync.
 *
 * @param {Object} filters - Validated query-string values.
 * @returns {Promise<Object>} Paginated list with `data` and `pagination`.
 */
exports.getBatches = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);

  const clauses = [];
  const params = [];

  // Soft-delete guard — skip deleted batches unless caller explicitly asks
  if (!filters.includeDeleted) {
    clauses.push("b.batchDeletedAt IS NULL");
  }

  if (filters.batchUniqueId) {
    clauses.push("b.batchUniqueId = ?");
    params.push(filters.batchUniqueId);
  }
  if (filters.shipperUserUniqueId) {
    clauses.push("b.shipperUserUniqueId = ?");
    params.push(filters.shipperUserUniqueId);
  }
  if (filters.vehicleTypeUniqueId) {
    clauses.push("b.vehicleTypeUniqueId = ?");
    params.push(filters.vehicleTypeUniqueId);
  }
  if (filters.requestMode) {
    clauses.push("b.requestMode = ?");
    params.push(filters.requestMode);
  }
  if (filters.targetCompanyUniqueId) {
    clauses.push("b.targetCompanyUniqueId = ?");
    params.push(filters.targetCompanyUniqueId);
  }
  if (filters.journeyStatusId) {
    clauses.push("b.journeyStatusId = ?");
    params.push(filters.journeyStatusId);
  }
  if (filters.journeyStatusName) {
    clauses.push("js.journeyStatusName = ?");
    params.push(filters.journeyStatusName);
  }
  // Partial text match for location filters
  if (filters.originPlace) {
    clauses.push("b.originPlace LIKE ?");
    params.push(`%${filters.originPlace}%`);
  }
  if (filters.destinationPlace) {
    clauses.push("b.destinationPlace LIKE ?");
    params.push(`%${filters.destinationPlace}%`);
  }

  // Exact match / range filters for remaining batch columns
  if (filters.totalVehicles) {
    clauses.push("b.totalVehicles = ?");
    params.push(Number(filters.totalVehicles));
  }
  if (filters.shippableItemName) {
    clauses.push("b.shippableItemName LIKE ?");
    params.push(`%${filters.shippableItemName}%`);
  }

  // shippingDate range: ?shippingDateFrom=2026-01-01&shippingDateTo=2026-12-31
  if (filters.shippingDateFrom) {
    clauses.push("b.shippingDate >= ?");
    params.push(filters.shippingDateFrom);
  }
  if (filters.shippingDateTo) {
    clauses.push("b.shippingDate <= ?");
    params.push(filters.shippingDateTo);
  }

  // deliveryDate range: ?deliveryDateFrom=...&deliveryDateTo=...
  if (filters.deliveryDateFrom) {
    clauses.push("b.deliveryDate >= ?");
    params.push(filters.deliveryDateFrom);
  }
  if (filters.deliveryDateTo) {
    clauses.push("b.deliveryDate <= ?");
    params.push(filters.deliveryDateTo);
  }

  // shippingCost range: ?shippingCostMin=100&shippingCostMax=5000
  if (filters.shippingCostMin !== undefined) {
    clauses.push("b.shippingCost >= ?");
    params.push(Number(filters.shippingCostMin));
  }
  if (filters.shippingCostMax !== undefined) {
    clauses.push("b.shippingCost <= ?");
    params.push(Number(filters.shippingCostMax));
  }

  // batchCreatedAt range: ?createdFrom=2026-01-01&createdTo=2026-12-31
  if (filters.createdFrom) {
    clauses.push("b.batchCreatedAt >= ?");
    params.push(filters.createdFrom);
  }
  if (filters.createdTo) {
    clauses.push("b.batchCreatedAt <= ?");
    params.push(filters.createdTo);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const baseSql = `
    SELECT
      b.*,
      u.fullName        AS shipperName,
      u.phoneNumber     AS shipperPhone,
      vt.vehicleTypeName,
      js.journeyStatusName,
      tc.companyName    AS targetCompanyName
    FROM ShipperRequestBatch b
    LEFT JOIN Users          u  ON b.shipperUserUniqueId   = u.userUniqueId
    LEFT JOIN VehicleTypes   vt ON b.vehicleTypeUniqueId   = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus  js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
    ${where}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ShipperRequestBatch b
    LEFT JOIN JourneyStatus    js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
    ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY b.batchCreatedAt DESC`,
    countSql,
    params,
    page,
    limit,
    offset,
  );
};

// ── PATCH (partial update) ────────────────────────────────────────────────────

/**
 * ### Partial Update — "Update only what I give you"
 *
 * **Junior Note: Dynamic SET Clause**
 * Instead of a fixed `SET col1=?, col2=?, ...` that would overwrite every
 * field on every call, we build the SET clause from scratch using only the
 * keys present in `fields`.  The result:
 *   - Caller sends `{ shippingCost: 500 }`  → only `shippingCost` changes.
 *   - Caller sends `{ originPlace: "...", totalVehicles: 3 }` → only those two change.
 *   - Nothing else is touched.
 *
 * @param {string} batchUniqueId  - The batch to update (from URL params).
 * @param {Object} fields         - Validated body fields (at least 1 key).
 * @returns {Promise<Object>}
 */
exports.updateBatch = async (batchUniqueId, fields) => {
  // 1. Confirm it exists and is not deleted
  const batch = await findOne(
    "ShipperRequestBatch",
    { batchUniqueId },
    "Shipper request batch not found",
  );
  if (batch.batchDeletedAt) {
    throw new AppError("Batch has already been deleted", 400);
  }

  // 2. Build the SET clause from whitelisted keys only
  const setClauses = [];
  const setValues = [];

  for (const col of UPDATABLE_COLS) {
    if (Object.prototype.hasOwnProperty.call(fields, col)) {
      setClauses.push(`${col} = ?`);
      setValues.push(fields[col]);
    }
  }

  // Defensive guard (schema.min(1) should already prevent this)
  if (setClauses.length === 0) {
    throw new AppError("No valid fields supplied for update", 400);
  }

  // Always stamp the audit columns
  setClauses.push("batchUpdatedAt = ?");
  setValues.push(currentDate());

  // 3. Execute
  const [res] = await db().query(
    `UPDATE ShipperRequestBatch SET ${setClauses.join(", ")} WHERE batchUniqueId = ?`,
    [...setValues, batchUniqueId],
  );

  if (res.affectedRows === 0) {
    throw new AppError("Batch update failed", 500);
  }

  return { message: "success", data: { batchUniqueId, updated: fields } };
};

// ── Soft DELETE ───────────────────────────────────────────────────────────────

/**
 * Soft-delete a batch by stamping `batchDeletedAt`.
 *
 * @param {string} batchUniqueId
 * @returns {Promise<Object>}
 */
exports.deleteBatch = async (batchUniqueId) => {
  const [res] = await db().query(
    `UPDATE ShipperRequestBatch
     SET batchDeletedAt = ?
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL`,
    [currentDate(), batchUniqueId],
  );

  if (res.affectedRows === 0) {
    throw new AppError("Batch not found or already deleted", 404);
  }

  return { message: "success", data: "Batch deleted" };
};

// ── CANCEL (company batch) ────────────────────────────────────────────────────────

/**
 * ### Atomically cancel an entire company-targeted freight batch.
 *
 * **What is updated in one DB transaction:**
 *
 * | Table                          | What changes                                                  |
 * |-------------------------------|---------------------------------------------------------------|
 * | ShipperRequestBatch          | journeyStatusId → 7 (cancelledByShipper) or 10 (Admin)      |
 * | ShipperRequest               | All rows in this batch → same cancelled status                |
 * | JourneyDecisions               | All open decisions for those requests → same cancelled status |
 * | DriverRequest                  | Matched drivers released back to waiting (status 1)           |
 * | CompanyBidRequest              | All submitted bids → 'expired'                                |
 * | CompanyBidVehicleAssignment    | All assignments → 'cancelled'                                 |
 *
 * **Why this approach?**
 * Sending N individual HTTP cancel calls from the client is wasteful and risks
 * partial failure.  One atomic transaction guarantees either everything cancels
 * or nothing does.
 *
 * **Junior Note — terminal statuses guard:**
 * `journeyStatusId NOT IN (7,9,10,12)` prevents re-cancelling rows that are
 * already in a terminal state (e.g. a driver independently cancelled their side).
 *
 * @param {string} batchUniqueId            - UUID of the batch to cancel.
 * @param {string} userUniqueId             - Authenticated user's UUID.
 * @param {number} roleId                   - Authenticated user's role ID.
 * @param {number|null} cancellationReasonsTypeId - Optional reason FK.
 */
exports.cancelBatch = async ({
  batchUniqueId,
  userUniqueId,
  roleId,
  cancellationReasonsTypeId,
}) => {
  if (!batchUniqueId || !userUniqueId) {
    throw new AppError("batchUniqueId and userUniqueId are required", 400);
  }

  // 1a. Validate cancellation reason is appropriate for company context
  await assertCompanyCancellationReason(cancellationReasonsTypeId);

  // 1b. Verify batch exists + ownership
  const batch = await findOne(
    "ShipperRequestBatch",
    { batchUniqueId },
    "Batch not found",
  );

  const isAdmin = roleId === 3 || roleId === 6; // admin / super-admin

  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }

  const terminalStatuses = [
    journeyStatusMap.cancelledByShipper, // 7
    journeyStatusMap.cancelledByDriver, // 9
    journeyStatusMap.cancelledByAdmin, // 10
    journeyStatusMap.cancelledBySystem, // 12
  ].filter(Boolean); // remove undefined if any key is missing

  if (terminalStatuses.includes(batch.journeyStatusId)) {
    throw new AppError("Batch is already cancelled", 400);
  }

  const cancelStatusId = isAdmin
    ? journeyStatusMap.cancelledByAdmin // 10
    : journeyStatusMap.cancelledByShipper; // 7

  const now = currentDate();

  // ── PLAN B: Smart auto-filter ─────────────────────────────────────────────
  // Slots in these statuses are LOCKED — they cannot be cancelled:
  //   5 = journeyStarted  (driver is actively on the road)
  //   6 = journeyCompleted (already delivered)
  //   + the terminal cancel statuses (already cancelled by anyone)
  const lockedStatuses = [
    journeyStatusMap.journeyStarted,     // 5
    journeyStatusMap.journeyCompleted,   // 6
    ...terminalStatuses,                 // 7, 9, 10, 12
  ].filter(Boolean);

  const lockedClause = lockedStatuses.join(","); // e.g. "5,6,7,9,10,12"

  // Count all slots, locked slots, and cancellable slots in one query
  const [[slotSummary]] = await db().query(
    `SELECT
       COUNT(*)                                                          AS totalSlots,
       SUM(journeyStatusId IN (${lockedClause}))                        AS lockedSlots,
       SUM(journeyStatusId NOT IN (${lockedClause}))                    AS cancellableSlots,
       SUM(journeyStatusId IN (?,?))                                    AS inProgressSlots
     FROM ShipperRequest
     WHERE shipperRequestBatchId = ?
       AND shipperRequestDeletedAt IS NULL`,
    [
      journeyStatusMap.journeyStarted,   // 5
      journeyStatusMap.journeyCompleted, // 6
      batchUniqueId,
    ],
  );

  const cancellableSlots = Number(slotSummary.cancellableSlots) || 0;
  const lockedSlots = Number(slotSummary.lockedSlots) || 0;
  const inProgressSlots = Number(slotSummary.inProgressSlots) || 0;

  // If every slot is locked — nothing to cancel, reject cleanly
  if (cancellableSlots === 0) {
    throw new AppError(
      `Cannot fully cancel this batch — all ${lockedSlots} slot(s) are either ` +
      `in transit (journeyStarted) or already completed/cancelled. ` +
      `No cancellable slots remain.`,
      400,
    );
  }

  // Determine the final batch-level status:
  //   - Any locked slots exist → batch becomes partiallyCancelled (17)
  //     because those slots remain alive (started/completed)
  //   - All slots are cancellable → batch becomes fully cancelled
  const finalBatchStatus =
    lockedSlots > 0
      ? journeyStatusMap.partiallyCancelled // 17
      : cancelStatusId;

  // ── Steps 2–7: All UPDATEs run in parallel inside the transaction.
  //    Every ShipperRequest UPDATE now skips locked slots (started/completed).
  //    If ANY query rejects → executeInTransaction rolls back automatically.
  await Promise.all([
    // 2. Update the batch header with the correct final status
    db().query(
      `UPDATE ShipperRequestBatch
          SET journeyStatusId = ?,
              batchUpdatedAt  = ?
        WHERE batchUniqueId = ?`,
      [finalBatchStatus, now, batchUniqueId],
    ),

    // 3. Cancel only the cancellable ShipperRequest slots — skip locked ones
    db().query(
      `UPDATE ShipperRequest
          SET journeyStatusId = ?
        WHERE shipperRequestBatchId = ?
          AND journeyStatusId NOT IN (${lockedClause})`,
      [cancelStatusId, batchUniqueId],
    ),

    // 4. Cancel open JourneyDecisions linked to cancellable slots only
    db().query(
      `UPDATE JourneyDecisions jd
         INNER JOIN ShipperRequest pr
                 ON jd.shipperRequestId = pr.shipperRequestId
          SET jd.journeyStatusId = ?
        WHERE pr.shipperRequestBatchId = ?
          AND pr.journeyStatusId NOT IN (${lockedClause})
          AND jd.journeyStatusId NOT IN (${lockedClause})`,
      [cancelStatusId, batchUniqueId],
    ),

    // 5. Release DriverRequest rows linked to cancellable slots back to waiting.
    //    Drivers on journeyStarted/journeyCompleted slots are NOT touched.
    db().query(
      `UPDATE DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest pr
                 ON jd.shipperRequestId = pr.shipperRequestId
          SET dr.journeyStatusId = ?
        WHERE pr.shipperRequestBatchId = ?
          AND pr.journeyStatusId NOT IN (${lockedClause})
          AND dr.journeyStatusId IN (1,2,3,4)`,
      [cancelStatusId, batchUniqueId],
    ),

    // 6. Expire CompanyBidRequest offers for this batch.
    //    Always mark all bids regardless of slot status so companies are notified.
    db().query(
      `UPDATE CompanyBidRequest
          SET bidStatus = 'cancelled_by_company',
              isCancellationSeenByCompany = 'not seen by company yet'
        WHERE shipperRequestBatchId = ?`,
      [batchUniqueId],
    ),

    // 7. Cancel vehicle assignments only for the cancellable slots
    db().query(
      `UPDATE CompanyBidVehicleAssignment cba
         INNER JOIN ShipperRequest pr
                 ON cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
          SET cba.assignmentStatus    = 'cancelled_by_shipper',
              cba.assignmentUpdatedAt = ?
        WHERE pr.shipperRequestBatchId = ?
          AND pr.journeyStatusId NOT IN (${lockedClause})
          AND cba.assignmentStatus IN ('assigned', 'reassigned')`,
      [now, batchUniqueId],
    ),
  ]);

  // 8. Register one CanceledJourneys audit record for the batch.
  //    contextId must be the integer batchId — the contextId column is INT.
  //    Uses contextType 'ShipperRequestBatch' so it is separate from
  //    per-vehicle ShipperRequest cancellation records.
  //    Duplicate guard: only insert if no record exists yet.
  const existingBatchCancel = await getData({
    tableName: "CanceledJourneys",
    conditions: {
      contextId: batch.batchId,
      contextType: "ShipperRequestBatch",
    },
  });
  if (existingBatchCancel.length === 0) {
    await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: now,
      contextId: batch.batchId,
      contextType: "ShipperRequestBatch",
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
      roleId,
      shipperUserUniqueId: batch.shipperUserUniqueId,
    });
  }

  // ── Collect notification targets in parallel (reads only) ─────────────────
  // Fired AFTER all writes succeed but still inside the transaction so reads
  // see the committed state.  Notifications are sent by the controller AFTER
  // the transaction commits to avoid holding DB locks during I/O.
  const [[companyRows], [driverRows], [shipperRows]] = await Promise.all([
    // Companies that had bids on this batch
    db().query(
      `SELECT DISTINCT companyUniqueId
         FROM CompanyBidRequest
        WHERE shipperRequestBatchId = ?`,
      [batchUniqueId],
    ),

    // Drivers who had a JourneyDecision linked to this batch
    db().query(
      `SELECT DISTINCT u.phoneNumber, u.userUniqueId, dr.driverRequestId
         FROM DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest pr
                 ON jd.shipperRequestId = pr.shipperRequestId
         INNER JOIN Users u
                 ON dr.userUniqueId = u.userUniqueId
        WHERE pr.shipperRequestBatchId = ?`,
      [batchUniqueId],
    ),

    // Shipper who owns the batch — for real-time confirmation on other devices
    db().query(
      `SELECT u.phoneNumber, u.userUniqueId
         FROM Users u
        WHERE u.userUniqueId = ?
        LIMIT 1`,
      [batch.shipperUserUniqueId],
    ),
  ]);

  return {
    message: "success",
    data: {
      batchUniqueId,
      finalBatchStatus,
      cancelledStatus: cancelStatusId,
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
      // Plan B summary — tells the client exactly what happened
      slotSummary: {
        total: Number(slotSummary.totalSlots) || 0,
        cancelled: cancellableSlots,
        skipped: lockedSlots,
        skippedReason:
          inProgressSlots > 0
            ? "Some slots are in transit (journeyStarted) or already completed — they were left untouched."
            : null,
      },
    },
    // ── Internal use only — stripped before HTTP response ──────────────────
    _notificationTargets: {
      companies: companyRows.map((r) => r.companyUniqueId),
      drivers: driverRows,
      shipper: shipperRows[0] || null,
      cancelStatusId,
      batchUniqueId,
    },
  };
};

// ── Notification helpers (fire-and-forget, called by the controller) ──────────

/**
 * Send WebSocket + FCM notifications to everyone affected by a batch cancel.
 *
 * @param {Object} targets - Object returned as _notificationTargets from cancelBatch
 * @param {string} targets.batchUniqueId
 * @param {number} targets.cancelStatusId
 * @param {Array<string>} targets.companies - companyUniqueId list
 * @param {Array<{phoneNumber, userUniqueId}>} targets.drivers
 */
exports.sendBatchCancelNotifications = async ({
  batchUniqueId,
  cancelStatusId,
  companies,
  drivers,
  shipper,
}) => {
  const cancelMsg =
    cancelStatusId === journeyStatusMap.cancelledByAdmin
      ? messageTypes.admin_cancelled_request
      : messageTypes.shipper_cancelled_request;

  const socketPayload = {
    messageTypes: messageTypes.company_bid_cancelled,
    message: "success",
    status: cancelStatusId,
    batchUniqueId,
  };

  const promises = [];

  // ── Notify each company (WebSocket to all active members + FCM push) ─────
  for (const companyUniqueId of companies) {
    // WebSocket
    promises.push(
      sendSocketIONotificationToCompany({
        companyUniqueId,
        message: socketPayload,
      }).catch((err) =>
        logger.warn("cancelBatch: company socket error", {
          companyUniqueId,
          error: err.message,
        }),
      ),
    );
  }

  // ── Notify each driver that had a decision on this batch ───────────────
  for (const { phoneNumber, userUniqueId } of drivers) {
    const driverPayload = {
      messageTypes: cancelMsg,
      message: "success",
      status: cancelStatusId,
      batchUniqueId,
    };

    // WebSocket
    promises.push(
      sendSocketIONotificationToDriver({
        message: driverPayload,
        phoneNumber,
        userType: "driver",
      }).catch((err) =>
        logger.warn("cancelBatch: driver socket error", {
          userUniqueId,
          error: err.message,
        }),
      ),
    );

    // FCM push
    promises.push(
      sendFCMNotificationToUser({
        userUniqueId,
        roleId: 2, // driver role
        notification: {
          title: "Request cancelled",
          body: "The shipper has cancelled the freight batch.",
        },
        data: {
          type: "batch_cancelled",
          batchUniqueId: String(batchUniqueId),
        },
      }).catch((err) =>
        logger.warn("cancelBatch: driver FCM error", {
          userUniqueId,
          error: err.message,
        }),
      ),
    );
  }

  // ── Notify the shipper on any other open devices ───────────────────────
  if (shipper?.phoneNumber) {
    const shipperPayload = {
      messageTypes: cancelMsg,
      message: "success",
      status: cancelStatusId,
      batchUniqueId,
    };

    // WebSocket (catches the case where another device/tab is open)
    promises.push(
      sendSocketIONotificationToShipper({
        message: shipperPayload,
        phoneNumber: shipper.phoneNumber,
      }).catch((err) =>
        logger.warn("cancelBatch: shipper socket error", {
          userUniqueId: shipper.userUniqueId,
          error: err.message,
        }),
      ),
    );

    // FCM push (wakes up app if in background)
    promises.push(
      sendFCMNotificationToUser({
        userUniqueId: shipper.userUniqueId,
        roleId: 1, // shipper/shipper role
        notification: {
          title: "Batch cancelled",
          body: "Your freight batch has been cancelled successfully.",
        },
        data: {
          type: "batch_cancelled",
          batchUniqueId: String(batchUniqueId),
        },
      }).catch((err) =>
        logger.warn("cancelBatch: shipper FCM error", {
          userUniqueId: shipper.userUniqueId,
          error: err.message,
        }),
      ),
    );
  }

  await Promise.allSettled(promises);
};

// ── GET SLOTS (cancellability status per slot) ────────────────────────────────

/**
 * ### List all ShipperRequest slots for a batch with cancellability flag.
 *
 * Supports pagination (page / limit) and optional filter by cancellable status.
 * Each slot has a `cancellable` boolean so the frontend can show which rows
 * the shipper is allowed to cancel.
 *
 * Cancellable states (can be cancelled):
 *   1=waiting, 2=requested, 3=acceptedByDriver, 4=acceptedByShipper
 *
 * Non-cancellable states (already terminal or in-transit):
 *   5=journeyStarted, 6=journeyCompleted, 7=cancelledByShipper,
 *   9=cancelledByDriver, 10=cancelledByAdmin, 12=cancelledBySystem
 *
 * @param {string}  batchUniqueId
 * @param {Object}  filters
 * @param {boolean} filters.cancellable  - If true, returns only cancellable slots.
 * @param {number}  filters.page         - Page number (default 1).
 * @param {number}  filters.limit        - Page size (default 20, max 100).
 */
exports.getCancellableSlots = async (batchUniqueId, filters = {}) => {
  const { page, limit, offset } = paginate({ ...filters, defaultLimit: 20 });

  // Cancellable = waiting / requested / acceptedByDriver / acceptedByShipper
  const CANCELLABLE_STATUS_IDS = [
    journeyStatusMap.waiting,           // 1
    journeyStatusMap.requested,         // 2
    journeyStatusMap.acceptedByDriver,  // 3
    journeyStatusMap.acceptedByShipper, // 4
  ];
  const cancellableIn = CANCELLABLE_STATUS_IDS.join(",");

  // ── Build dynamic WHERE filters ───────────────────────────────────────────
  const clauses = [
    "pr.shipperRequestBatchId = ?",
    "pr.shipperRequestDeletedAt IS NULL",
  ];
  const params = [batchUniqueId];

  // Convenience shortcut: ?cancellable=true → only statuses 1-4
  const onlyCancellable =
    filters.cancellable === true || filters.cancellable === "true";
  if (onlyCancellable) {
    clauses.push(`pr.journeyStatusId IN (${cancellableIn})`);
  }

  // Filter by exact status ID — single integer OR array of integers.
  if (filters.journeyStatusId !== undefined && filters.journeyStatusId !== null) {
    const ids = Array.isArray(filters.journeyStatusId)
      ? filters.journeyStatusId.map(Number)
      : [Number(filters.journeyStatusId)];
    if (ids.length === 1) {
      clauses.push("pr.journeyStatusId = ?");
      params.push(ids[0]);
    } else {
      clauses.push(`pr.journeyStatusId IN (${ids.map(() => "?").join(", ")})`);
      params.push(...ids);
    }
  }

  // Filter by status name — single string OR array of strings.
  // Normalise to an array so the SQL always uses IN (?) consistently.
  if (filters.journeyStatusName) {
    const names = Array.isArray(filters.journeyStatusName)
      ? filters.journeyStatusName
      : [filters.journeyStatusName];
    if (names.length === 1) {
      clauses.push("js.journeyStatusName = ?");
      params.push(names[0]);
    } else {
      clauses.push(`js.journeyStatusName IN (${names.map(() => "?").join(", ")})`);
      params.push(...names);
    }
  }

  // ── slotState filter ────────────────────────────────────────────────────────
  // Maps directly to the breakdown categories in verifyShipperStatus.company:
  //
  //   notAssigned       — status=4, no active assignment, never had a driver
  //   needsReassignment — status=4, no active assignment, previous driver cancelled
  //   assigned          — active assignment with assignmentStatus='assigned'
  //   driverConfirmed   — active assignment confirmed or heading to loading
  //
  // Use ?slotState=notAssigned to get the list behind the notAssigned counter.
  if (filters.slotState) {
    switch (filters.slotState) {
      case "notAssigned":
        // Free slot: status=acceptedByShipper, no active assignment, no cancelled history
        clauses.push(
          `pr.journeyStatusId = ?
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus NOT IN (
                 'rejected_by_driver','cancelled_by_company',
                 'cancelled_by_shipper','cancelled_by_driver'
               )
           )
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba2
             WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba2.assignmentDeletedAt IS NULL
               AND cba2.assignmentStatus = 'cancelled_by_driver'
           )`,
        );
        params.push(journeyStatusMap.acceptedByShipper);
        break;

      case "needsReassignment":
        // Free slot: status=acceptedByShipper, no active assignment, prev driver cancelled
        clauses.push(
          `pr.journeyStatusId = ?
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus NOT IN (
                 'rejected_by_driver','cancelled_by_company',
                 'cancelled_by_shipper','cancelled_by_driver'
               )
           )
           AND EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba2
             WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba2.assignmentDeletedAt IS NULL
               AND cba2.assignmentStatus = 'cancelled_by_driver'
           )`,
        );
        params.push(journeyStatusMap.acceptedByShipper);
        break;

      case "assigned":
        // Driver notified, waiting for confirmation
        clauses.push(
          `EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus = 'assigned'
           )`,
        );
        break;

      case "driverConfirmed":
        // Driver confirmed or heading to loading point
        clauses.push(
          `EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus IN ('confirmed_by_driver','going_to_loading')
           )`,
        );
        break;

      default:
        break;
    }
  }



  const dataSql = `
    SELECT
      pr.shipperRequestUniqueId,
      pr.shipperRequestId,
      pr.journeyStatusId,
      js.journeyStatusName,
      pr.originPlace,
      pr.destinationPlace,
      pr.shipperRequestCreatedAt,
      CASE WHEN pr.journeyStatusId IN (${cancellableIn}) THEN 1 ELSE 0 END AS cancellable
    FROM ShipperRequest pr
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    ${where}
    ORDER BY pr.shipperRequestId ASC
    LIMIT ? OFFSET ?`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ShipperRequest pr
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    ${where}`;

  const [[rows], [[countRow]]] = await Promise.all([
    db().query(dataSql, [...params, limit, offset]),
    db().query(countSql, params),
  ]);

  const total = Number(countRow?.total) || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    message: "success",
    data: rows,
    pagination: { page, limit, total, totalPages },
  };
};


// ── PARTIAL CANCEL ────────────────────────────────────────────────────────────

/**
 * ### Partially cancel a company freight batch.
 *
 * Cancels only the slots (ShipperRequest rows) whose UUIDs are in `slotIds`.
 *
 * **Validation rules:**
 * - Every slotId must belong to this batch.
 * - Every slotId must be in a cancellable state (1–4). Already-terminal
 *   or in-transit slots are rejected with a 400 error listing which ones
 *   are not cancellable.
 *
 * **Batch header status after partial cancel:**
 * - If ALL remaining active slots are now cancelled  → `cancelledByShipper` (7)
 * - If some slots are still active/completed         → `partiallyCancelled` (17)
 *
 * @param {string}   batchUniqueId
 * @param {string}   userUniqueId
 * @param {number}   roleId
 * @param {string[]} slotIds  - Array of shipperRequestUniqueId to cancel
 * @param {number|null} cancellationReasonsTypeId
 */
exports.partialCancelBatch = async ({
  batchUniqueId,
  userUniqueId,
  roleId,
  slotIds,
  cancellationReasonsTypeId,
}) => {
  if (!batchUniqueId || !userUniqueId || !slotIds?.length) {
    throw new AppError("batchUniqueId, userUniqueId and slotIds are required", 400);
  }

  // 1a. Validate cancellation reason is appropriate for company context
  await assertCompanyCancellationReason(cancellationReasonsTypeId);

  // 1b. Verify batch exists + ownership
  const batch = await findOne(
    "ShipperRequestBatch",
    { batchUniqueId },
    "Batch not found",
  );

  const isAdmin = roleId === 3 || roleId === 6;
  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }

  // 2. Batch-level terminal guard
  const batchTerminal = [
    journeyStatusMap.cancelledByShipper,  // 7
    journeyStatusMap.cancelledByAdmin,    // 10
    journeyStatusMap.cancelledBySystem,   // 12
  ].filter(Boolean);

  if (batchTerminal.includes(batch.journeyStatusId)) {
    throw new AppError("Batch is already fully cancelled", 400);
  }

  // 3. Fetch the requested slots and verify they all belong to this batch
  const placeholders = slotIds.map(() => "?").join(",");
  const [slots] = await db().query(
    `SELECT shipperRequestUniqueId, shipperRequestId, journeyStatusId
       FROM ShipperRequest
      WHERE shipperRequestUniqueId IN (${placeholders})
        AND shipperRequestBatchId = ?
        AND shipperRequestDeletedAt IS NULL`,
    [...slotIds, batchUniqueId],
  );

  if (slots.length !== slotIds.length) {
    throw new AppError(
      "One or more slotIds do not belong to this batch or do not exist",
      400,
    );
  }

  // 4. Validate cancellability — reject if any slot is not cancellable
  const CANCELLABLE = new Set([
    journeyStatusMap.waiting,           // 1
    journeyStatusMap.requested,         // 2
    journeyStatusMap.acceptedByDriver,  // 3
    journeyStatusMap.acceptedByShipper, // 4
  ]);

  const notCancellable = slots.filter((s) => !CANCELLABLE.has(s.journeyStatusId));
  if (notCancellable.length > 0) {
    throw new AppError(
      `The following slots cannot be cancelled (already in transit or terminal): ` +
      notCancellable.map((s) => s.shipperRequestUniqueId).join(", "),
      400,
    );
  }

  const cancelStatusId = isAdmin
    ? journeyStatusMap.cancelledByAdmin
    : journeyStatusMap.cancelledByShipper;

  const now = currentDate();
  const inClause = [
    journeyStatusMap.cancelledByShipper,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.cancelledByAdmin,
    journeyStatusMap.cancelledBySystem,
  ].join(",");

  // 5. Cancel only the specified slots atomically
  await Promise.all([
    // Cancel ShipperRequest rows
    db().query(
      `UPDATE ShipperRequest
          SET journeyStatusId = ?
        WHERE shipperRequestUniqueId IN (${placeholders})
          AND journeyStatusId NOT IN (${inClause})`,
      [cancelStatusId, ...slotIds],
    ),

    // Cancel open JourneyDecisions for those slots
    db().query(
      `UPDATE JourneyDecisions jd
         INNER JOIN ShipperRequest pr
                 ON jd.shipperRequestId = pr.shipperRequestId
          SET jd.journeyStatusId = ?
        WHERE pr.shipperRequestUniqueId IN (${placeholders})
          AND jd.journeyStatusId NOT IN (${inClause})`,
      [cancelStatusId, ...slotIds],
    ),

    // Release DriverRequest rows linked to those slots
    db().query(
      `UPDATE DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest pr
                 ON jd.shipperRequestId = pr.shipperRequestId
          SET dr.journeyStatusId = ?
        WHERE pr.shipperRequestUniqueId IN (${placeholders})
          AND dr.journeyStatusId IN (1,2,3,4)`,
      [cancelStatusId, ...slotIds],
    ),

    // Cancel vehicle assignments for those slots
    db().query(
      `UPDATE CompanyBidVehicleAssignment cba
         INNER JOIN ShipperRequest pr
                 ON cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
          SET cba.assignmentStatus    = 'cancelled_by_shipper',
              cba.assignmentUpdatedAt = ?
        WHERE pr.shipperRequestUniqueId IN (${placeholders})
          AND cba.assignmentStatus IN ('assigned', 'reassigned')`,
      [now, ...slotIds],
    ),
  ]);

  // 6. Determine new batch-level status
  //    Count how many slots are still active (not in a terminal state)
  const [remaining] = await db().query(
    `SELECT COUNT(*) AS activeCount
       FROM ShipperRequest
      WHERE shipperRequestBatchId = ?
        AND journeyStatusId NOT IN (${inClause})
        AND shipperRequestDeletedAt IS NULL`,
    [batchUniqueId],
  );

  const activeCount = remaining[0]?.activeCount ?? 0;
  const newBatchStatus =
    activeCount === 0
      ? cancelStatusId                          // fully cancelled
      : journeyStatusMap.partiallyCancelled;   // 17 — still has active slots

  await db().query(
    `UPDATE ShipperRequestBatch
        SET journeyStatusId = ?, batchUpdatedAt = ?
      WHERE batchUniqueId = ?`,
    [newBatchStatus, now, batchUniqueId],
  );

  // 7. Audit record per cancelled slot
  for (const slot of slots) {
    const existingCancel = await getData({
      tableName: "CanceledJourneys",
      conditions: {
        contextId: slot.shipperRequestId,
        contextType: "ShipperRequest",
      },
    });
    if (existingCancel.length === 0) {
      await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: now,
        contextId: slot.shipperRequestId,
        contextType: "ShipperRequest",
        cancellationReasonsTypeId: cancellationReasonsTypeId || null,
        roleId,
        shipperUserUniqueId: batch.shipperUserUniqueId,
      });
    }
  }

  // 8. Collect notification targets
  const [[driverRows], [shipperRows]] = await Promise.all([
    db().query(
      `SELECT DISTINCT u.phoneNumber, u.userUniqueId
         FROM DriverRequest dr
         INNER JOIN JourneyDecisions jd ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest pr   ON jd.shipperRequestId = pr.shipperRequestId
         INNER JOIN Users u             ON dr.userUniqueId = u.userUniqueId
        WHERE pr.shipperRequestUniqueId IN (${placeholders})`,
      [...slotIds],
    ),
    db().query(
      `SELECT u.phoneNumber, u.userUniqueId
         FROM Users u WHERE u.userUniqueId = ? LIMIT 1`,
      [batch.shipperUserUniqueId],
    ),
  ]);

  return {
    message: "success",
    data: {
      batchUniqueId,
      cancelledSlots: slotIds.length,
      remainingActiveSlots: activeCount,
      newBatchStatus,
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
    },
    _notificationTargets: {
      drivers: driverRows,
      shipper: shipperRows[0] || null,
      cancelStatusId,
      batchUniqueId,
    },
  };
};
