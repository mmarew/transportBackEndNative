// CRUD for JourneyPayments
// Manages per-journey payment records (note: currently UNUSED in journey completion flow)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/journeyPayments";
const cache = { data: null };

const testGetJourneyPayments = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ JourneyPayments fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetJourneyPayments:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetJourneyPaymentById = async ({ user, paymentUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id =
      paymentUniqueId ||
      cache.data?.[0]?.paymentUniqueId ||
      cache.data?.[0]?.journeyPaymentUniqueId;
    if (!id) throw new Error("No paymentUniqueId found");
    const result = await axios.get(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ JourneyPayment fetched by ID:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetJourneyPaymentById:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateJourneyPayment = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const journeyUniqueId =
      payload?.journeyUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyUniqueId;
    const paymentMethodUniqueId =
      payload?.paymentMethodUniqueId || cache.data?.[0]?.paymentMethodUniqueId;
    if (!journeyUniqueId) {
      console.warn(
        "⏩ testCreateJourneyPayment skipped — no journeyUniqueId (run full journey flow first)",
      );
      return { skipped: true };
    }
    const defaultPayload = {
      journeyUniqueId,
      amount: 4500.0,
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
      "✅ JourneyPayment created:",
      result.data.data?.paymentUniqueId || result.data.paymentUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateJourneyPayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateJourneyPayment = async ({
  user,
  paymentUniqueId,
  payload,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id =
      paymentUniqueId ||
      cache.data?.[0]?.paymentUniqueId ||
      cache.data?.[0]?.journeyPaymentUniqueId;
    if (!id) throw new Error("No paymentUniqueId found to update");
    const defaultPayload = { amount: 5000.0, ...payload };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ JourneyPayment updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateJourneyPayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteJourneyPayment = async ({ user, paymentUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id =
      paymentUniqueId ||
      cache.data?.[0]?.paymentUniqueId ||
      cache.data?.[0]?.journeyPaymentUniqueId;
    if (!id) throw new Error("No paymentUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ JourneyPayment deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteJourneyPayment:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testJourneyPaymentsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── JourneyPayments Workflow ──");
  await testGetJourneyPayments({ user });
  const created = await testCreateJourneyPayment({ user });
  if (created?.skipped) {
    console.log(
      "⏩ JourneyPayments workflow skipped — missing journeyUniqueId",
    );
    return { skipped: true };
  }
  const paymentUniqueId =
    created?.data?.paymentUniqueId || created?.paymentUniqueId;
  if (!paymentUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
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
  testJourneyPaymentsWorkflow,
  testGetJourneyPayments,
  testGetJourneyPaymentById,
  testCreateJourneyPayment,
  testUpdateJourneyPayment,
  testDeleteJourneyPayment,
};
