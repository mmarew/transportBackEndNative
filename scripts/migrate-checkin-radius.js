/**
 * Migration: Add checkinRadiusKm to QueueOrganization + driverLatitude/driverLongitude to DriverQueue.
 *
 * Run: NODE_ENV=development node scripts/migrate-checkin-radius.js
 *
 * New columns:
 * - QueueOrganization.checkinRadiusKm (INT NULL) — max allowed check-in distance in km.
 *   NULL means no distance check (any driver can check in from anywhere).
 *   Set to an integer (e.g., 5, 10) to require drivers to be within that radius.
 *
 * - DriverQueue.driverLatitude (DECIMAL 10,8 NULL) — driver's GPS latitude at check-in time.
 * - DriverQueue.driverLongitude (DECIMAL 11,8 NULL) — driver's GPS longitude at check-in time.
 *   Both are stored for audit purposes and proximity history tracking.
 *
 * Idempotent: uses ER_DUP_FIELDNAME to detect already-applied migrations.
 */
const { pool } = require("../Middleware/Database.config");

const migrations = [
  {
    name: "add checkinRadiusKm to QueueOrganization",
    sql: `ALTER TABLE QueueOrganization
          ADD COLUMN checkinRadiusKm INT NULL DEFAULT NULL
          AFTER longitude`,
  },
  {
    name: "add driverLatitude/driverLongitude to DriverQueue",
    sql: `ALTER TABLE DriverQueue
          ADD COLUMN driverLatitude DECIMAL(10, 8) NULL DEFAULT NULL,
          ADD COLUMN driverLongitude DECIMAL(11, 8) NULL DEFAULT NULL`,
  },
];

(async () => {
  for (const m of migrations) {
    try {
      await pool.query(m.sql);
      console.log(`  ✅ ${m.name}`);
    } catch (error) {
      if (error.code === "ER_DUP_FIELDNAME") {
        console.log(`  ⏭  ${m.name} — already applied`);
      } else {
        console.error(`  ❌ ${m.name}: ${error.message}`);
      }
    }
  }
  console.log("\nMigration complete.");
  process.exit(0);
})();
