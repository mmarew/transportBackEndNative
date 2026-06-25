// CRUD for Payments
// Manages payment records linked to journeys

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { assert } = require("../Assert");
const { report } = require("../Reporter");

const BASE_URL = "/api/finance/payments";
const cache = { data: null };

const testGetPayments = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + BASE_URL, authConfig(token));
  assert.StatusCode(result, 200, "GET payments should return 200");
  assert.Truthy(result.data, "GET payments should return data");
  cache.data = result.data.data;
  return result.data;
};

const testGetPaymentById = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId =
    id || cache.data?.[0]?.paymentUniqueId || cache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found");
  const result = await axios.get(
    `${backendURL}${BASE_URL}/${paymentId}`,
    authConfig(token),
  );
  assert.StatusCode(result, 200, "GET payment by ID should return 200");
  assert.Truthy(result.data?.data?.paymentUniqueId, "Payment should have paymentUniqueId");
  assert.Eq(result.data?.data?.paymentUniqueId, paymentId, "Returned payment ID should match requested");
  return result.data;
};

const testCreatePayment = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  assert.Truthy(token, "createPayment: token is required");
  const journeyId =
    payload?.journeyId ||
    usersData?.driver?.lastJourneyDecisionUniqueId ||
    usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  let paymentMethodUniqueId =
    payload?.paymentMethodUniqueId || cache.data?.[0]?.paymentMethodUniqueId;
  let paymentStatusUniqueId =
    payload?.paymentStatusUniqueId || cache.data?.[0]?.paymentStatusUniqueId;
  if (!journeyId) {
    console.warn(
      "⏩ testCreatePayment skipped — no journeyId (run full journey flow first)",
    );
    return { skipped: true };
  }
  // Resolve paymentMethodUniqueId from existing data
  if (!paymentMethodUniqueId) {
    try {
      const pmRes = await axios.get(backendURL + "/api/finance/paymentMethod", authConfig(token));
      const methods = pmRes?.data?.data;
      if (methods?.length) {
        paymentMethodUniqueId = methods[0].paymentMethodUniqueId;
      }
    } catch { /* ignore */ }
  }
  if (!paymentMethodUniqueId) {
    console.warn("⏩ testCreatePayment skipped — no paymentMethodUniqueId available");
    return { skipped: true };
  }
  // Resolve paymentStatusUniqueId from existing data
  if (!paymentStatusUniqueId) {
    try {
      const psRes = await axios.get(backendURL + "/api/finance/paymentStatus", authConfig(token));
      const statuses = psRes?.data?.data;
      if (statuses?.length) {
        paymentStatusUniqueId = statuses[0].paymentStatusUniqueId;
      }
    } catch { /* ignore */ }
  }
  if (!paymentStatusUniqueId) {
    console.warn("⏩ testCreatePayment skipped — no paymentStatusUniqueId available");
    return { skipped: true };
  }
  const defaultPayload = {
    journeyId,
    amount: 5000,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    ...payload,
  };
  const result = await axios.post(
    backendURL + BASE_URL,
    defaultPayload,
    authConfig(token),
  );
  assert.StatusCode(result, 200, "POST payment should return 200");
  const paymentUniqueId = result.data?.data?.paymentUniqueId || result.data?.paymentUniqueId;
  assert.Truthy(paymentUniqueId, "Created payment should have a paymentUniqueId");
  return result.data;
};

const testUpdatePayment = async ({ user, id, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId =
    id || cache.data?.[0]?.paymentUniqueId || cache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found to update");
  const defaultPayload = { amount: 5500, ...payload };
  const result = await axios.put(
    `${backendURL}${BASE_URL}/${paymentId}`,
    defaultPayload,
    authConfig(token),
  );
  assert.StatusCode(result, 200, "PUT payment should return 200");
  assert.Truthy(result.data?.data?.paymentId || result.data?.paymentId, "Updated payment should have paymentId");
  return result.data;
};

const testDeletePayment = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const paymentId =
    id || cache.data?.[0]?.paymentUniqueId || cache.data?.[0]?.id;
  if (!paymentId) throw new Error("No payment ID found to delete");
  const result = await axios.delete(
    `${backendURL}${BASE_URL}/${paymentId}`,
    authConfig(token),
  );
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
    if (created?.skipped) {
      report.skip("Payments workflow", "missing journeyId");
      return { skipped: true };
    }
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

module.exports = {
  testPaymentsWorkflow,
  testGetPayments,
  testGetPaymentById,
  testCreatePayment,
  testUpdatePayment,
  testDeletePayment,
};
