// CRUD for Company Ban
// Admin bans a transport company after delinquency threshold is crossed

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/admin/delinquency/bans";
const cache = { data: null };

// ── GET all company bans ───────────────────────────────────────────────────────
const testGetCompanyBans = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Company bans fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompanyBans:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE company ban ─────────────────────────────────────────────────────────
const testBanCompany = async ({ user, companyUniqueId, companyDelinquencyUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const targetCompany = companyUniqueId || usersData?.companyAdmin?.companies?.[0]?.companyUniqueId;
    if (!targetCompany) {
      console.warn("⏩ testBanCompany skipped — no companyUniqueId available");
      return { skipped: true };
    }

    if (!companyDelinquencyUniqueId) {
      console.warn("⏩ testBanCompany skipped — companyDelinquencyUniqueId required");
      return { skipped: true };
    }

    const defaultPayload = {
      companyUniqueId: targetCompany,
      companyDelinquencyUniqueId,
      banReason: "E2E test ban — repeated policy violations",
      banDurationDays: 3,
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ Company banned:", result.data.companyBanUniqueId || result.data.data?.companyBanUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testBanCompany:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UNBAN company ──────────────────────────────────────────────────────────────
const testUnbanCompany = async ({ user, companyBanUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyBanUniqueId || cache.data?.[0]?.companyBanUniqueId;
    if (!id) throw new Error("No companyBanUniqueId found to unban");
    const result = await axios.patch(`${backendURL}${BASE_URL}/${id}/unban`, {}, authConfig(token));
    console.log("✅ Company unbanned:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUnbanCompany:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCompanyBanWorkflow = async ({
  user = usersData.admin,
  companyDelinquencyUniqueId,
} = {}) => {
  console.log("\n── Company Ban Workflow ──");

  await testGetCompanyBans({ user });

  const banResult = await testBanCompany({ user, companyDelinquencyUniqueId });
  if (banResult?.skipped) {
    console.log("⏩ Skipped — run company delinquency workflow first to get companyDelinquencyUniqueId");
    return { skipped: true };
  }

  const companyBanUniqueId = banResult?.companyBanUniqueId || banResult?.data?.companyBanUniqueId;
  if (!companyBanUniqueId) {
    console.warn("⚠️  No ban ID returned — cannot unban");
    return { skipped: true };
  }

  // GET bans after creation
  await testGetCompanyBans({ user });

  // UNBAN at end of test to restore state
  await testUnbanCompany({ user, companyBanUniqueId });

  // GET after unban
  await testGetCompanyBans({ user });

  console.log("── Company Ban Workflow complete ──\n");
  return { companyBanUniqueId };
};

module.exports = {
  testCompanyBanWorkflow,
  testGetCompanyBans,
  testBanCompany,
  testUnbanCompany,
};
