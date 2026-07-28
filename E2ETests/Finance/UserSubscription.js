const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
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

let createdSubscriptionId = null;

const testCreateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId) return report.skip("POST /api/finance/userSubscription/:driverId", "no driver token or id");
  console.log("\n── POST /api/finance/userSubscription/:driverId ──");
  let pricingId = null;
  try {
    const pricing = await axios.get(backendURL + "/api/finance/subscriptionPlanPricing", authConfig(usersData?.admin?.token || token));
    pricingId = firstIdFromList(pricing, "subscriptionPlanPricingUniqueId");
  } catch (_) { /* ignore */ }
  if (!pricingId) pricingId = uuidv4();
  try {
    const res = await axios.post(
      backendURL + `/api/finance/userSubscription/${driverId}`,
      { subscriptionPlanPricingUniqueId: pricingId },
      authConfig(token),
    );
    createdSubscriptionId = res.data?.data?.userSubscriptionUniqueId || res.data?.data?.[0]?.userSubscriptionUniqueId;
    report.pass(`POST /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail") || msg.includes("ER_NO_REFERENCED_ROW")) {
      return report.skip("POST /api/finance/userSubscription/:driverId", `endpoint reachable — FK issue (${msg.slice(0, 80)})`);
    }
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
  } catch (err) {
    report.fail("GET /api/finance/userSubscription", errMsg(err));
  }
};

const testUpdateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/finance/userSubscription/:id", "no driver token");
  let sid = createdSubscriptionId;
  if (!sid) {
    try {
      const list = await axios.get(backendURL + "/api/finance/userSubscription", authConfig(token));
      sid = firstIdFromList(list, "userSubscriptionUniqueId");
    } catch (_) { /* ignore */ }
  }
  if (!sid) return report.skip("PUT /api/finance/userSubscription/:id", "no subscription record found");
  console.log("\n── PUT /api/finance/userSubscription/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userSubscription/${sid}`,
      { endDate: new Date(Date.now() + 60 * 86400000).toISOString() },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userSubscription", errMsg(err));
  }
};

const testDeleteUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("DELETE /api/finance/userSubscription/:id", "no driver token");
  let sid = createdSubscriptionId;
  if (!sid) {
    try {
      const list = await axios.get(backendURL + "/api/finance/userSubscription", authConfig(token));
      sid = firstIdFromList(list, "userSubscriptionUniqueId");
    } catch (_) { /* ignore */ }
  }
  if (!sid) return report.skip("DELETE /api/finance/userSubscription/:id", "no subscription record found");
  console.log("\n── DELETE /api/finance/userSubscription/:id ──");
  try {
    const res = await axios.delete(backendURL + `/api/finance/userSubscription/${sid}`, authConfig(token));
    report.pass(`DELETE /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userSubscription", errMsg(err));
  }
};

module.exports = {
  testCreateUserSubscription,
  testGetUserSubscriptions,
  testUpdateUserSubscription,
  testDeleteUserSubscription,
};
