const fs = require("fs");
const path = require("path");
const { pool } = require("../../Middleware/Database.config");


async function applyMigration() {
  const migrationPath = path.join(__dirname, "update_user_constraints.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Split by semicolon and filter out empty lines
  const queries = sql
    .split(";")
    .map(q => q.trim())
    .filter(q => q.length > 0 && !q.startsWith("--"));

  console.warn(`🚀 Starting migration: ${queries.length} queries to execute...\n`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const query of queries) {
      console.warn(`📝 Executing: ${query.substring(0, 50) // eslint-disable-line no-magic-numbers -- truncate log output}...`);
      await connection.query(query);
    }

    await connection.commit();
    console.warn("\n✅ Migration applied successfully! New columns are now in the database.");
  } catch (error) {
    await connection.rollback();
    console.error("\n❌ Migration failed. Transaction rolled back.");
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

applyMigration();
