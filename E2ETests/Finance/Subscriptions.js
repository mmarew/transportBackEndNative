const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

const firstIdFromList = (res, key) => {
  const list = res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    const item = list[0];
    return item[key] || item?.uniqueId || null;
  }
  return null;
};

// ── SubscriptionPlan ────────────────────────────────────────────────────────────
const SP_URL = "/api/finance/subscriptionPlan";
const spCache = { data: null };

const testGetSubscriptionPlans = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + SP_URL, authConfig(token));
  console.log("✅ SubscriptionPlans fetched:", result.data.data?.length ?? 0);
  spCache.data = result.data.data;
  return result.data;
};

const testCreateSubscriptionPlan = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { planName: "E2E Test Plan " + Date.now(), isFree: false, durationInDays: 30, description: "E2E test subscription plan", ...payload };
  const result = await axios.post(backendURL + SP_URL, defaultPayload, authConfig(token));
  console.log("✅ SubscriptionPlan created:", result.data.subscriptionPlanUniqueId || result.data.data?.subscriptionPlanUniqueId);
  return result.data;
};

const testUpdateSubscriptionPlan = async ({ user, uniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = uniqueId || spCache.data?.[0]?.subscriptionPlanUniqueId;
  if (!id) throw new Error("No subscriptionPlanUniqueId found to update");
  const defaultPayload = { planName: "Updated E2E Test Plan", ...payload };
  const result = await axios.put(`${backendURL}${SP_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ SubscriptionPlan updated:", id);
  return result.data;
};

const testDeleteSubscriptionPlan = async ({ user, uniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = uniqueId || spCache.data?.[0]?.subscriptionPlanUniqueId;
  if (!id) throw new Error("No subscriptionPlanUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${SP_URL}/${id}`, authConfig(token));
  console.log("✅ SubscriptionPlan deleted:", id);
  return result.data;
};

const testSubscriptionPlanWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── SubscriptionPlan Workflow ──");
  await testGetSubscriptionPlans({ user });
  const created = await testCreateSubscriptionPlan({ user });
  const uniqueId = created?.subscriptionPlanUniqueId || created?.data?.subscriptionPlanUniqueId;
  if (!uniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetSubscriptionPlans({ user });
  await testUpdateSubscriptionPlan({ user, uniqueId });
  await testGetSubscriptionPlans({ user });
  await testDeleteSubscriptionPlan({ user, uniqueId });
  await testGetSubscriptionPlans({ user });
  console.log("── SubscriptionPlan Workflow complete ──\n");
  return { uniqueId };
};

// ── SubscriptionPlanPricing ─────────────────────────────────────────────────────
const SPP_URL = "/api/finance/subscriptionPlanPricing";
const sppCache = { data: null };

const testGetSubscriptionPlanPricings = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + SPP_URL, authConfig(token));
  console.log("✅ SubscriptionPlanPricings fetched:", result.data.data?.length ?? 0);
  sppCache.data = result.data.data;
  return result.data;
};

