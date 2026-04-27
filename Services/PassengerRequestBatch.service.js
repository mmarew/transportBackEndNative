"use strict";

const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const messageTypes = require("../Utils/MessageTypes");
const logger = require("../Utils/logger");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToPassenger,
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

// ── CREATE / UPSERT ──────────────────────────────────────────────────────────

/**
 * ### Single Source of Truth — Create or sync a batch header
 *
 * Called by `createNewPassengerRequest` every time a new individual request
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
  originPlace,
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
    `SELECT batchId FROM PassengerRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
    [batchUniqueId],
  );

  if (existing.length === 0) {
    // First request in this batch → create the header row
    await db().query(
      `INSERT INTO PassengerRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, targetCompanyUniqueId, originPlace, destinationPlace,
         shippableItemName, shippableItemQtyInQuintal, shippingDate, deliveryDate,
         shippingCost, journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchUniqueId,
        shipperUserUniqueId,
        vehicleTypeUniqueId,
        totalVehicles,
        requestMode,
        targetCompanyUniqueId,
        originPlace,
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
      `UPDATE PassengerRequestBatch
         SET totalVehicles = ?, journeyStatusId = ?, batchUpdatedAt = ?
       WHERE batchUniqueId = ?`,
      [totalVehicles, journeyStatusId, currentDate(), batchUniqueId],
    );
  }
};

// ── GET with filters + pagination ─────────────────────────────────────────────

/**
 * ### List PassengerRequestBatches
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

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const baseSql = `
    SELECT
      b.*,
      u.fullName        AS shipperName,
      u.phoneNumber     AS shipperPhone,
      vt.vehicleTypeName,
      js.journeyStatusName,
      tc.companyName    AS targetCompanyName
    FROM PassengerRequestBatch b
    LEFT JOIN Users          u  ON b.shipperUserUniqueId   = u.userUniqueId
    LEFT JOIN VehicleTypes   vt ON b.vehicleTypeUniqueId   = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus  js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
    ${where}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM PassengerRequestBatch b
    LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
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
    "PassengerRequestBatch",
    { batchUniqueId },
    "Passenger request batch not found",
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
    `UPDATE PassengerRequestBatch SET ${setClauses.join(", ")} WHERE batchUniqueId = ?`,
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
    `UPDATE PassengerRequestBatch
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
 * | PassengerRequestBatch          | journeyStatusId → 7 (cancelledByPassenger) or 10 (Admin)      |
 * | PassengerRequest               | All rows in this batch → same cancelled status                |
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

  // 1. Verify batch exists + ownership
  const batch = await findOne(
    "PassengerRequestBatch",
    { batchUniqueId },
    "Batch not found",
  );

  const isAdmin = roleId === 3 || roleId === 6; // admin / super-admin

  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }

  const terminalStatuses = [
    journeyStatusMap.cancelledByPassenger, // 7
    journeyStatusMap.cancelledByDriver, // 9
    journeyStatusMap.cancelledByAdmin, // 10
    journeyStatusMap.cancelledBySystem, // 12
  ].filter(Boolean); // remove undefined if any key is missing

  if (terminalStatuses.includes(batch.journeyStatusId)) {
    throw new AppError("Batch is already cancelled", 400);
  }

  const cancelStatusId = isAdmin
    ? journeyStatusMap.cancelledByAdmin // 10
    : journeyStatusMap.cancelledByPassenger; // 7

  const now = currentDate();
  const inClause = terminalStatuses.join(","); // e.g. "7,9,10,12"

  // ── Steps 2–7: All UPDATEs filter directly by batchUniqueId and have no
  //    inter-dependencies, so they run in parallel.
  //    If ANY query rejects, Promise.all rejects → executeInTransaction rolls
  //    back the entire transaction automatically.
  await Promise.all([
    // 2. Cancel the batch header row
    db().query(
      `UPDATE PassengerRequestBatch
          SET journeyStatusId = ?,
              batchUpdatedAt  = ?
        WHERE batchUniqueId = ?`,
      [cancelStatusId, now, batchUniqueId],
    ),

    // 3. Cancel every individual PassengerRequest row in the batch.
    //    Guard: skip rows already in a terminal state.
    db().query(
      `UPDATE PassengerRequest
          SET journeyStatusId = ?
        WHERE passengerRequestBatchId = ?
          AND journeyStatusId NOT IN (${inClause})`,
      [cancelStatusId, batchUniqueId],
    ),

    // 4. Cancel all open JourneyDecisions linked to this batch.
    db().query(
      `UPDATE JourneyDecisions jd
         INNER JOIN PassengerRequest pr
                 ON jd.passengerRequestId = pr.passengerRequestId
          SET jd.journeyStatusId = ?
        WHERE pr.passengerRequestBatchId = ?
          AND jd.journeyStatusId NOT IN (${inClause})`,
      [cancelStatusId, batchUniqueId],
    ),

    // 5. Cancel matched DriverRequest rows with the same cancel status as the batch.
    //    Driver must recreate their request from the frontend after seeing the cancellation.
    db().query(
      `UPDATE DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN PassengerRequest pr
                 ON jd.passengerRequestId = pr.passengerRequestId
          SET dr.journeyStatusId = ?
        WHERE pr.passengerRequestBatchId = ?
          AND dr.journeyStatusId IN (1,2,3,4)`,
      [cancelStatusId, batchUniqueId],
    ),

    // 6. Cancel all submitted CompanyBidRequest offers — batch is closed.
    db().query(
      `UPDATE CompanyBidRequest
          SET bidStatus = 'cancelled_by_company'
        WHERE passengerRequestBatchId = ?
          AND bidStatus = 'submitted'`,
      [batchUniqueId],
    ),

    // 7. Mark active vehicle assignments as cancelled by shipper.
    //    Only touch rows still in an actionable state (assigned/reassigned).
    //    IN ('assigned','reassigned') is the correct guard — the previous
    //    OR != form was logically always TRUE.
    db().query(
      `UPDATE CompanyBidVehicleAssignment cba
         INNER JOIN PassengerRequest pr
                 ON cba.passengerRequestUniqueId = pr.passengerRequestUniqueId
          SET cba.assignmentStatus    = 'cancelled_by_shipper',
              cba.assignmentUpdatedAt = ?
        WHERE pr.passengerRequestBatchId = ?
          AND cba.assignmentStatus IN ('assigned', 'reassigned')`,
      [now, batchUniqueId],
    ),
  ]);

  // 8. Register one CanceledJourneys audit record for the batch.
  //    Uses contextType 'PassengerRequestBatch' so it is separate from
  //    per-vehicle PassengerRequest cancellation records.
  //    Duplicate guard: only insert if no record exists yet.
  const existingBatchCancel = await getData({
    tableName: "CanceledJourneys",
    conditions: {
      contextId: batchUniqueId,
      contextType: "PassengerRequestBatch",
    },
  });
  if (existingBatchCancel.length === 0) {
    await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: now,
      contextId: batchUniqueId,
      contextType: "PassengerRequestBatch",
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
      roleId,
      passengerUserUniqueId: batch.shipperUserUniqueId,
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
        WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    ),

    // Drivers who had a JourneyDecision linked to this batch
    db().query(
      `SELECT DISTINCT u.phoneNumber, u.userUniqueId, dr.driverRequestId
         FROM DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN PassengerRequest pr
                 ON jd.passengerRequestId = pr.passengerRequestId
         INNER JOIN Users u
                 ON dr.userUniqueId = u.userUniqueId
        WHERE pr.passengerRequestBatchId = ?`,
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
      cancelledStatus: cancelStatusId,
      cancellationReasonsTypeId: cancellationReasonsTypeId || null,
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
      : messageTypes.passenger_cancelled_request;

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
      sendSocketIONotificationToPassenger({
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
        roleId: 1, // passenger/shipper role
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
