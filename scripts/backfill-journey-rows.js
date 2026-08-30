"use strict";

/**
 * ONE-TIME backfill: reconstruct missing `Journey` rows for completed decisions.
 *
 * A schema rebuild around 2026-08-27 wiped the pre-existing `Journey` rows
 * (e.g. decision 1c2b6f74-674d-4bd0-84c8-d0c7a782e0b6 reached journeyCompleted
 * with route points still tracked, but its Journey row is gone). Completed
 * orders surfacing without a journey block the shipper POD screen
 * (`journey: {}`, no `journeyUniqueId` to submit delivery confirmation).
 *
 * This script re-creates the missing rows from the surviving data: the
 * decision, shipper/driver request (origin/destination, fare, audit) and the
 * recorded route points (GPS + timestamps). It is idempotent — re-running
 * only fills decisions that still lack a completed Journey row.
 *
 * Usage (from the repo root, with the live DB env loaded):
 *   node scripts/backfill-journey-rows.js
 */

require("dotenv").config();
const { pool } = require("../Middleware/Database.config");
const {
  repairAllMissingCompletedJourneys,
} = require("../Services/Journey/journeyRepair.service");

async function run() {
  const { missing, repaired, skipped } = await repairAllMissingCompletedJourneys();

  console.log(`[journey-backfill] ${missing} completed decisions have no Journey row`);

  console.log(`[journey-backfill] repaired: ${repaired}`);
  if (skipped.length > 0) {
    console.log(
      `[journey-backfill] skipped ${skipped.length}:`,
      skipped
        .map((s) => `${s.journeyDecisionUniqueId} (${s.reason})`)
        .join(", "),
    );
  }
}

run().then(() => pool.end()).catch((err) => {
  console.error("[journey-backfill] failed:", err.message);
  process.exitCode = 1;
  pool.end();
});