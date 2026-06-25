// CRUD for TariffRate
// Defines standard tariff rates for freight pricing (standing rate, per-km, per-hour)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/tariffRate";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetTariffRates = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ TariffRates fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetTariffRates:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateTariffRate = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      tariffRateName: "E2E Test Tariff " + Date.now(),
      standingTariffRate: 100,
      journeyTariffRate: 25,
      timingTariffRate: 10,
      tariffRateDescription: "E2E test tariff rate",
      tariffRateEffectiveDate: "2026-01-01",
      tariffRateExpirationDate: "2030-01-01",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ TariffRate created:", result.data.tariffRateUniqueId || result.data.data?.tariffRateUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateTariffRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateTariffRate = async ({ user, tariffRateUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = tariffRateUniqueId || cache.data?.[0]?.tariffRateUniqueId;
    if (!id) throw new Error("No tariffRateUniqueId found to update");
    const defaultPayload = { standingTariffRate: 150, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ TariffRate updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateTariffRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteTariffRate = async ({ user, tariffRateUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = tariffRateUniqueId || cache.data?.[0]?.tariffRateUniqueId;
    if (!id) throw new Error("No tariffRateUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ TariffRate deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteTariffRate:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testTariffRateWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── TariffRate Workflow ──");

  await testGetTariffRates({ user });

  const created = await testCreateTariffRate({ user });
  const tariffRateUniqueId = created?.tariffRateUniqueId || created?.data?.tariffRateUniqueId;
  if (!tariffRateUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetTariffRates({ user });
  await testUpdateTariffRate({ user, tariffRateUniqueId });
  await testGetTariffRates({ user });
  await testDeleteTariffRate({ user, tariffRateUniqueId });
  await testGetTariffRates({ user });

  console.log("── TariffRate Workflow complete ──\n");
  return { tariffRateUniqueId };
};

module.exports = {
  testTariffRateWorkflow,
  testGetTariffRates,
  testCreateTariffRate,
  testUpdateTariffRate,
  testDeleteTariffRate,
};
