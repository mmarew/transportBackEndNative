/* eslint-disable no-console */
// One-off migration runner: shifts OLD-numbered journey-status rows in the data
// tables to the NEW numbering (renumber_loading_stages.sql was applied to the
// JourneyStatus catalog but not to the data rows created before the renumber).
//
// Old → New (statuses 1-4 unchanged):
//   5 journeyStarted → 8, 6 journeyCompleted → 9, 7 cancelledByShipper → 10,
//   8 rejectedByShipper → 11, 9 cancelledByDriver → 12, 10 cancelledByAdmin → 13,
//   11 completedByAdmin → 14, 12 cancelledBySystem → 15, 13 noAnswerFromDriver → 16,
//   14 notSelectedInBid → 17, 15 rejectedByDriver → 18,
//   16 replacedByCompanyAssignment → 19, 17 partiallyCancelled → 20,
//   18 goToLoadingPlace → 5, 19 loading → 6, 20 loaded → 7
//
// Safety: only rows created BEFORE the renumber are shifted, so genuinely
// new-numbered rows (created after) are never touched.
// Usage: node Database/Migrations/run_data_renumber_migration.js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mysql = require("mysql2/promise");

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE, DB_SOCKET_PATH } = process.env;

// Rows created before the renumber (2026-08-13, EAT) are OLD-numbered.
const CUTOFF = "2026-08-13 00:00:00";

// old → new mapping (statuses 1-4 unchanged, not listed)
const MAP = {
  5: 8, 6: 9, 7: 10, 8: 11, 9: 12, 10: 13, 11: 14, 12: 15, 13: 16,
  14: 17, 15: 18, 16: 19, 17: 20, 18: 5, 19: 6, 20: 7,
};

const TABLES = [
  { name: "ShipperRequest", created: "shipperRequestCreatedAt" },
  { name: "ShipperRequestBatch", created: "batchCreatedAt" },
  { name: "DriverRequest", created: "driverRequestCreatedAt" },
  { name: "JourneyDecisions", created: "journeyDecisionCreatedAt" },
  { name: "Journey", created: "journeyCreatedAt" },
];

const OLD_IDS = Object.keys(MAP).join(",");

(async () => {
  const conn = await mysql.createConnection({
    host: DB_HOST || "localhost",
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    socketPath: DB_SOCKET_PATH || undefined,
  });
  try {
    console.log("🔎 Before — old-numbered rows:");
    for (const t of TABLES) {
      const [rows] = await conn.query(
        `SELECT journeyStatusId, COUNT(*) cnt FROM ${t.name}
         WHERE ${t.created} < ? AND journeyStatusId IN (${OLD_IDS})
         GROUP BY journeyStatusId ORDER BY journeyStatusId`,
        [CUTOFF],
      );
      console.log(`  ${t.name}:`, rows.length ? rows.map(r => `${r.journeyStatusId}->${r.cnt}`).join(", ") : "none");
    }

    await conn.beginTransaction();
    let total = 0;
    for (const t of TABLES) {
      // Shift each old status to its new one via CASE (targets already exist in
      // the JourneyStatus catalog, so no +100 dance is needed here).
      const cases = Object.entries(MAP)
        .map(([old, next]) => `WHEN ${old} THEN ${next}`)
        .join(" ");
      const [result] = await conn.query(
        `UPDATE ${t.name}
         SET journeyStatusId = CASE journeyStatusId ${cases} END
         WHERE ${t.created} < ? AND journeyStatusId IN (${OLD_IDS})`,
        [CUTOFF],
      );
      total += result.affectedRows;
      console.log(`  ✅ ${t.name}: ${result.affectedRows} rows shifted`);
    }
    await conn.commit();
    console.log(`\n🎉 Committed — ${total} rows total.`);

    console.log("\n🔎 After — remaining old-numbered rows (expect none):");
    for (const t of TABLES) {
      const [rows] = await conn.query(
        `SELECT journeyStatusId, COUNT(*) cnt FROM ${t.name}
         WHERE ${t.created} < ? AND journeyStatusId IN (${OLD_IDS})
         GROUP BY journeyStatusId`,
        [CUTOFF],
      );
      console.log(`  ${t.name}:`, rows.length ? rows.map(r => `${r.journeyStatusId}->${r.cnt}`).join(", ") : "none ✓");
    }

    const [counts] = await conn.query(
      `SELECT
        (SELECT COUNT(*) FROM Journey WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badJourney,
        (SELECT COUNT(*) FROM JourneyDecisions WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badDecisions,
        (SELECT COUNT(*) FROM DriverRequest WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badDriverReq,
        (SELECT COUNT(*) FROM ShipperRequest WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badShipperReq,
        (SELECT COUNT(*) FROM ShipperRequestBatch WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badBatch`,
    );
    console.log("Out-of-range status rows (expect all 0):", counts[0]);
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("❌ Migration failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
