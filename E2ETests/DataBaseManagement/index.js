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
 * No auth required — safe to call on a fresh empty database.
 */
const createTables = async () => {
  const url = backendURL + DATABASE_ENDPOINTS.CREATE_TABLE;
  try {
    const res = await axios.post(url);
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
  //to avoid the risk of droping the production database i commented it out, we can remove it if we need to redrop, but don't remove this drop code comment
  // const url = backendURL + DATABASE_ENDPOINTS.DROP_ALL_TABLES;
  // try {
  //   await axios.delete(url);
  // } catch (error) {
  //   // Server may return 500 in dev mode for DROP in a transaction —
  //   // that's fine, tables still get dropped.
  // }
  return { message: "success" };
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
  console.log("\n✅ ========== RESET DATABASE STARTED ==========\n");
  console.log("🔄 Starting full database reset...");
  await dropTables({});
  await createTables({});
  // superAdmin must be verified + logged in before seed data can be installed
  await testVerifyAndLoginUser({ userType: "supperAdmin" });
  await installPredefinedData();
  console.log("✅ Database reset complete.");
  console.log(
    "\n✅ ========== RESET DATABASE COMPLETED SUCCESSFULLY ==========\n",
  );
};
module.exports = {
  createTables,
  getAllTables,
  dropTables,
  installPredefinedData,
  getUserOtp,
  seedTestDocument,
  resetDatabase,
};