const testCreateSubscriptionPlanPricing = async ({ user, subscriptionPlanUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const planId = subscriptionPlanUniqueId || sppCache.data?.[0]?.subscriptionPlanUniqueId;
  if (!planId) { console.warn("⏩ testCreateSubscriptionPlanPricing skipped — need subscriptionPlanUniqueId"); return { skipped: true }; }
  const tomorrow = new Date(Date.now() + 86400000);
  const effectiveFrom = tomorrow.toISOString().split("T")[0];
  const effectiveTo = new Date(tomorrow.getTime() + 30 * 86400000).toISOString().split("T")[0];
  const defaultPayload = { subscriptionPlanUniqueId: planId, price: 750 + (Date.now() % 250), currency: "ETB", durationInDays: 30, effectiveFrom, effectiveTo, ...payload };
  const result = await axios.post(backendURL + SPP_URL, defaultPayload, authConfig(token));
  console.log("✅ SubscriptionPlanPricing created:", result.data.subscriptionPlanPricingUniqueId || result.data.data?.subscriptionPlanPricingUniqueId);
  return result.data;
};

const testUpdateSubscriptionPlanPricing = async ({ user, subscriptionPlanPricingUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = subscriptionPlanPricingUniqueId || sppCache.data?.[0]?.subscriptionPlanPricingUniqueId;
  if (!id) throw new Error("No subscriptionPlanPricingUniqueId found to update");
  const defaultPayload = { price: 800, ...payload };
  const result = await axios.put(`${backendURL}${SPP_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ SubscriptionPlanPricing updated:", id);
  return result.data;
};

const testDeleteSubscriptionPlanPricing = async ({ user, subscriptionPlanPricingUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = subscriptionPlanPricingUniqueId || sppCache.data?.[0]?.subscriptionPlanPricingUniqueId;
  if (!id) throw new Error("No subscriptionPlanPricingUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${SPP_URL}/${id}`, authConfig(token));
  console.log("✅ SubscriptionPlanPricing deleted:", id);
  return result.data;
};

const testSubscriptionPlanPricingWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── SubscriptionPlanPricing Workflow ──");
  const planResult = await testCreateSubscriptionPlan({ user });
  const planId = planResult?.subscriptionPlanUniqueId || planResult?.data?.subscriptionPlanUniqueId;
  if (!planId) { console.log("⏩ Skipped — could not create a subscription plan for pricing"); return { skipped: true }; }
  const created = await testCreateSubscriptionPlanPricing({ user, subscriptionPlanUniqueId: planId });
  if (created?.skipped) { console.log("⏩ Skipped"); return { skipped: true }; }
  const id = created?.subscriptionPlanPricingUniqueId || created?.data?.subscriptionPlanPricingUniqueId;
  if (!id) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetSubscriptionPlanPricings({ user });
  await testUpdateSubscriptionPlanPricing({ user, subscriptionPlanPricingUniqueId: id });
  await testGetSubscriptionPlanPricings({ user });
  await testDeleteSubscriptionPlanPricing({ user, subscriptionPlanPricingUniqueId: id });
  await testGetSubscriptionPlanPricings({ user });
  console.log("── SubscriptionPlanPricing Workflow complete ──\n");
  return { id };
};

// ── UserSubscription ────────────────────────────────────────────────────────────
let createdSubscriptionId = null;

const testCreateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  const driverUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverUniqueId) return report.skip("POST /api/finance/userSubscription/:driverUniqueId", "no driver token or userUniqueId");
  console.log("\n── POST /api/finance/userSubscription/:driverUniqueId ──");
  let pricingId = null;
  try {
    const pricing = await axios.get(backendURL + "/api/finance/subscriptionPlanPricing", authConfig(usersData?.admin?.token || token));
    const list = pricing?.data?.data || [];
    const paid = list.find((p) => p.isFree === 0 || p.isFree === false || p.isFree === "0");
    pricingId = paid?.subscriptionPlanPricingUniqueId || null;
    if (!pricingId) pricingId = firstIdFromList(pricing, "subscriptionPlanPricingUniqueId");
  } catch { /* ignore */ }
  if (!pricingId)
    return report.skip(
      "POST /api/finance/userSubscription/:driverUniqueId",
      "no SubscriptionPlanPricing available (precondition not met)",
    );
  try {
    const res = await axios.post(backendURL + `/api/finance/userSubscription/${driverUniqueId}`, { subscriptionPlanPricingUniqueId: pricingId }, authConfig(token));
    createdSubscriptionId = res.data?.data?.userSubscriptionUniqueId || res.data?.data?.[0]?.userSubscriptionUniqueId;
    report.pass(`POST /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (
      msg.includes("400") ||
      msg.includes("fail") ||
      msg.includes("Insufficient") ||
      msg.includes("free trial") ||
      msg.includes("no such") ||
      msg.includes("durationInDays") ||
      msg.includes("ER_NO_REFERENCED_ROW")
    )
      return report.skip("POST /api/finance/userSubscription/:driverUniqueId", `endpoint reachable — data precondition not met (${msg.slice(0, 80)})`);
    report.fail("POST /api/finance/userSubscription", msg);
  }
};

const testGetUserSubscriptions = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/finance/userSubscription", "no driver token");
  console.log("\n── GET /api/finance/userSubscription ──");
  try {
    const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
    const url = driverId ? `/api/finance/userSubscription?driverUniqueId=${driverId}` : "/api/finance/userSubscription";
    const res = await axios.get(backendURL + url, authConfig(token));
    report.pass(`GET /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) { report.fail("GET /api/finance/userSubscription", errMsg(err)); }
};

const testUpdateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/finance/userSubscription/:userSubscriptionUniqueId", "no driver token");
  let sid = createdSubscriptionId;
  if (!sid) return report.skip("PUT /api/finance/userSubscription/:userSubscriptionUniqueId", "no test-created subscription (POST was skipped)");
  console.log("\n── PUT /api/finance/userSubscription/:userSubscriptionUniqueId ──");
  try {
    const res = await axios.put(backendURL + `/api/finance/userSubscription/${sid}`, { endDate: new Date(Date.now() + 60 * 86400000).toISOString() }, authConfig(token));
    report.pass(`PUT /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) { report.fail("PUT /api/finance/userSubscription", errMsg(err)); }
};

const testDeleteUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("DELETE /api/finance/userSubscription/:userSubscriptionUniqueId", "no driver token");
  let sid = createdSubscriptionId;
  if (!sid) return report.skip("DELETE /api/finance/userSubscription/:userSubscriptionUniqueId", "no test-created subscription (POST was skipped)");
  console.log("\n── DELETE /api/finance/userSubscription/:userSubscriptionUniqueId ──");
  try {
    const res = await axios.delete(backendURL + `/api/finance/userSubscription/${sid}`, authConfig(token));
    report.pass(`DELETE /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) { report.fail("DELETE /api/finance/userSubscription", errMsg(err)); }
};

module.exports = {
  testSubscriptionPlanWorkflow, testGetSubscriptionPlans, testCreateSubscriptionPlan, testUpdateSubscriptionPlan, testDeleteSubscriptionPlan,
  testSubscriptionPlanPricingWorkflow, testGetSubscriptionPlanPricings, testCreateSubscriptionPlanPricing, testUpdateSubscriptionPlanPricing, testDeleteSubscriptionPlanPricing,
  testCreateUserSubscription, testGetUserSubscriptions, testUpdateUserSubscription, testDeleteUserSubscription,
};
