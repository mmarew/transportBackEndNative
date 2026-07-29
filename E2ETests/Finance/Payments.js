const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { assert } = require("../Assert");
const { report } = require("../Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

// ── Payments ────────────────────────────────────────────────────────────────────
const PAYMENTS_URL = "/api/finance/payments";
const paymentsCache = { data: null };

const testGetPayments = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + PAYMENTS_URL, authConfig(token));
  assert.StatusCode(result, 200, "GET payments should return 200");
  assert.Truthy(result.data, "GET payments should return data");
  paymentsCache.data = result.data.data;
  return result.data;
};

const testGetPaymentById = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId = id || paymentsCache.data?.[0]?.paymentUniqueId || paymentsCache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found");
  const result = await axios.get(`${backendURL}${PAYMENTS_URL}/${paymentId}`, authConfig(token));
  assert.StatusCode(result, 200, "GET payment by ID should return 200");
  assert.Truthy(result.data?.data?.paymentUniqueId, "Payment should have paymentUniqueId");
  assert.Eq(result.data?.data?.paymentUniqueId, paymentId, "Returned payment ID should match requested");
  return result.data;
};

const testCreatePayment = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  assert.Truthy(token, "createPayment: token is required");
  const journeyId = payload?.journeyId || usersData?.driver?.lastJourneyDecisionUniqueId || usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  let paymentMethodUniqueId = payload?.paymentMethodUniqueId || paymentsCache.data?.[0]?.paymentMethodUniqueId;
  let paymentStatusUniqueId = payload?.paymentStatusUniqueId || paymentsCache.data?.[0]?.paymentStatusUniqueId;
  if (!journeyId) { console.warn("⏩ testCreatePayment skipped — no journeyId"); return { skipped: true }; }
  if (!paymentMethodUniqueId) {
    try { const pmRes = await axios.get(backendURL + "/api/finance/paymentMethod", authConfig(token)); const methods = pmRes?.data?.data; if (methods?.length) paymentMethodUniqueId = methods[0].paymentMethodUniqueId; } catch { /* ignore */ }
  }
  if (!paymentMethodUniqueId) { console.warn("⏩ testCreatePayment skipped — no paymentMethodUniqueId"); return { skipped: true }; }
  if (!paymentStatusUniqueId) {
    try { const psRes = await axios.get(backendURL + "/api/finance/paymentStatus", authConfig(token)); const statuses = psRes?.data?.data; if (statuses?.length) paymentStatusUniqueId = statuses[0].paymentStatusUniqueId; } catch { /* ignore */ }
  }
  if (!paymentStatusUniqueId) { console.warn("⏩ testCreatePayment skipped — no paymentStatusUniqueId"); return { skipped: true }; }
  const defaultPayload = { journeyId, amount: 5000, paymentMethodUniqueId, paymentStatusUniqueId, ...payload };
  const result = await axios.post(backendURL + PAYMENTS_URL, defaultPayload, authConfig(token));
  assert.StatusCode(result, 200, "POST payment should return 200");
  const paymentUniqueId = result.data?.data?.paymentUniqueId || result.data?.paymentUniqueId;
  assert.Truthy(paymentUniqueId, "Created payment should have a paymentUniqueId");
  return result.data;
};

const testUpdatePayment = async ({ user, id, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId = id || paymentsCache.data?.[0]?.paymentUniqueId || paymentsCache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found to update");
  const defaultPayload = { amount: 5500, ...payload };
  const result = await axios.put(`${backendURL}${PAYMENTS_URL}/${paymentId}`, defaultPayload, authConfig(token));
  assert.StatusCode(result, 200, "PUT payment should return 200");
  assert.Truthy(result.data?.data?.paymentId || result.data?.paymentId, "Updated payment should have paymentId");
  return result.data;
};

const testDeletePayment = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId = id || paymentsCache.data?.[0]?.paymentUniqueId || paymentsCache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found to delete");
  const result = await axios.delete(`${backendURL}${PAYMENTS_URL}/${paymentId}`, authConfig(token));
  assert.StatusCode(result, 200, "DELETE payment should return 200");
  return result.data;
};

const testPaymentsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Payments Workflow ──");
  try {
    const before = await testGetPayments({ user });
    report.pass("testGetPayments (before)");
    const countBefore = before?.data?.length || 0;
    const created = await testCreatePayment({ user });
    if (created?.skipped) { report.skip("Payments workflow", "missing journeyId"); return { skipped: true }; }
    report.pass("testCreatePayment");
    const paymentId = created?.data?.paymentUniqueId || created?.paymentUniqueId;
    assert.Truthy(paymentId, "Payment workflow: paymentId must be returned after create");
    assert.Truthy(created?.data?.amount || created?.amount, "Payment workflow: created payment should have amount");
    const afterCreate = await testGetPayments({ user });
    report.pass("testGetPayments (after create)");
    assert.Eq(afterCreate?.data?.length, countBefore + 1, "Payment count should increase by 1 after create");
    const byId = await testGetPaymentById({ user, id: paymentId });
    report.pass("testGetPaymentById");
    assert.Truthy(byId?.data?.paymentUniqueId, "Payment fetched by ID should have paymentUniqueId");
    await testUpdatePayment({ user, id: paymentId });
    report.pass("testUpdatePayment");
    await testDeletePayment({ user, id: paymentId });
    report.pass("testDeletePayment");
    const afterDelete = await testGetPayments({ user });
    report.pass("testGetPayments (after delete)");
    assert.Eq(afterDelete?.data?.length, countBefore, "Payment count should return to original after delete");
    console.log("── Payments Workflow complete ──\n");
    return { paymentId };
  } catch (error) {
    report.fail("Payments workflow", error);
    throw error;
  }
};

const testGetPaymentsByDateRange = async () => {
  const token = usersData?.admin?.token;
  const uid = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !uid) return report.skip("GET /api/finance/payments/:uid/:from/:to", "no admin token or driver uid");
  console.log("\n── GET /api/finance/payments/:uid/:from/:to ──");
  try {
    const res = await axios.get(backendURL + `/api/finance/payments/${uid}/2026-01-01/2026-12-31`, authConfig(token));
    report.pass(`GET /api/finance/payments/:uid/:from/:to — ${res.data?.message || "ok"}`);
  } catch (err) { report.fail("GET /api/finance/payments/:uid/:from/:to", errMsg(err)); }
};

// ── PaymentMethod ───────────────────────────────────────────────────────────────
const PM_URL = "/api/finance/paymentMethod";
const pmCache = { data: null };

const testGetPaymentMethods = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + PM_URL, authConfig(token));
  console.log("✅ PaymentMethods fetched:", result.data.data?.length ?? 0);
  pmCache.data = result.data.data;
  return result.data;
};

const testCreatePaymentMethod = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { paymentMethod: "e2e_test_method_" + Date.now(), ...payload };
  const result = await axios.post(backendURL + PM_URL, defaultPayload, authConfig(token));
  console.log("✅ PaymentMethod created:", result.data.paymentMethodUniqueId || result.data.data?.paymentMethodUniqueId);
  return result.data;
};

const testUpdatePaymentMethod = async ({ user, paymentMethodUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentMethodUniqueId || pmCache.data?.[0]?.paymentMethodUniqueId;
  if (!id) throw new Error("No paymentMethodUniqueId found to update");
  const defaultPayload = { paymentMethod: "e2e_updated_method", ...payload };
  const result = await axios.put(`${backendURL}${PM_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ PaymentMethod updated:", id);
  return result.data;
};

const testDeletePaymentMethod = async ({ user, paymentMethodUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentMethodUniqueId || pmCache.data?.[0]?.paymentMethodUniqueId;
  if (!id) throw new Error("No paymentMethodUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${PM_URL}/${id}`, authConfig(token));
  console.log("✅ PaymentMethod deleted:", id);
  return result.data;
};

const testPaymentMethodWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── PaymentMethod Workflow ──");
  await testGetPaymentMethods({ user });
  const created = await testCreatePaymentMethod({ user });
  const id = created?.paymentMethodUniqueId || created?.data?.paymentMethodUniqueId;
  if (!id) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetPaymentMethods({ user });
  await testUpdatePaymentMethod({ user, paymentMethodUniqueId: id });
  await testGetPaymentMethods({ user });
  await testDeletePaymentMethod({ user, paymentMethodUniqueId: id });
  await testGetPaymentMethods({ user });
  console.log("── PaymentMethod Workflow complete ──\n");
  return { id };
};

