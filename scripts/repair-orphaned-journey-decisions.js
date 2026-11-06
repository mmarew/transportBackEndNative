"use strict";

/**
 * Repairs JourneyDecisions rows that are still on an ACTIVE status while the
 * DriverRequest they hang off is no longer on an active status — the footprint
 * of a release path that freed the driver and forgot the decision.
 *
 * Symptom this clears: `POST /api/company/assignments` answers
 *   409 "Driver is already engaged on an active journey (status 2 on order ...)"
 * while `GET /api/driver/verifyDriverJourneyStatus` reports the same driver as
 * status 1 with no active job and no live assignment. The fence reads the
 * decision; the driver app reads the DriverRequest.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/repair-orphaned-journey-decisions.js
 *   node scripts/repair-orphaned-journey-decisions.js --apply
 *
 * Safety:
 *  - Rows whose company assignment is still live are SKIPPED, never repaired —
 *    a live assignment with a `waiting` request is the known transient
 *    `handleJourneyStatusOne` promotes back to `requested` on the next poll.
 *  - Only the JourneyDecision is touched. The DriverRequest is already free and
 *    the ShipperRequest is left alone (reverting a company_target slot to
 *    `waiting` would make it unassignable).
 *  - Every UPDATE re-asserts the status the row was selected with, so a
 *    settlement landing mid-run wins.
 */

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const { currentDate } = require("../Utils/CurrentDate");

const APPLY = process.argv.includes("--apply");

// A decision is "active" exactly when an engagement is still open on it.
const ACTIVE_DECISION_STATUSES = [
  journeyStatusMap.requested,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.acceptedByShipper,
  journeyStatusMap.goToLoadingPlace,
  journeyStatusMap.loading,
  journeyStatusMap.loaded,
  journeyStatusMap.journeyStarted,
];

// Terminal mirror of the same window — used to decide whether the driver's own
// request still carries an engagement.
const TERMINAL_ASSIGNMENT_STATUSES = [
  "completed",
  "cancelled_by_company",
  "cancelled_by_shipper",
  "cancelled_by_driver",
  "rejected_by_driver",
];

/**
 * The status the decision SHOULD carry, derived from the assignment that owned
 * it. A decision with no assignment (individual / queue offer) was orphaned by
 * a system release, so it is terminalised as cancelledByAdmin.
 */
const deriveTargetStatus = (row) => {
  switch (row.assignmentStatus) {
    case "rejected_by_driver":
      return journeyStatusMap.rejectedByDriver;
    case "cancelled_by_driver":
    case "cancelled":
      return journeyStatusMap.cancelledByDriver;
    case "completed":
      return journeyStatusMap.journeyCompleted;
    default:
      return journeyStatusMap.cancelledByAdmin;
  }
};

const run = async () => {
  console.log(APPLY ? "MODE: APPLY (writes)" : "MODE: DRY RUN (no writes)");

  const [rows] = await pool.query(
    `SELECT jd.journeyDecisionUniqueId,
            jd.journeyStatusId,
            jd.decisionBy,
            jd.journeyDecisionUpdatedAt,
            dr.driverRequestId,
            dr.driverRequestUniqueId,
            dr.journeyStatusId   AS driverRequestStatus,
            dr.driverRequestDeletedAt,
            sr.shipperRequestUniqueId,
            cba.assignmentUniqueId,
            cba.assignmentStatus,
            cba.assignmentDeletedAt
       FROM JourneyDecisions jd
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       LEFT JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       LEFT JOIN CompanyBidVehicleAssignment cba
              ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
             AND cba.assignmentDeletedAt IS NULL
      WHERE jd.journeyDecisionDeletedAt IS NULL
        AND jd.journeyStatusId IN (?)
        AND dr.journeyStatusId NOT IN (?)
      ORDER BY jd.journeyDecisionId`,
    [ACTIVE_DECISION_STATUSES, ACTIVE_DECISION_STATUSES],
  );

  if (rows.length === 0) {
    console.log("No orphaned decisions found — nothing to repair.");
    return;
  }

  let repaired = 0;
  let skipped = 0;

  for (const row of rows) {
    const liveAssignment =
      row.assignmentUniqueId &&
      !TERMINAL_ASSIGNMENT_STATUSES.includes(row.assignmentStatus);

    if (liveAssignment) {
      skipped += 1;
      console.log(
        `  SKIPPED decision=${row.journeyDecisionUniqueId} — assignment ${row.assignmentUniqueId} ` +
          `is still ${row.assignmentStatus}; leave it for the driver's next poll`,
      );
      continue;
    }

    const target = deriveTargetStatus(row);
    const label =
      `decision=${row.journeyDecisionUniqueId} jd=${row.journeyStatusId} -> ${target} ` +
      `(driverRequest=${row.driverRequestUniqueId} status=${row.driverRequestStatus}, ` +
      `assignment=${row.assignmentStatus || "none"}, order=${row.shipperRequestUniqueId || "none"})`;

    if (!APPLY) {
      console.log(`  WOULD FIX ${label}`);
      continue;
    }

    const [result] = await pool.query(
      `UPDATE JourneyDecisions
          SET journeyStatusId = ?, journeyDecisionUpdatedAt = ?
        WHERE journeyDecisionUniqueId = ?
          AND journeyStatusId = ?`,
      [target, currentDate(), row.journeyDecisionUniqueId, row.journeyStatusId],
    );

    if (result.affectedRows > 0) {
      repaired += 1;
      console.log(`  FIXED ${label}`);
    } else {
      skipped += 1;
      console.log(
        `  SKIPPED decision=${row.journeyDecisionUniqueId} — status changed since selection`,
      );
    }
  }

  console.log(`\nTotal orphaned decisions: ${rows.length}`);
  if (!APPLY) {
    console.log("Dry run complete — no rows were modified. Re-run with --apply to persist.");
  } else {
    console.log(`Repaired: ${repaired}, skipped: ${skipped}`);
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Repair failed:", error.message);
    process.exit(1);
  });
