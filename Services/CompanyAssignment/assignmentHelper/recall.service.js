"use strict";

const { db, assertCompanyAccess } = require("../../CompanyHelper.service");
const { currentDate } = require("../../../Utils/CurrentDate");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");

/**
 * assignmentStatus values that mean the row is already finished — a recall can
 * no longer change anything once one of these is on the row.
 * Same set the slot-freeing queries use (`assignmentCreate.service.js:84-117`,
 * `findDriverBusyState`).
 */
const TERMINAL_ASSIGNMENT_STATUSES = Object.freeze([
  "completed",
  "cancelled_by_company",
  "cancelled_by_shipper",
  "cancelled_by_driver",
  "rejected_by_driver",
]);

const isActiveAssignment = (assignmentStatus) =>
  !TERMINAL_ASSIGNMENT_STATUSES.includes(assignmentStatus);

/**
 * readAssignmentForUpdate
 * ───────────────────────
 * Locks one assignment row (`FOR UPDATE`) for a recall/replace and resolves the
 * company that owns it, so the caller can run `assertCompanyAccess` before it
 * mutates anything. Soft-deleted rows behave as missing.
 *
 * @param {string} assignmentUniqueId
 * @returns {Promise<object>} assignment joined with bid company + order mode
 * @throws {AppError} 404 when the row is gone or already deleted
 */
const readAssignmentForUpdate = async (assignmentUniqueId) => {
  const [rows] = await db().query(
    `SELECT cba.assignmentUniqueId, cba.assignmentStatus, cba.companyBidRequestUniqueId,
            cba.shipperRequestUniqueId, cba.vehicleUniqueId, cba.driverUserUniqueId,
            cba.driverRequestUniqueId, cba.journeyDecisionUniqueId,
            cba.assignmentCreatedBy, cba.assignmentCreatedAt,
            cbr.companyUniqueId, cbr.bidStatus,
            sr.requestMode, sr.targetCompanyUniqueId,
            sr.journeyStatusId AS shipperJourneyStatusId
       FROM CompanyBidVehicleAssignment cba
       JOIN CompanyBidRequest cbr
         ON cbr.companyBidRequestUniqueId = cba.companyBidRequestUniqueId
       LEFT JOIN ShipperRequest sr
         ON sr.shipperRequestUniqueId = cba.shipperRequestUniqueId
      WHERE cba.assignmentUniqueId = ?
        AND cba.assignmentDeletedAt IS NULL
      FOR UPDATE`,
    [assignmentUniqueId],
  );

  if (!rows.length) {
    throw new AppError(
      "Assignment not found or already deleted",
      AppError.NOT_FOUND,
    );
  }
  return rows[0];
};

/**
 * recallAssignment
 * ────────────────
 * Company-initiated recall: a dispatcher pulls a driver who accepted a freight
 * job but can no longer finish it. Mirrors the driver-initiated cancel in
 * `actionCancelDriverRequest.service.js` with company semantics — the driver is
 * released from every gate that would otherwise keep them "engaged":
 *
 *  1. `CompanyBidVehicleAssignment` → `cancelled_by_company`, which frees the
 *     slot for `findActiveAssignmentForSlot` and counts as terminal for
 *     `findDriverBusyState`.
 *  2. `DriverRequest` → `cancelledByAdmin` (13) — terminal, so the driver can be
 *     handed a new job through `upsertDriverRequest`.
 *  3. `JourneyDecisions` → `cancelledByAdmin` (13) — clears the ACTIVE_JOURNEY
 *     fence in `findDriverBusyState`.
 *  4. `Journey` → `cancelledByAdmin` (13) when the trip was already underway.
 *  5. `ShipperRequest` → back to `acceptedByShipper` (4) if the order had
 *     advanced past it (loading/journey stages), so the company can assign a
 *     replacement to the same slot. Individual-mode slots fall back to `waiting`.
 *  6. Queue holder entry is closed WITHOUT offering the order to the next
 *     driver — the dispatcher who ordered the recall also picks the replacement.
 *
 * Idempotent: a row that is already terminal returns `{ recalled: false }`
 * instead of being rewritten, so a concurrent driver-cancel cannot be
 * overwritten by a later company recall.
 *
 * @param {Object} opts
 * @param {object} opts.assignment         Row from `readAssignmentForUpdate`.
 * @param {string} opts.actorUserUniqueId Dispatcher who ordered the recall.
 * @returns {Promise<{recalled: boolean}>}
 */
