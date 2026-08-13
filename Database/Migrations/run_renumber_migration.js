/* eslint-disable no-console */
// One-off migration runner: applies Database/Migrations/renumber_loading_stages.sql
// to the configured database (reads the same .env the server uses).
// Usage: node Database/Migrations/run_renumber_migration.js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE, DB_SOCKET_PATH } = process.env;

(async () => {
  const conn = await mysql.createConnection({
    host: DB_HOST || "localhost",
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    socketPath: DB_SOCKET_PATH || undefined,
    multipleStatements: true,
  });
  try {
    // E2E test runs leave throwaway E2E_TEST_JOURNEY_STATUS_* rows behind
    // (nothing references them — verified 0 FK rows). Purge them so the +100
    // renumber shift doesn't collide.
    const [purged] = await conn.query(
      "DELETE FROM JourneyStatus WHERE journeyStatusId > 20 AND journeyStatusName LIKE 'E2E_TEST_JOURNEY_STATUS_%'",
    );
    console.log(`🧹 Purged ${purged.affectedRows} E2E test status rows.`);

    const sql = fs.readFileSync(path.join(__dirname, "renumber_loading_stages.sql"), "utf8");
    await conn.query(sql);
    console.log("✅ Renumber migration applied.");

    const [statusRows] = await conn.query(
      "SELECT journeyStatusId, journeyStatusName FROM JourneyStatus ORDER BY journeyStatusId",
    );
    console.log("JourneyStatus now:");
    statusRows.forEach(r => console.log(`  ${r.journeyStatusId}  ${r.journeyStatusName}`));

    const [counts] = await conn.query(
      `SELECT
        (SELECT COUNT(*) FROM Journey WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badJourney,
        (SELECT COUNT(*) FROM JourneyDecisions WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badDecisions,
        (SELECT COUNT(*) FROM DriverRequest WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badDriverReq,
        (SELECT COUNT(*) FROM ShipperRequest WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badShipperReq,
        (SELECT COUNT(*) FROM ShipperRequestBatch WHERE journeyStatusId NOT BETWEEN 1 AND 20) AS badBatch`,
    );
    console.log("Out-of-range status rows (expect all 0):", counts[0]);
  } finally {
    await conn.end();
  }
})().catch(err => {
  console.error("❌ Renumber migration failed:", err.message);
  process.exit(1);
});
