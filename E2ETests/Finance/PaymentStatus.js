// CRUD for PaymentStatus
// Lookup table: PENDING, COMPLETED, FAILED — used when recording journey payments

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/paymentStatus";
const cache = { data: null };

const testGetPaymentStatuses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ PaymentStatuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetPaymentStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreatePaymentStatus = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = { paymentStatus: "E2E_TEST_STATUS_" + Date.now(), ...payload };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ PaymentStatus created:", result.data.paymentStatusUniqueId || result.data.data?.paymentStatusUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreatePaymentStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdatePaymentStatus = async ({ user, paymentStatusUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = paymentStatusUniqueId || cache.data?.[0]?.paymentStatusUniqueId;
    if (!id) throw new Error("No paymentStatusUniqueId found to update");
    const defaultPayload = { paymentStatus: "E2E_UPDATED_STATUS", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ PaymentStatus updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdatePaymentStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeletePaymentStatus = async ({ user, paymentStatusUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = paymentStatusUniqueId || cache.data?.[0]?.paymentStatusUniqueId;
    if (!id) throw new Error("No paymentStatusUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ PaymentStatus deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeletePaymentStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testPaymentStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── PaymentStatus Workflow ──");
  await testGetPaymentStatuses({ user });
  const created = await testCreatePaymentStatus({ user });
  const id = created?.paymentStatusUniqueId || created?.data?.paymentStatusUniqueId;
  if (!id) { console.warn("⚠️  No ID returned — cannot continue"); return { skipped: true }; }
  await testGetPaymentStatuses({ user });
  await testUpdatePaymentStatus({ user, paymentStatusUniqueId: id });
  await testGetPaymentStatuses({ user });
  await testDeletePaymentStatus({ user, paymentStatusUniqueId: id });
  await testGetPaymentStatuses({ user });
  console.log("── PaymentStatus Workflow complete ──\n");
  return { id };
};

module.exports = { testPaymentStatusWorkflow, testGetPaymentStatuses, testCreatePaymentStatus, testUpdatePaymentStatus, testDeletePaymentStatus };
