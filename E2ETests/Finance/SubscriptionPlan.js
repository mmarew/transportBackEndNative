// CRUD for SubscriptionPlan
// Defines available subscription tiers for drivers (Free 30 days, 1 month, 3 months, 1 year)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/subscriptionPlan";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetSubscriptionPlans = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ SubscriptionPlans fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetSubscriptionPlans:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateSubscriptionPlan = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      planName: "E2E Test Plan " + Date.now(),
      isFree: false,
      durationInDays: 30,
      description: "E2E test subscription plan",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ SubscriptionPlan created:", result.data.subscriptionPlanUniqueId || result.data.data?.subscriptionPlanUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateSubscriptionPlan:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateSubscriptionPlan = async ({ user, uniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = uniqueId || cache.data?.[0]?.subscriptionPlanUniqueId;
    if (!id) throw new Error("No subscriptionPlanUniqueId found to update");
    const defaultPayload = { planName: "Updated E2E Test Plan", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ SubscriptionPlan updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateSubscriptionPlan:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteSubscriptionPlan = async ({ user, uniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = uniqueId || cache.data?.[0]?.subscriptionPlanUniqueId;
    if (!id) throw new Error("No subscriptionPlanUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ SubscriptionPlan deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteSubscriptionPlan:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testSubscriptionPlanWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── SubscriptionPlan Workflow ──");

  await testGetSubscriptionPlans({ user });

  const created = await testCreateSubscriptionPlan({ user });
  const uniqueId = created?.subscriptionPlanUniqueId || created?.data?.subscriptionPlanUniqueId;
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetSubscriptionPlans({ user });
  await testUpdateSubscriptionPlan({ user, uniqueId });
  await testGetSubscriptionPlans({ user });
  await testDeleteSubscriptionPlan({ user, uniqueId });
  await testGetSubscriptionPlans({ user });

  console.log("── SubscriptionPlan Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  testSubscriptionPlanWorkflow,
  testGetSubscriptionPlans,
  testCreateSubscriptionPlan,
  testUpdateSubscriptionPlan,
  testDeleteSubscriptionPlan,
};
