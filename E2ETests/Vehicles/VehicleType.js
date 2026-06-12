// CRUD for VehicleType
// Manages vehicle categories (Light Truck, Heavy Truck, Container Truck, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/vehicleTypes";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetVehicleTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ VehicleTypes fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateVehicleType = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      vehicleTypeName: "E2E Test Vehicle Type " + Date.now(),
      carryingCapacity: 50,
      cargoType: "bulk_only",
      vehicleTypeDescription: "E2E test vehicle type — should be deleted",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ VehicleType created:", result.data.vehicleTypeUniqueId || result.data.data?.vehicleTypeUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateVehicleType = async ({ user, vehicleTypeUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleTypeUniqueId || cache.data?.[0]?.vehicleTypeUniqueId;
    if (!id) throw new Error("No vehicleTypeUniqueId found to update");
    const defaultPayload = { vehicleTypeDescription: "Updated E2E test vehicle type", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteVehicleType = async ({ user, vehicleTypeUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleTypeUniqueId || cache.data?.[0]?.vehicleTypeUniqueId;
    if (!id) throw new Error("No vehicleTypeUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ VehicleType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testVehicleTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleType Workflow ──");

  await testGetVehicleTypes({ user });

  const created = await testCreateVehicleType({ user });
  const vehicleTypeUniqueId = created?.vehicleTypeUniqueId || created?.data?.vehicleTypeUniqueId;
  if (!vehicleTypeUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetVehicleTypes({ user });
  await testUpdateVehicleType({ user, vehicleTypeUniqueId });
  await testGetVehicleTypes({ user });
  await testDeleteVehicleType({ user, vehicleTypeUniqueId });
  await testGetVehicleTypes({ user });

  console.log("── VehicleType Workflow complete ──\n");
  return { vehicleTypeUniqueId };
};

module.exports = {
  testVehicleTypeWorkflow,
  testGetVehicleTypes,
  testCreateVehicleType,
  testUpdateVehicleType,
  testDeleteVehicleType,
};