// ── PaymentStatus ───────────────────────────────────────────────────────────────
const PS_URL = "/api/finance/paymentStatus";
const psCache = { data: null };

const testGetPaymentStatuses = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + PS_URL, authConfig(token));
  console.log("✅ PaymentStatuses fetched:", result.data.data?.length ?? 0);
  psCache.data = result.data.data;
  return result.data;
};

const testCreatePaymentStatus = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { paymentStatus: "E2E_TEST_STATUS_" + Date.now(), ...payload };
  const result = await axios.post(backendURL + PS_URL, defaultPayload, authConfig(token));
  console.log("✅ PaymentStatus created:", result.data.paymentStatusUniqueId || result.data.data?.paymentStatusUniqueId);
  return result.data;
};

const testUpdatePaymentStatus = async ({ user, paymentStatusUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentStatusUniqueId || psCache.data?.[0]?.paymentStatusUniqueId;
  if (!id) throw new Error("No paymentStatusUniqueId found to update");
  const defaultPayload = { paymentStatus: "E2E_UPDATED_STATUS", ...payload };
  const result = await axios.put(`${backendURL}${PS_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ PaymentStatus updated:", id);
  return result.data;
};

const testDeletePaymentStatus = async ({ user, paymentStatusUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentStatusUniqueId || psCache.data?.[0]?.paymentStatusUniqueId;
  if (!id) throw new Error("No paymentStatusUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${PS_URL}/${id}`, authConfig(token));
  console.log("✅ PaymentStatus deleted:", id);
  return result.data;
};

const testPaymentStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── PaymentStatus Workflow ──");
  await testGetPaymentStatuses({ user });
  const created = await testCreatePaymentStatus({ user });
  const id = created?.paymentStatusUniqueId || created?.data?.paymentStatusUniqueId;
  if (!id) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetPaymentStatuses({ user });
  await testUpdatePaymentStatus({ user, paymentStatusUniqueId: id });
  await testGetPaymentStatuses({ user });
  await testDeletePaymentStatus({ user, paymentStatusUniqueId: id });
  await testGetPaymentStatuses({ user });
  console.log("── PaymentStatus Workflow complete ──\n");
  return { id };
};

// ── JourneyPayments ─────────────────────────────────────────────────────────────
const JP_URL = "/api/finance/journeyPayments";
const jpCache = { data: null };

const testGetJourneyPayments = async ({ user, filters = {} } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const query = new URLSearchParams(filters).toString();
  const url = query ? `${JP_URL}?${query}` : JP_URL;
  const result = await axios.get(backendURL + url, authConfig(token));
  console.log("✅ JourneyPayments fetched:", result.data.data?.length ?? 0);
  jpCache.data = result.data.data;
  return result.data;
};

