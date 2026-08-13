/* eslint-disable no-console */
// One-off migration runner: applies Database/Migrations/add_loading_stages.sql
// to the configured database (reads the same .env the server uses).
// Usage: node Database/Migrations/run_loading_stages_migration.js
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
    const sql = fs.readFileSync(path.join(__dirname, "add_loading_stages.sql"), "utf8");
    // Split: the status INSERT is idempotent; the ALTER must only run if columns are missing.
    const alterIdx = sql.indexOf("ALTER TABLE");
    const insertSql = sql.slice(0, alterIdx);
    const alterSql = sql.slice(alterIdx);
    await conn.query(insertSql);
    console.log("✅ Status rows ensured.");

    const [existingCols] = await conn.query("SHOW COLUMNS FROM Journey");
    const existingNames = new Set(existingCols.map(c => c.Field));
    const needed = [
      "journeyGoingToLoadingLat",
      "journeyGoingToLoadingLng",
      "journeyLoadingStartedLat",
      "journeyLoadingStartedLng",
      "journeyLoadingCompletedLat",
      "journeyLoadingCompletedLng",
      "loadingStartedAt",
      "loadingCompletedAt",
      "journeyProofOfLoading",
    ];
    const missing = needed.filter(col => !existingNames.has(col));
    if (missing.length > 0) {
      await conn.query(alterSql);
      console.log("✅ Journey columns added.");
    } else {
      console.log("⏭️  Journey columns already present, skipping ALTER.");
    }

    const [statusRows] = await conn.query(
      "SELECT journeyStatusId, journeyStatusName FROM JourneyStatus WHERE journeyStatusId IN (18,19,20) ORDER BY journeyStatusId",
    );
    console.log("Statuses now present:", statusRows);

    const [cols] = await conn.query(
      "SHOW COLUMNS FROM Journey LIKE 'journey%Loading%'",
    );
    const [cols2] = await conn.query("SHOW COLUMNS FROM Journey LIKE 'loading%'");
    const [cols3] = await conn.query("SHOW COLUMNS FROM Journey LIKE 'journeyProofOfLoading'");
    console.log("Journey columns:", [...cols, ...cols2, ...cols3].map(c => c.Field));
  } finally {
    await conn.end();
  }
})().catch(err => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
