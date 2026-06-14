// CRUD for SubscriptionPlanPricing
// Links a subscription plan to a price, duration, and effective date range

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/subscriptionPlanPricing";
const cache = { data: null };

const testGetSubscriptionPlanPricings = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ SubscriptionPlanPricings fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetSubscriptionPlanPricings:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateSubscriptionPlanPricing = async ({ user, subscriptionPlanUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    // Need a valid subscriptionPlanUniqueId — get from cache if not provided
    const planId = subscriptionPlanUniqueId || cache.data?.[0]?.subscriptionPlanUniqueId;
    if (!planId) {
      console.warn("⏩ testCreateSubscriptionPlanPricing skipped — need subscriptionPlanUniqueId");
      return { skipped: true };
    }

    const defaultPayload = {
      subscriptionPlanUniqueId: planId,
      price: 750,
      currency: "ETB",
      durationInDays: 30,
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ SubscriptionPlanPricing created:", result.data.subscriptionPlanPricingUniqueId || result.data.data?.subscriptionPlanPricingUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateSubscriptionPlanPricing:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateSubscriptionPlanPricing = async ({ user, subscriptionPlanPricingUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = subscriptionPlanPricingUniqueId || cache.data?.[0]?.subscriptionPlanPricingUniqueId;
    if (!id) throw new Error("No subscriptionPlanPricingUniqueId found to update");
    const defaultPayload = { price: 800, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ SubscriptionPlanPricing updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateSubscriptionPlanPricing:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteSubscriptionPlanPricing = async ({ user, subscriptionPlanPricingUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = subscriptionPlanPricingUniqueId || cache.data?.[0]?.subscriptionPlanPricingUniqueId;
    if (!id) throw new Error("No subscriptionPlanPricingUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ SubscriptionPlanPricing deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteSubscriptionPlanPricing:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testSubscriptionPlanPricingWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── SubscriptionPlanPricing Workflow ──");

  // Fetch existing pricings first to get a planId
  await testGetSubscriptionPlanPricings({ user });

  // Get a subscriptionPlanUniqueId from the first existing pricing record
  const planId = cache.data?.[0]?.subscriptionPlanUniqueId;

  const created = await testCreateSubscriptionPlanPricing({ user, subscriptionPlanUniqueId: planId });
  if (created?.skipped) {
    console.log("⏩ Skipped — run SubscriptionPlan workflow first");
    return { skipped: true };
  }

  const id = created?.subscriptionPlanPricingUniqueId || created?.data?.subscriptionPlanPricingUniqueId;
  if (!id) { console.warn("⚠️  No ID returned — cannot continue"); return { skipped: true }; }

  await testGetSubscriptionPlanPricings({ user });
  await testUpdateSubscriptionPlanPricing({ user, subscriptionPlanPricingUniqueId: id });
  await testGetSubscriptionPlanPricings({ user });
  await testDeleteSubscriptionPlanPricing({ user, subscriptionPlanPricingUniqueId: id });
  await testGetSubscriptionPlanPricings({ user });
  console.log("── SubscriptionPlanPricing Workflow complete ──\n");
  return { id };
};

module.exports = { testSubscriptionPlanPricingWorkflow, testGetSubscriptionPlanPricings, testCreateSubscriptionPlanPricing, testUpdateSubscriptionPlanPricing, testDeleteSubscriptionPlanPricing };
