/**
 * Migration: add `mine`, `farm` and `port` to QueueOrganization.queueOrganizationType.
 *
 * Run: NODE_ENV=development node scripts/migrate-queue-org-types.js
 *
 * Why: the console manages ports, farms, mining sites, factories and cement
 * works, but the ENUM only carried customs/factory/cement/depot/other. Mining
 * sites and farms collapsed into "other", and nothing type-specific can ever
 * attach to a row that is just "other".
 *
 * Safety: MODIFY COLUMN ... ENUM re-types the column. The target keeps every
 * value the live ENUM already has, so no existing row can become invalid.
 *
 * The target deliberately places `other` last (it reads better and matches the
 * DDL in Database/Database.js) even though `other` is currently the fifth
 * value. That reorders the list, which is safe: MySQL stores ENUMs as indexes
 * and remaps the stored value when the declared order changes, so a row that
 * said 'other' still says 'other' afterwards. The guard below therefore checks
 * that no live value is *dropped*, not that the live list is a prefix of the
 * target — a prefix check would reject this migration on its own starting state.
 *
 * Idempotent: reads the live ENUM from INFORMATION_SCHEMA.COLUMNS first and
 * exits if it already matches the target.
 */
const { pool } = require("../Middleware/Database.config");

const TARGET_TYPES = [
  "customs",
  "factory",
  "cement",
  "depot",
  "mine",
  "farm",
  "port",
  "other",
];

const formatEnum = (types) => types.map((t) => `'${t}'`).join(",");

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'QueueOrganization'
          AND COLUMN_NAME = 'queueOrganizationType'`,
    );

    if (rows.length === 0) {
      console.error(
        "  ❌ QueueOrganization.queueOrganizationType not found — nothing to migrate.",
      );
      process.exit(1);
    }

    const live = String(rows[0].COLUMN_TYPE); // e.g. enum('customs','factory',...)
    const liveTypes = (live.match(/'[^']+'/g) || []).map((v) => v.slice(1, -1));

    const alreadyDone =
      liveTypes.length === TARGET_TYPES.length &&
      liveTypes.every((v, i) => v === TARGET_TYPES[i]);

    if (alreadyDone) {
      console.log("  ⏭  queueOrganizationType already migrated — nothing to do.");
      console.log("\nMigration complete.");
      process.exit(0);
    }

    // Guard against dropping a value that live rows already use. Reordering is
    // fine (MySQL remaps the stored index), losing a value is not.
    const missingFromTarget = liveTypes.filter((v) => !TARGET_TYPES.includes(v));

    if (missingFromTarget.length > 0) {
      console.error(
        "  ❌ Refusing to run: the target ENUM drops values the live column uses.",
      );
      console.error(`     live:   ${formatEnum(liveTypes)}`);
      console.error(`     target: ${formatEnum(TARGET_TYPES)}`);
      console.error(`     missing: ${formatEnum(missingFromTarget)}`);
      console.error(
        "     Existing rows would become invalid. Inspect and migrate by hand.",
      );
      process.exit(1);
    }

    console.log(`  ℹ️  live ENUM: ${formatEnum(liveTypes)}`);

    await pool.query(
      `ALTER TABLE QueueOrganization
         MODIFY COLUMN queueOrganizationType
           ENUM(${formatEnum(TARGET_TYPES)}) NOT NULL`,
    );
    console.log("  ✅ queueOrganizationType ENUM extended");

    console.log("\nMigration complete.");
    process.exit(0);
  } catch (error) {
    console.error(`  ❌ Migration failed: ${error.message}`);
    process.exit(1);
  }
})();