/**
 * Migration: Add loadingOrderNumber (yard entrance number) to DriverQueue.
 *
 * Run: NODE_ENV=development node scripts/migrate-loading-order.js
 *
 * New column:
 * - DriverQueue.loadingOrderNumber (INT NULL) — write-once at assignment
 *   (status flips to AGREED / acceptedByDriver). ONE continuous sequence
 *   1,2,3… per (queueOrganizationUniqueId, queueDate): the first shipper's
 *   trucks take 1,2,3 and the next shipper's trucks continue 4,5,6,7,
 *   regardless of each truck's queueNumber. NULL while the entry is only
 *   waiting/reserved — the number exists only once the driver holds a job.
 *
 * The two-level yard rule reads THIS column directly (no per-read
 * recomputation/filtering):
 *   1. Shipper turn: the shipper of the LOWEST live loadingOrderNumber is
 *      the serving shipper; only their job-holding vehicles may enter the
 *      yard; other shippers' agreed trucks HOLD (waiting_shipper_turn).
 *   2. Within the serving shipper's turn, their trucks enter by number.
 *
 * Also backfills the column for LIVE legacy entries (agreed before this
 * migration, status 3–8, linked to an order) so the board and gate have
 * numbers on day one. Backfill order per org+day: agreedAt, then queueId
 * (insert order) — the same ticket the old agreedAt sort used — numbered
 * continuously across shippers.
 *
 * Idempotent: ER_DUP_FIELDNAME / ER_DUP_KEYNAME mark already-applied steps;
 * the backfill only touches loadingOrderNumber IS NULL rows.
 */

const { pool } = require("../Middleware/Database.config");

const migrations = [
  {
    name: "add loadingOrderNumber to DriverQueue",
    sql: `ALTER TABLE DriverQueue
          ADD COLUMN loadingOrderNumber INT NULL DEFAULT NULL
          COMMENT 'Yard entrance number, write-once at AGREED; continuous sequence per org+date',
          ADD INDEX idx_queue_loading_order (queueOrganizationUniqueId, queueDate, loadingOrderNumber)`,
  },
  {
    // The history table mirrors EVERY DriverQueue column (equal-column
    // snapshot). On existing databases the CREATE TABLE IF NOT EXISTS template
    // never re-runs, so the mirror column is added here too.
    name: "add loadingOrderNumber to DriverQueueHistory (snapshot mirror)",
    sql: `ALTER TABLE DriverQueueHistory
          ADD COLUMN loadingOrderNumber INT NULL DEFAULT NULL AFTER agreedAt`,
  },
];

// Legacy backfill: number every live job-holding entry that has an order
// linkage but no number yet. Pure Node loop — no MySQL-8-only window
// functions, works on any server version. Numbers continue after the highest
// existing value per (org, date, shipper) so re-running never reuses a number.
const backfillLegacyEntries = async () => {
  const [rows] = await pool.query(
    `SELECT dq.queueId, dq.queueOrganizationUniqueId, dq.queueDate
     FROM DriverQueue dq
     WHERE dq.queueDeletedAt IS NULL
       AND dq.loadingOrderNumber IS NULL
       AND dq.shipperRequestUniqueId IS NOT NULL
       AND dq.status IN (3, 5, 6, 7, 8)
     ORDER BY dq.queueOrganizationUniqueId, dq.queueDate,
              dq.agreedAt, dq.queueId`,
  );
  if (rows.length === 0) {
    console.log("  ⏭  backfill loadingOrderNumber for legacy live entries — nothing to backfill");
    return;
  }

  // Highest already-issued number per (org, date) — keeps issued numbers
  // immutable when numbered (terminal) rows already exist for the day.
  const [maxRows] = await pool.query(
    `SELECT dq.queueOrganizationUniqueId, dq.queueDate,
            MAX(dq.loadingOrderNumber) AS maxNumber
     FROM DriverQueue dq
     WHERE dq.loadingOrderNumber IS NOT NULL
     GROUP BY dq.queueOrganizationUniqueId, dq.queueDate`,
  );
  const counters = new Map();
  for (const row of maxRows) {
    const key = `${row.queueOrganizationUniqueId}|${row.queueDate}`;
    counters.set(key, Number(row.maxNumber) || 0);
  }

  let updated = 0;
  for (const row of rows) {
    const key = `${row.queueOrganizationUniqueId}|${row.queueDate}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    await pool.query(
      `UPDATE DriverQueue SET loadingOrderNumber = ? WHERE queueId = ? AND loadingOrderNumber IS NULL`,
      [next, row.queueId],
    );
    updated += 1;
  }
  console.log(`  ✅ backfill loadingOrderNumber — ${updated} legacy live entr${updated === 1 ? "y" : "ies"} numbered`);
};

(async () => {
  for (const m of migrations) {
    try {
      await pool.query(m.sql);
      console.log(`  ✅ ${m.name}`);
    } catch (error) {
      if (error.code === "ER_DUP_FIELDNAME" || error.code === "ER_DUP_KEYNAME") {
        console.log(`  ⏭  ${m.name} — already applied`);
      } else {
        console.error(`  ❌ ${m.name}: ${error.message}`);
      }
    }
  }
  try {
    await backfillLegacyEntries();
  } catch (error) {
    console.error(`  ❌ backfill loadingOrderNumber: ${error.message}`);
  }
  console.log("\nMigration complete.");
  process.exit(0);
})();