const recallAssignment = async ({ assignment, actorUserUniqueId }) => {
  if (!isActiveAssignment(assignment.assignmentStatus)) {
    return { recalled: false };
  }

  const now = currentDate();
  const terminal = journeyStatusMap.cancelledByAdmin;
  const terminalList = TERMINAL_ASSIGNMENT_STATUSES.map((s) => `'${s}'`).join(
    ",",
  );

  // 1. Assignment row → cancelled_by_company (only while it is still active)
  const [upd] = await db().query(
    `UPDATE CompanyBidVehicleAssignment
        SET assignmentStatus = 'cancelled_by_company',
            assignmentUpdatedAt = ?,
            assignmentUpdatedBy = ?
      WHERE assignmentUniqueId = ?
        AND assignmentDeletedAt IS NULL
        AND assignmentStatus NOT IN (${terminalList})`,
    [now, actorUserUniqueId, assignment.assignmentUniqueId],
  );
  if (upd.affectedRows === 0) {
    // Someone else terminalized it between our lock and this write.
    return { recalled: false };
  }

  // 2. DriverRequest → released
  if (assignment.driverRequestUniqueId) {
    await db().query(
      `UPDATE DriverRequest
          SET journeyStatusId = ?, driverRequestUpdatedAt = ?
        WHERE driverRequestUniqueId = ?`,
      [terminal, now, assignment.driverRequestUniqueId],
    );
  }

  // 3+4. JourneyDecision and (if it exists) the Journey itself
  if (assignment.journeyDecisionUniqueId) {
    await db().query(
      `UPDATE JourneyDecisions
          SET journeyStatusId = ?, journeyDecisionUpdatedAt = ?
        WHERE journeyDecisionUniqueId = ?`,
      [terminal, now, assignment.journeyDecisionUniqueId],
    );

    await db().query(
      `UPDATE Journey
          SET journeyStatusId = ?
        WHERE journeyDecisionUniqueId = ?
          AND journeyStatusId IN (?, ?, ?, ?)`,
      [
        terminal,
        assignment.journeyDecisionUniqueId,
        journeyStatusMap.goToLoadingPlace,
        journeyStatusMap.loading,
        journeyStatusMap.loaded,
        journeyStatusMap.journeyStarted,
      ],
    );
  }

  // 5. The slot itself: bring the ShipperRequest back to the state where the
  //    company can re-assign it. Loading/journey stages (5-8) are the only
  //    statuses a live assignment can push a slot past `acceptedByShipper`.
  if (assignment.shipperRequestUniqueId) {
    const revertTo =
      assignment.requestMode === "company_target" ||
      assignment.targetCompanyUniqueId
        ? journeyStatusMap.acceptedByShipper
        : journeyStatusMap.waiting;

    await db().query(
      `UPDATE ShipperRequest
          SET journeyStatusId = ?
        WHERE shipperRequestUniqueId = ?
          AND journeyStatusId IN (?, ?, ?, ?)`,
      [
        revertTo,
        assignment.shipperRequestUniqueId,
        journeyStatusMap.goToLoadingPlace,
        journeyStatusMap.loading,
        journeyStatusMap.loaded,
        journeyStatusMap.journeyStarted,
      ],
    );
  }

  // 7. Pull the recalled driver's truck out of the assignable pool. Re-freeing
  //    it is the dispatcher's job (PATCH /api/company/fleet/:vehicleUniqueId),
  //    so it stays `inactive` even after the replacement finishes.
  if (assignment.vehicleUniqueId) {
    await db().query(
      `UPDATE CompanyVehicle
          SET assignmentStatus = 'inactive'
        WHERE vehicleUniqueId = ?
          AND companyVehicleDeletedAt IS NULL`,
      [assignment.vehicleUniqueId],
    );
  }

  // 8. Queue holder entry (queue-dispatch orders only) — close it, but never
  //    auto-offer the order to the next driver: reassignment stays manual.
  if (assignment.shipperRequestUniqueId) {
    try {
      const {
        releaseQueueEntryForCompanyRecall,
      } = require("../../DriverQueue/release.service");
      await releaseQueueEntryForCompanyRecall({
        shipperRequestUniqueId: assignment.shipperRequestUniqueId,
        driverUserUniqueId: assignment.driverUserUniqueId,
        actorUserUniqueId,
      });
    } catch (queueError) {
      // A queue hiccup must not roll back an already-consistent recall; the
      // entry is swept by the queue expiry/advance jobs if this ever fails.
      logger.warn("releaseQueueEntryForCompanyRecall failed", {
        error: queueError.message,
        assignmentUniqueId: assignment.assignmentUniqueId,
      });
    }
  }

  return { recalled: true };
};

/**
 * assertRecallAccess
 * ───────────────────
 * Cross-company fence for recall/replace: the caller must be an active member
 * of the company that submitted the bid (platform admins bypass membership
 * inside `assertCompanyAccess`). Throws 403 otherwise.
 */
const assertRecallAccess = async (user, assignment) => {
  await assertCompanyAccess(user, assignment.companyUniqueId);
  return true;
};

module.exports = {
  TERMINAL_ASSIGNMENT_STATUSES,
  isActiveAssignment,
  readAssignmentForUpdate,
  recallAssignment,
  assertRecallAccess,
};
