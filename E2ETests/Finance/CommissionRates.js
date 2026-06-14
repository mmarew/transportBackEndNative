// CRUD for CommissionRates
// Defines the platform commission percentage with effective date ranges

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/commissionRates";
const cache = { data: null };

const testGetCommissionRates = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ CommissionRates fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCommissionRates:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateCommissionRate = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      commissionRate: 5.5,
      commissionRateEffectiveDate: "2026-01-01",
      commissionRateExpirationDate: "2030-12-31",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ CommissionRate created:", result.data.commissionRateUniqueId || result.data.data?.commissionRateUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCommissionRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateCommissionRate = async ({ user, commissionRateUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = commissionRateUniqueId || cache.data?.[0]?.commissionRateUniqueId;
    if (!id) throw new Error("No commissionRateUniqueId found to update");
    const defaultPayload = { commissionRate: 6.0, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ CommissionRate updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateCommissionRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteCommissionRate = async ({ user, commissionRateUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = commissionRateUniqueId || cache.data?.[0]?.commissionRateUniqueId;
    if (!id) throw new Error("No commissionRateUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ CommissionRate deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCommissionRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCommissionRatesWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CommissionRates Workflow ──");
  await testGetCommissionRates({ user });
  const created = await testCreateCommissionRate({ user });
  const id = created?.commissionRateUniqueId || created?.data?.commissionRateUniqueId;
  if (!id) { console.warn("⚠️  No ID returned — cannot continue"); return { skipped: true }; }
  await testGetCommissionRates({ user });
  await testUpdateCommissionRate({ user, commissionRateUniqueId: id });
  await testGetCommissionRates({ user });
  await testDeleteCommissionRate({ user, commissionRateUniqueId: id });
  await testGetCommissionRates({ user });
  console.log("── CommissionRates Workflow complete ──\n");
  return { id };
};

module.exports = { testCommissionRatesWorkflow, testGetCommissionRates, testCreateCommissionRate, testUpdateCommissionRate, testDeleteCommissionRate };