const testGetJourneyPaymentById = async ({ user, paymentUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentUniqueId || jpCache.data?.[0]?.paymentUniqueId || jpCache.data?.[0]?.journeyPaymentUniqueId;
  if (!id) throw new Error("No paymentUniqueId found");
  const result = await axios.get(`${backendURL}${JP_URL}/${id}`, authConfig(token));
  console.log("✅ JourneyPayment fetched by ID:", id);
  return result.data;
};

const testCreateJourneyPayment = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const journeyDecisionUniqueId = payload?.journeyDecisionUniqueId || usersData?.driver?.lastJourneyDecisionUniqueId || usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  let paymentMethodUniqueId = payload?.paymentMethodUniqueId || jpCache.data?.[0]?.paymentMethodUniqueId;
  let paymentStatusUniqueId = payload?.paymentStatusUniqueId || jpCache.data?.[0]?.paymentStatusUniqueId;
  if (!journeyDecisionUniqueId) { console.warn("⏩ testCreateJourneyPayment skipped — no journeyDecisionUniqueId"); return { skipped: true }; }
  if (!paymentMethodUniqueId) {
    try { const pmRes = await axios.get(backendURL + "/api/finance/paymentMethod", authConfig(token)); const methods = pmRes?.data?.data; if (methods?.length) paymentMethodUniqueId = methods[0].paymentMethodUniqueId; } catch { /* ignore */ }
  }
  if (!paymentMethodUniqueId) { console.warn("⏩ testCreateJourneyPayment skipped — no paymentMethodUniqueId"); return { skipped: true }; }
  if (!paymentStatusUniqueId) {
    try { const psRes = await axios.get(backendURL + "/api/finance/paymentStatus", authConfig(token)); const statuses = psRes?.data?.data; if (statuses?.length) paymentStatusUniqueId = statuses[0].paymentStatusUniqueId; } catch { /* ignore */ }
  }
  if (!paymentStatusUniqueId) { console.warn("⏩ testCreateJourneyPayment skipped — no paymentStatusUniqueId"); return { skipped: true }; }
  const defaultPayload = { journeyDecisionUniqueId, amount: 4500.0, paymentMethodUniqueId, paymentStatusUniqueId, ...payload };
  const result = await axios.post(backendURL + JP_URL, defaultPayload, authConfig(token));
  console.log("✅ JourneyPayment created:", result.data.data?.paymentUniqueId || result.data.paymentUniqueId);
  return result.data;
};

const testUpdateJourneyPayment = async ({ user, paymentUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentUniqueId || jpCache.data?.[0]?.paymentUniqueId || jpCache.data?.[0]?.journeyPaymentUniqueId;
  if (!id) throw new Error("No paymentUniqueId found to update");
  const defaultPayload = { amount: 5000.0, ...payload };
  const result = await axios.put(`${backendURL}${JP_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ JourneyPayment updated:", id);
  return result.data;
};

const testDeleteJourneyPayment = async ({ user, paymentUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = paymentUniqueId || jpCache.data?.[0]?.paymentUniqueId || jpCache.data?.[0]?.journeyPaymentUniqueId;
  if (!id) throw new Error("No paymentUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${JP_URL}/${id}`, authConfig(token));
  console.log("✅ JourneyPayment deleted:", id);
  return result.data;
};

const testJourneyPaymentsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── JourneyPayments Workflow ──");
  await testGetJourneyPayments({ user });
  const created = await testCreateJourneyPayment({ user });
  if (created?.skipped) { console.log("⏩ JourneyPayments workflow skipped"); return { skipped: true }; }
  const paymentUniqueId = created?.data?.paymentUniqueId || created?.paymentUniqueId;
  if (!paymentUniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetJourneyPayments({ user });
  await testGetJourneyPaymentById({ user, paymentUniqueId });
  await testUpdateJourneyPayment({ user, paymentUniqueId });
  await testGetJourneyPayments({ user });
  await testDeleteJourneyPayment({ user, paymentUniqueId });
  await testGetJourneyPayments({ user });
  console.log("── JourneyPayments Workflow complete ──\n");
  return { paymentUniqueId };
};

module.exports = {
  testPaymentsWorkflow, testGetPayments, testGetPaymentById, testCreatePayment, testUpdatePayment, testDeletePayment, testGetPaymentsByDateRange,
  testPaymentMethodWorkflow, testGetPaymentMethods, testCreatePaymentMethod, testUpdatePaymentMethod, testDeletePaymentMethod,
  testPaymentStatusWorkflow, testGetPaymentStatuses, testCreatePaymentStatus, testUpdatePaymentStatus, testDeletePaymentStatus,
  testJourneyPaymentsWorkflow, testGetJourneyPayments, testGetJourneyPaymentById, testCreateJourneyPayment, testUpdateJourneyPayment, testDeleteJourneyPayment,
};
