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
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyUniqueId;
    const paymentMethodUniqueId =
      payload?.paymentMethodUniqueId || cache.data?.[0]?.paymentMethodUniqueId;
    if (!journeyId) {
      console.warn(
        "⏩ testCreatePayment skipped — no journeyId (run full journey flow first)",
      );
      return { skipped: true };
    }
    const defaultPayload = {
      journeyId,
      amount: 5000,
      paymentMethodUniqueId:
        paymentMethodUniqueId || "00000000-0000-0000-0000-000000000001",
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
