"use strict";

/**
 * Repairs ShipperRequests that the old write-on-read auto-correction reverted
 * to an active status even though a CanceledJourneys row says they were
 * cancelled.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   node scripts/repair-canceled-status-drift.js
 *   node scripts/repair-canceled-status-drift.js --apply
 *
 * Target status mirrors Controllers/ShipperRequest.controller.js:312-315:
 *   canceledBy === shipperUserUniqueId -> cancelledByShipper (10)
 *   otherwise                           -> cancelledByAdmin (13)
 *
 * Safety: only rows currently on an ACTIVE status are touched (a row that is
 * already terminal is left alone), and every UPDATE re-asserts the status it
 * was selected with, so a cancellation landing mid-run wins.
 */

const { pool } = require("../Middleware/Database.config");
const {
  journeyStatusMap,
  activeJourneyStatuses,
  usersRoles,
} = require("../Utils/ListOfSeedData");
const { currentDate } = require("../Utils/CurrentDate");

const APPLY = process.argv.includes("--apply");

const deriveStatus = row =>
  row.canceledBy === row.shipperUserUniqueId
    ? journeyStatusMap.cancelledByShipper
    : journeyStatusMap.cancelledByAdmin;

// The target status is inferred from who cancelled, mirroring the controller.
// Flag rows whose stored roleId contradicts that inference so an operator can
// eyeball them instead of trusting a guess.
const roleIdSuggestsAdmin = roleId =>
  ![usersRoles.shipperRoleId, usersRoles.driverRoleId].includes(Number(roleId));
const isContradictory = (row, target) =>
  (target === journeyStatusMap.cancelledByShipper && roleIdSuggestsAdmin(row.roleId)) ||
  (target === journeyStatusMap.cancelledByAdmin &&
    Number(row.roleId) === usersRoles.shipperRoleId);

const run = async () => {
  console.log(APPLY ? "MODE: APPLY (writes)" : "MODE: DRY RUN (no writes)");
  if (!APPLY) {
    console.log("Re-run with --apply to persist the repair.\n");
  }

  const [rows] = await pool.query(
    `SELECT sr.shipperRequestId,
            sr.shipperRequestUniqueId,
            sr.journeyStatusId,
            sr.shipperRequestDeletedAt,
            cj.canceledBy,
            cj.shipperUserUniqueId,
            cj.roleId,
            cj.canceledTime
     FROM CanceledJourneys cj
     JOIN ShipperRequest sr
       ON sr.shipperRequestId = cj.contextId
     WHERE cj.contextType = 'ShipperRequest'
       AND sr.journeyStatusId IN (?)
     ORDER BY sr.shipperRequestId`,
    [activeJourneyStatuses],
  );

  if (rows.length === 0) {
    console.log("No drift found — nothing to repair.");
    return;
  }

  let repaired = 0;
  let skipped = 0;

  for (const row of rows) {
    const target = deriveStatus(row);
    const contradiction = isContradictory(row, target);
    const suffix = contradiction
      ? `  ⚠ roleId=${row.roleId} contradicts the inferred target — verify before applying`
      : "";

    if (!APPLY) {
      console.log(
        `  WOULD FIX shipperRequestId=${row.shipperRequestId} ` +
          `${row.journeyStatusId} -> ${target} (roleId=${row.roleId})${suffix}`,
      );
      continue;
    }

    if (contradiction) {
      console.log(
        `  SKIPPED shipperRequestId=${row.shipperRequestId} — roleId=${row.roleId} ` +
          `contradicts the inferred status ${target}; repair manually`,
      );
      skipped += 1;
      continue;
    }

    const [result] = await pool.query(
      `UPDATE ShipperRequest
       SET journeyStatusId = ?, shipperRequestUpdatedAt = ?
       WHERE shipperRequestId = ?
         AND journeyStatusId = ?`,
      [target, currentDate(), row.shipperRequestId, row.journeyStatusId],
    );

    if (result.affectedRows > 0) {
      repaired += 1;
      console.log(
        `  FIXED shipperRequestId=${row.shipperRequestId} ` +
          `${row.journeyStatusId} -> ${target} ` +
          `(roleId=${row.roleId}, canceledTime=${row.canceledTime})`,
      );
    } else {
      skipped += 1;
      console.log(
        `  SKIPPED shipperRequestId=${row.shipperRequestId} — status changed since selection`,
      );
    }
  }

  console.log(`\nTotal drifted rows: ${rows.length}`);
  if (!APPLY) {
    console.log("Dry run complete — no rows were modified.");
  } else {
    console.log(`Repaired: ${repaired}, skipped: ${skipped}`);
  }
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Repair failed:", error.message);
    process.exit(1);
  });