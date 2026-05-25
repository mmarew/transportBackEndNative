"use strict";

const { db, findOne } = require("../../CompanyHelper.service");

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

const partialCancelBatch = async ({
  batchUniqueId,
  userUniqueId,
  roleId,
  slotIds,
  cancellationReasonsTypeId,
}) => {
  if (!batchUniqueId || !userUniqueId || !slotIds?.length) {
    throw new AppError(
      "batchUniqueId, userUniqueId and slotIds are required",
      400,
    );
  }

  // 1a. Validate cancellation reason is appropriate for company context
  await assertCompanyCancellationReason(cancellationReasonsTypeId);

  // 1b. Verify batch exists + ownership
  const batch = await findOne(
    "ShipperRequestBatch",
    {
      batchUniqueId,
    },
    "Batch not found",
  );
  const isAdmin = roleId === 3 || roleId === 6;
  if (batch.shipperUserUniqueId !== userUniqueId && !isAdmin) {
    throw new AppError("Unauthorized: batch does not belong to you", 403);
  }

  // 2. Batch-level terminal guard
  const batchTerminal = [
    journeyStatusMap.cancelledByShipper,
    // 7
    journeyStatusMap.cancelledByAdmin,
    // 10
    journeyStatusMap.cancelledBySystem, // 12
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
    journeyStatusMap.waiting,
    // 1
    journeyStatusMap.requested,
    // 2
    journeyStatusMap.acceptedByDriver,
    // 3
    journeyStatusMap.acceptedByShipper, // 4
  ]);
  const notCancellable = slots.filter(
    (s) => !CANCELLABLE.has(s.journeyStatusId),
  );
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
         INNER JOIN ShipperRequest sr
                 ON jd.shipperRequestId = sr.shipperRequestId
          SET jd.journeyStatusId = ?
        WHERE sr.shipperRequestUniqueId IN (${placeholders})
          AND jd.journeyStatusId NOT IN (${inClause})`,
      [cancelStatusId, ...slotIds],
    ),
    // Release DriverRequest rows linked to those slots
    db().query(
      `UPDATE DriverRequest dr
         INNER JOIN JourneyDecisions jd
                 ON dr.driverRequestId = jd.driverRequestId
         INNER JOIN ShipperRequest sr
                 ON jd.shipperRequestId = sr.shipperRequestId
          SET dr.journeyStatusId = ?
        WHERE sr.shipperRequestUniqueId IN (${placeholders})
          AND dr.journeyStatusId IN (1,2,3,4)`,
      [cancelStatusId, ...slotIds],
    ),
    // Cancel vehicle assignments for those slots
    db().query(
      `UPDATE CompanyBidVehicleAssignment cba
         INNER JOIN ShipperRequest sr
                 ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
          SET cba.assignmentStatus    = 'cancelled_by_shipper',
              cba.assignmentUpdatedAt = ?
        WHERE sr.shipperRequestUniqueId IN (${placeholders})
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
      ? cancelStatusId // fully cancelled
      : journeyStatusMap.partiallyCancelled; // 17 — still has active slots

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
         INNER JOIN ShipperRequest sr   ON jd.shipperRequestId = sr.shipperRequestId
         INNER JOIN Users u             ON dr.userUniqueId = u.userUniqueId
        WHERE sr.shipperRequestUniqueId IN (${placeholders})`,
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

module.exports = {
  partialCancelBatch,
};

const AppError = require("../../../Utils/AppError");
const {
  assertCompanyCancellationReason,
} = require("../../CanceledJourneys/cancelHelper");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const { currentDate } = require("../../../Utils/CurrentDate");
const { getData } = require("../../../CRUD/Read/ReadData");
const {
  createCanceledJourney,
} = require("../../CanceledJourneys/cancelCreate.service");
