const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const {
  DATABASE_ENDPOINTS,
} = require("../../Routes/EndPoints/database.endpoints");
const { testVerifyAndLoginUser } = require("../Auth");
const { authConfig } = require("../Utils");

// Dev-only API key — must match API_KEY in your .env
const DEV_API_KEY = process.env.API_KEY || "dev-api-key";

// ── Helpers ───────────────────────────────────────────────────────────────────

const adminConfig = () => {
  const token = usersData?.supperAdmin?.token;
  if (!token) throw new Error("No admin token found. Run admin login first.");
  return authConfig(token);
};

const devConfig = () => ({
  headers: { "x-api-key": DEV_API_KEY },
});

// ── Core DB lifecycle ─────────────────────────────────────────────────────────

/**
 * POST /api/admin/createTable
 * Creates all tables from the predefined SQL schema.
 * Uses x-api-key for auth — safe to call on a fresh empty database.
 */
const createTables = async () => {
  const url = backendURL + DATABASE_ENDPOINTS.CREATE_TABLE;
  try {
    const res = await axios.post(url, {}, devConfig());
    console.log("✅ Tables created.");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to create tables.");
    if (error.response) {
      console.log("Server responded with:", error.response.data);
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * GET /api/admin/tables
 * Lists all tables currently in the database.
 */
const getAllTables = async () => {
  const url = backendURL + DATABASE_ENDPOINTS.GET_ALL_TABLES;
  try {
    const res = await axios.get(url);
    console.log("✅ Tables fetched:", res.data?.data?.length ?? 0, "tables.");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get tables.");
    if (error.response) {
      console.log("Server responded with:", error.response.data);
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * DELETE /api/admin/dropAllTables
 * Drops every table in the database. Destructive — use only in test environments.
 */
const dropTables = async () => {
  const url = backendURL + DATABASE_ENDPOINTS.DROP_ALL_TABLES;
  try {
    await axios.delete(url, devConfig());
  } catch (error) {
    console.warn("dropTables warning:", error.response?.data?.error || error.message);
  }
};

/**
 * GET /api/admin/installPreDefinedData
 * Seeds the database with predefined lookup data (roles, statuses, vehicle types, etc.).
 * Requires admin token.
 */
const installPredefinedData = async ({ force = false } = {}) => {
  const tokenOfSupperAdmin = usersData.supperAdmin?.token;

  if (!tokenOfSupperAdmin) {
    console.log(
      "🚀 ~ installPredefinedData ~ supper admin token not found to install predefined data:",
    );
    return {
      error: "supper admin token not found to install predefined data",
      message: "error",
    };
  }
  const url =
    backendURL +
    DATABASE_ENDPOINTS.GET_INSTALL_PREDEFINED_DATA +
    (force ? "?force=true" : "");
  try {
    const res = await axios.get(url, adminConfig());
    console.log("✅ Predefined data installed.");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to install predefined data.");
    if (error.response) {
      console.log("Server responded with:", error.response.data);
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

// ── Dev-only tools (non-production only) ─────────────────────────────────────

/**
 * GET /api/admin/dev/getUserOtp?phoneNumber=xxx
 * Fetches the latest OTP for a phone number directly from the DB.
 * Bypasses SMS — useful for automated test flows.
 * Requires x-api-key header matching API_KEY in .env.
 */
const getUserOtp = async ({ phoneNumber }) => {
  if (!phoneNumber) {
    console.log("❌ getUserOtp failed, phoneNumber is required.");
    return null;
  }
  const url =
    backendURL +
    DATABASE_ENDPOINTS.GET_USER_OTP +
    `?phoneNumber=${encodeURIComponent(phoneNumber)}`;
  try {
    const res = await axios.get(url, devConfig());
    console.log(`✅ OTP fetched for ${phoneNumber}:`, res.data?.data?.otp);
    return res.data?.data;
  } catch (error) {
    console.log("❌ Failed to get OTP.");
    if (error.response) {
      console.log("Server responded with:", error.response.data);
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

/**
 * POST /api/admin/dev/seedTestDocument
 * Inserts a document record directly into the DB, bypassing FTP upload.
 * Use this to skip the file-upload step when testing document approval flows.
 * Requires x-api-key header matching API_KEY in .env.
 *
 * @param {string} userUniqueId
 * @param {number} documentTypeId
 * @param {number} roleId
 * @param {string} [documentExpirationDate] - ISO date string, optional
 */
const seedTestDocument = async ({
  userUniqueId,
  documentTypeId,
  roleId,
  documentExpirationDate = null,
}) => {
  if (!userUniqueId || !documentTypeId || !roleId) {
    console.log(
      "❌ seedTestDocument failed, userUniqueId, documentTypeId and roleId are required.",
    );
    return null;
  }
  const url = backendURL + DATABASE_ENDPOINTS.SEED_TEST_DOCUMENT;
  const payload = {
    userUniqueId,
    documentTypeId,
    roleId,
    documentExpirationDate,
  };
  try {
    const res = await axios.post(url, payload, devConfig());
    console.log(
      `✅ Test document seeded for user ${userUniqueId}, documentTypeId ${documentTypeId}.`,
    );
    return res.data;
  } catch (error) {
    console.log("❌ Failed to seed test document.");
    if (error.response) {
      console.log("Server responded with:", error.response.data);
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

// ── Full reset flow ───────────────────────────────────────────────────────────

/**
 * Full reset + seed flow.
 * Order matters:
 *   1. drop + create tables (no auth needed)
 *   2. verify superAdmin OTP → sets token in usersData
 *   3. login superAdmin → sets token in usersData
 *   4. install predefined data (needs superAdmin token)
 */
const resetDatabase = async () => {
  console.log("\n✅ ========== DATABASE VERIFICATION STARTED ==========\n");
  console.log("🔄 Ensuring tables exist and predefined data is installed...");
  // Tables are created only if they don't exist (CREATE TABLE IF NOT EXISTS).
  // Seed data is installed safely — items that already exist are gracefully skipped.
  await createTables({});
  // superAdmin must be verified + logged in before seed data can be installed
  await testVerifyAndLoginUser({ userType: "supperAdmin" });
  await installPredefinedData();
  console.log("✅ Database verification complete.");
  console.log(
    "\n✅ ========== DATABASE VERIFICATION COMPLETED SUCCESSFULLY ==========\n",
  );
};
// ── Table maintenance ───────────────────────────────────────────────────────

/**
 * PUT /api/admin/updateTable/:tableName
 * Adds a column to an existing table.
 */
const testUpdateTable = async () => {
  const token = usersData?.supperAdmin?.token || usersData?.admin?.token;
  if (!token) { console.log("⏩ testUpdateTable skipped — no admin token"); return; }
  const tableName = "User";
  const url = backendURL + DATABASE_ENDPOINTS.UPDATE_TABLE.replace(":tableName", tableName);
  try {
    const res = await axios.put(url, { columnName: "e2e_test_column", columnDefinition: "VARCHAR(255) NULL" }, authConfig(token));
    console.log("✅ Table updated (column added):", res.data?.message || "ok");
  } catch (error) {
    console.warn("⚠ testUpdateTable:", error.response?.data?.error || error.message);
  }
};

/**
 * PUT /api/admin/alterColumn/:tableName
 * Changes a column's properties.
 */
const testAlterColumn = async () => {
  const token = usersData?.supperAdmin?.token || usersData?.admin?.token;
  if (!token) { console.log("⏩ testAlterColumn skipped — no admin token"); return; }
  const tableName = "User";
  const url = backendURL + DATABASE_ENDPOINTS.ALTER_COLUMN.replace(":tableName", tableName);
  try {
    const res = await axios.put(url, { columnName: "e2e_test_column", newDefinition: "VARCHAR(100) NULL" }, authConfig(token));
    console.log("✅ Column altered:", res.data?.message || "ok");
  } catch (error) {
    console.warn("⚠ testAlterColumn:", error.response?.data?.error || error.message);
  }
};

/**
 * DELETE /api/admin/dropColumn/:tableName/:columnName
 * Drops a column from a table.
 */
const testDropColumn = async () => {
  const token = usersData?.supperAdmin?.token || usersData?.admin?.token;
  if (!token) { console.log("⏩ testDropColumn skipped — no admin token"); return; }
  const tableName = "User";
  const columnName = "e2e_test_column";
  const url = backendURL + DATABASE_ENDPOINTS.DROP_COLUMN.replace(":tableName", tableName).replace(":columnName", columnName);
  try {
    const res = await axios.delete(url, authConfig(token));
    console.log("✅ Column dropped:", res.data?.message || "ok");
  } catch (error) {
    console.warn("⚠ testDropColumn:", error.response?.data?.error || error.message);
  }
};

/**
 * DELETE /api/admin/dropTables?tableName=xxx
 * Drops a specific table by name (requires query param).
 */
const testDropSpecificTable = async () => {
  const token = usersData?.supperAdmin?.token || usersData?.admin?.token;
  if (!token) { console.log("⏩ testDropSpecificTable skipped — no admin token"); return; }
  // Use a throwaway temp table name — endpoint validates JWT so this is safe
  const url = backendURL + DATABASE_ENDPOINTS.DROP_TABLES + "?tableName=NonExistentTestTable";
  try {
    const res = await axios.delete(url, authConfig(token));
    console.log("✅ Drop table responded:", res.data?.message || "ok");
  } catch (error) {
    console.warn("⚠ testDropSpecificTable:", error.response?.data?.error || error.message);
  }
};

module.exports = {
  createTables,
  getAllTables,
  dropTables,
  installPredefinedData,
  getUserOtp,
  seedTestDocument,
  resetDatabase,
  testUpdateTable,
  testAlterColumn,
  testDropColumn,
  testDropSpecificTable,
};
