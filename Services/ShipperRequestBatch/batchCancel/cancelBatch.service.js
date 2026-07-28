"use strict";

const { inProgressSlots } = require("../batchHelper");

const { db } = require("../../CompanyHelper.service");

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

const cancelBatch = async ({
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
  const [batch] = await getData({
    tableName: "ShipperRequestBatch",
    conditions: { batchUniqueId },
  });
  if (!batch) throw new AppError("Batch not found", 404);
  const isAdmin = roleId === 3 || roleId === 6; // admin / super-admin

  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }
  const terminalStatuses = [
    journeyStatusMap.cancelledByShipper,
    // 7
    journeyStatusMap.cancelledByDriver,
    // 9
    journeyStatusMap.cancelledByAdmin,
    // 10
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
    journeyStatusMap.journeyStarted,
    // 5
    journeyStatusMap.journeyCompleted,
    // 6
    ...terminalStatuses, // 7, 9, 10, 12
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
      journeyStatusMap.journeyStarted,
      // 5
      journeyStatusMap.journeyCompleted,
      // 6
      batchUniqueId,
    ],
  );
  const cancellableSlots = Number(slotSummary.cancellableSlots) || 0;
  const lockedSlots = Number(slotSummary.lockedSlots) || 0;
  const totalSlots = Number(slotSummary.totalSlots) || 0;

  // ── Slot-free batch (waiting / requested stage) ─────----──────────────────────
  // No ShipperRequest rows exist yet — bid hasn't been accepted.
  // Cancel the batch header and expire any open bids; nothing else to do.
  if (totalSlots === 0) {
    await Promise.all([
      db().query(
        `UPDATE ShipperRequestBatch
            SET journeyStatusId = ?,
                batchUpdatedAt  = ?
          WHERE batchUniqueId = ?`,
        [cancelStatusId, now, batchUniqueId],
      ),
      db().query(
        `UPDATE CompanyBidRequest
            SET bidStatus = 'expired',
                isCancellationSeenByCompany = 'not seen by company yet'
          WHERE shipperRequestBatchId = ?
            AND bidStatus NOT IN ('expired','rejected_by_shipper','cancelled_by_company')`,
        [batchUniqueId],
      ),
    ]);

    // Collect notification targets before returning
    const [[companyRows], [shipperRows]] = await Promise.all([
      db().query(
        `SELECT DISTINCT companyUniqueId FROM CompanyBidRequest WHERE shipperRequestBatchId = ?`,
        [batchUniqueId],
      ),
      db().query(
        `SELECT u.phoneNumber, u.userUniqueId FROM Users u WHERE u.userUniqueId = ? LIMIT 1`,
        [batch.shipperUserUniqueId],
      ),
    ]);

    return {
      message: "Batch cancelled successfully",
      batchUniqueId,
      _notificationTargets: {
        batchUniqueId,
        cancelStatusId,
        companies: (companyRows || []).map((r) => r.companyUniqueId),
        drivers: [],
        shipper: shipperRows?.[0] || null,
      },
    };
  }

  // ── All existing slots are locked (started / completed / already cancelled) ─
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
         INNER JOIN ShipperRequest sr
                 ON jd.shipperRequestId = sr.shipperRequestId
          SET jd.journeyStatusId = ?
        WHERE sr.shipperRequestBatchId = ?
          AND sr.journeyStatusId NOT IN (${lockedClause})
          AND jd.journeyStatusId NOT IN (${lockedClause})`,
      [cancelStatusId, batchUniqueId],
    ),
    // 5. Release DriverRequest rows linked to cancellable slots back to waiting.
    //    Drivers on journeyStarted/journeyCompleted slots are NOT touched.
    db().query(
      `UPDATE DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest sr
                 ON jd.shipperRequestId = sr.shipperRequestId
          SET dr.journeyStatusId = ?
        WHERE sr.shipperRequestBatchId = ?
          AND sr.journeyStatusId NOT IN (${lockedClause})
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
         INNER JOIN ShipperRequest sr
                 ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
          SET cba.assignmentStatus    = 'cancelled_by_shipper',
              cba.assignmentUpdatedAt = ?
        WHERE sr.shipperRequestBatchId = ?
          AND sr.journeyStatusId NOT IN (${lockedClause})
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
         INNER JOIN ShipperRequest sr
                 ON jd.shipperRequestId = sr.shipperRequestId
         INNER JOIN Users u
                 ON dr.userUniqueId = u.userUniqueId
        WHERE sr.shipperRequestBatchId = ?`,
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
    message: "Batch cancelled",
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

module.exports = {
  cancelBatch,
};

const AppError = require("../../../Utils/AppError");
const {
  assertCompanyCancellationReason,
} = require("../../ShipperRequestBatch/batchHelper");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const { currentDate } = require("../../../Utils/CurrentDate");
const { getData } = require("../../../CRUD/Read/ReadData");
const {
  createCanceledJourney,
} = require("../../CanceledJourneys/cancelCreate.service");
