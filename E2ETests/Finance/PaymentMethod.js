// CRUD for PaymentMethod
// Lookup table: cash, bank, telebirr — used when recording journey payments

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/paymentMethod";
const cache = { data: null };

const testGetPaymentMethods = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ PaymentMethods fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetPaymentMethods:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreatePaymentMethod = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = { paymentMethod: "e2e_test_method_" + Date.now(), ...payload };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ PaymentMethod created:", result.data.paymentMethodUniqueId || result.data.data?.paymentMethodUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreatePaymentMethod:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdatePaymentMethod = async ({ user, paymentMethodUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = paymentMethodUniqueId || cache.data?.[0]?.paymentMethodUniqueId;
    if (!id) throw new Error("No paymentMethodUniqueId found to update");
    const defaultPayload = { paymentMethod: "e2e_updated_method", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ PaymentMethod updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdatePaymentMethod:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeletePaymentMethod = async ({ user, paymentMethodUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = paymentMethodUniqueId || cache.data?.[0]?.paymentMethodUniqueId;
    if (!id) throw new Error("No paymentMethodUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ PaymentMethod deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeletePaymentMethod:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testPaymentMethodWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── PaymentMethod Workflow ──");
  await testGetPaymentMethods({ user });
  const created = await testCreatePaymentMethod({ user });
  const id = created?.paymentMethodUniqueId || created?.data?.paymentMethodUniqueId;
  if (!id) { console.warn("⚠️  No ID returned — cannot continue"); return { skipped: true }; }
  await testGetPaymentMethods({ user });
  await testUpdatePaymentMethod({ user, paymentMethodUniqueId: id });
  await testGetPaymentMethods({ user });
  await testDeletePaymentMethod({ user, paymentMethodUniqueId: id });
  await testGetPaymentMethods({ user });
  console.log("── PaymentMethod Workflow complete ──\n");
  return { id };
};

module.exports = { testPaymentMethodWorkflow, testGetPaymentMethods, testCreatePaymentMethod, testUpdatePaymentMethod, testDeletePaymentMethod };
