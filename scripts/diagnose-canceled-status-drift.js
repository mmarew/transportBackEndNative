"use strict";

/**
 * Diagnostic: find ShipperRequests that were reverted to an active status by the
 * old write-on-read auto-correction even though a CanceledJourneys row exists.
 *
 * Mirrors the derivation in Controllers/ShipperRequest.controller.js:312-315:
 *   canceledBy === shipperUserUniqueId -> cancelledByShipper (10)
 *   otherwise                           -> cancelledByAdmin (13)
 *
 * READ-ONLY. Usage: node scripts/diagnose-canceled-status-drift.js
 */

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const ACTIVE_STATUSES = [
  journeyStatusMap.waiting,
  journeyStatusMap.requested,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.acceptedByShipper,
  journeyStatusMap.goToLoadingPlace,
  journeyStatusMap.loading,
  journeyStatusMap.loaded,
  journeyStatusMap.journeyStarted,
];

const deriveStatus = row =>
  row.canceledBy === row.shipperUserUniqueId
    ? journeyStatusMap.cancelledByShipper
    : journeyStatusMap.cancelledByAdmin;

const run = async () => {
  const [rows] = await pool.query(
    `SELECT sr.shipperRequestId,
            sr.shipperRequestUniqueId,
            sr.journeyStatusId,
            sr.shipperRequestDeletedAt,
            cj.canceledJourneyId,
            cj.canceledBy,
            cj.shipperUserUniqueId,
            cj.roleId,
            cj.contextType
     FROM CanceledJourneys cj
     JOIN ShipperRequest sr
       ON sr.shipperRequestId = cj.contextId
     WHERE cj.contextType = 'ShipperRequest'
       AND sr.journeyStatusId IN (?)
     ORDER BY sr.shipperRequestId`,
    [ACTIVE_STATUSES],
  );

  console.log(`\n=== CanceledJourney rows sitting on an ACTIVE status: ${rows.length} ===`);
  if (rows.length === 0) {
    console.log("No drift found — nothing to repair.");
    return;
  }

  const summary = new Map();
  for (const row of rows) {
    const target = deriveStatus(row);
    const key = `${row.journeyStatusId} -> ${target}`;
    summary.set(key, (summary.get(key) || 0) + 1);
    console.log(
      `  shipperRequestId=${row.shipperRequestId} ` +
        `status=${row.journeyStatusId} -> ${target} ` +
        `(context=${row.contextType}, roleId=${row.roleId}, ` +
        `deleted=${row.shipperRequestDeletedAt ? "yes" : "no"})`,
    );
  }

  console.log("\n=== Summary ===");
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Diagnostic failed:", error.message);
    process.exit(1);
  });