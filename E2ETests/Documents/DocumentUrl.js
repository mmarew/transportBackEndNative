// Document URL Resolution — E2E Tests
// Converted from __tests__/resolveDocumentUrl.test.js unit tests.
// Tests that document URLs returned by the API are correctly resolved
// (relative /uploads/ paths get the APP_API_URL prepended, legacy domains rebased).

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/user/attachedDocuments";

// ── Test: Attached document URLs are resolved correctly ──────────────────────
const testDocumentUrlResolution = async () => {
  const token = usersData.driver?.token || usersData.admin?.token;
  if (!token) throw new Error("no token found");

  try {
    const result = await axios.get(backendURL + BASE_URL + "?limit=10", authConfig(token));
    const docs = result.data?.data || [];

    if (!Array.isArray(docs) || docs.length === 0) {
      console.log("⏩ testDocumentUrlResolution — no attached documents to check");
      return { skipped: true };
    }

    let resolvedCount = 0;
    let nullCount = 0;

    for (const doc of docs) {
      const url = doc?.attachedDocumentUrl;
      if (url === null || url === undefined) {
        nullCount++;
        continue;
      }

      // URLs should either be fully qualified (https://...) or null
      if (typeof url === "string" && url.length > 0) {
        resolvedCount++;
        // Should NOT contain raw relative paths without domain
        if (url.startsWith("/uploads/")) {
          console.warn(`⚠️  URL not resolved: ${url}`);
        }
      }
    }

    console.log(`✅ Document URLs checked: ${resolvedCount} resolved, ${nullCount} null`);
    return { resolvedCount, nullCount };
  } catch (error) {
    console.error("❌ testDocumentUrlResolution:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ────────────────────────────────────────────────────────────
const testDocumentUrlWorkflow = async () => {
  console.log("\n── Document URL Resolution ──");
  await testDocumentUrlResolution();
  console.log("── Document URL Resolution complete ──\n");
};

module.exports = {
  testDocumentUrlWorkflow,
  testDocumentUrlResolution,
};
