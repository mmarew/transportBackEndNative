// CRUD for Payments
// Manages payment records linked to journeys

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/payments";
const cache = { data: null };

const testGetPayments = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ Payments fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetPayments:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetPaymentById = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const paymentId =
      id || cache.data?.[0]?.paymentUniqueId || cache.data?.[0]?.id;
    if (!paymentId) throw new Error("No payment ID found");
    const result = await axios.get(
      `${backendURL}${BASE_URL}/${paymentId}`,
      authConfig(token),
    );
    console.log("✅ Payment fetched by ID:", paymentId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetPaymentById:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreatePayment = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
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
      } catch (_) { /* ignore */ }
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
      } catch (_) { /* ignore */ }
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
    console.log(
      "✅ Payment created:",
      result.data.data?.paymentUniqueId || result.data.paymentUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreatePayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdatePayment = async ({ user, id, payload } = {}) => {
  try {
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
    console.log("✅ Payment updated:", paymentId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdatePayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeletePayment = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const paymentId =
      id || cache.data?.[0]?.paymentUniqueId || cache.data?.[0]?.id;
    if (!paymentId) throw new Error("No payment ID found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${paymentId}`,
      authConfig(token),
    );
    console.log("✅ Payment deleted:", paymentId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeletePayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testPaymentsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Payments Workflow ──");
  await testGetPayments({ user });
  const created = await testCreatePayment({ user });
  if (created?.skipped) {
    console.log("⏩ Payments workflow skipped — missing journeyId");
    return { skipped: true };
  }
  const paymentId = created?.data?.paymentUniqueId || created?.paymentUniqueId;
  if (!paymentId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetPayments({ user });
  await testGetPaymentById({ user, id: paymentId });
  await testUpdatePayment({ user, id: paymentId });
  await testGetPayments({ user });
  await testDeletePayment({ user, id: paymentId });
  await testGetPayments({ user });
  console.log("── Payments Workflow complete ──\n");
  return { paymentId };
};

module.exports = {
  testPaymentsWorkflow,
  testGetPayments,
  testGetPaymentById,
  testCreatePayment,
  testUpdatePayment,
  testDeletePayment,
};
