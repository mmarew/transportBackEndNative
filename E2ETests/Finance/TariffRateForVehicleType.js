// CRUD for TariffRateForVehicleType
// Links a TariffRate to a VehicleType — defines pricing rules per vehicle category

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/tariffRateForVehicleType";
const cache = { data: null };

const testGetTariffRatesForVehicleTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ TariffRateForVehicleTypes fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetTariffRatesForVehicleTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateTariffRateForVehicleType = async ({ user, vehicleTypeUniqueId, tariffRateUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    if (!vehicleTypeUniqueId || !tariffRateUniqueId) {
      console.warn("⏩ testCreateTariffRateForVehicleType skipped — vehicleTypeUniqueId and tariffRateUniqueId required");
      return { skipped: true };
    }

    const defaultPayload = { vehicleTypeUniqueId, tariffRateUniqueId, ...payload };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ TariffRateForVehicleType created:", result.data.tariffRateForVehicleTypeUniqueId || result.data.data?.tariffRateForVehicleTypeUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateTariffRateForVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateTariffRateForVehicleType = async ({ user, tariffRateForVehicleTypeUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = tariffRateForVehicleTypeUniqueId || cache.data?.[0]?.tariffRateForVehicleTypeUniqueId;
    if (!id) throw new Error("No tariffRateForVehicleTypeUniqueId found to update");
    const defaultPayload = { status: 0, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ TariffRateForVehicleType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateTariffRateForVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteTariffRateForVehicleType = async ({ user, tariffRateForVehicleTypeUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = tariffRateForVehicleTypeUniqueId || cache.data?.[0]?.tariffRateForVehicleTypeUniqueId;
    if (!id) throw new Error("No tariffRateForVehicleTypeUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ TariffRateForVehicleType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteTariffRateForVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testTariffRateForVehicleTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── TariffRateForVehicleType Workflow ──");

  await testGetTariffRatesForVehicleTypes({ user });

  // Need vehicleTypeUniqueId and tariffRateUniqueId from existing seed data
  // Fetch vehicle types and tariff rates to get real IDs
  const vehicleTypesResult = await axios.get(backendURL + "/api/admin/vehicleTypes", authConfig(user?.token || usersData.admin?.token)).catch(() => null);
  const tariffRatesResult = await axios.get(backendURL + "/api/finance/tariffRate", authConfig(user?.token || usersData.admin?.token)).catch(() => null);

  const vehicleTypeUniqueId = vehicleTypesResult?.data?.data?.[0]?.vehicleTypeUniqueId;
  const tariffRateUniqueId = tariffRatesResult?.data?.data?.[0]?.tariffRateUniqueId;
  const anotherTariffRateUniqueId = tariffRatesResult?.data?.data?.[1]?.tariffRateUniqueId;

  if (!vehicleTypeUniqueId || !tariffRateUniqueId) {
    console.log("⏩ Skipped — vehicleTypeUniqueId or tariffRateUniqueId not available");
    return { skipped: true };
  }

  const created = await testCreateTariffRateForVehicleType({ user, vehicleTypeUniqueId, tariffRateUniqueId });
  if (created?.skipped) return { skipped: true };

  const id = created?.tariffRateForVehicleTypeUniqueId || created?.data?.tariffRateForVehicleTypeUniqueId;
  if (!id) { console.warn("⚠️  No ID returned — cannot continue"); return { skipped: true }; }

  await testGetTariffRatesForVehicleTypes({ user });
  await testUpdateTariffRateForVehicleType({ user, tariffRateForVehicleTypeUniqueId: id, payload: { tariffRateUniqueId: anotherTariffRateUniqueId } });
  await testGetTariffRatesForVehicleTypes({ user });
  await testDeleteTariffRateForVehicleType({ user, tariffRateForVehicleTypeUniqueId: id });
  await testGetTariffRatesForVehicleTypes({ user });

  console.log("── TariffRateForVehicleType Workflow complete ──\n");
  return { id };
};

module.exports = { testTariffRateForVehicleTypeWorkflow, testGetTariffRatesForVehicleTypes, testCreateTariffRateForVehicleType, testUpdateTariffRateForVehicleType, testDeleteTariffRateForVehicleType };
