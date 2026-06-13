// CRUD for VehicleDriver
// Links a driver to a vehicle they are assigned to operate

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/vehicleDriver";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetVehicleDrivers = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ VehicleDrivers fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleDrivers:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateVehicleDriver = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const vehicleUniqueId = payload?.vehicleUniqueId || usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
    const driverUserUniqueId = payload?.driverUserUniqueId || usersData?.driver?.accountData?.userData?.userUniqueId;

    if (!vehicleUniqueId || !driverUserUniqueId) {
      console.warn("⏩ testCreateVehicleDriver skipped — driver accountData not available");
      return { skipped: true };
    }

    const defaultPayload = { vehicleUniqueId, driverUserUniqueId, ...payload };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ VehicleDriver created:", result.data.vehicleDriverUniqueId || result.data.data?.vehicleDriverUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateVehicleDriver = async ({ user, vehicleDriverUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleDriverUniqueId || cache.data?.[0]?.vehicleDriverUniqueId;
    if (!id) throw new Error("No vehicleDriverUniqueId found to update");
    const defaultPayload = { assignmentStatus: "active", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleDriver updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteVehicleDriver = async ({ user, vehicleDriverUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleDriverUniqueId || cache.data?.[0]?.vehicleDriverUniqueId;
    if (!id) throw new Error("No vehicleDriverUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ VehicleDriver deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testVehicleDriverWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleDriver Workflow ──");

  await testGetVehicleDrivers({ user });

  // If vehicle driver links already exist from driver onboarding, test with those
  if (cache.data?.length > 0) {
    const vehicleDriverUniqueId = cache.data[0].vehicleDriverUniqueId;
    console.log("📋 Using existing vehicle-driver link:", vehicleDriverUniqueId);
    await testUpdateVehicleDriver({ user, vehicleDriverUniqueId, payload: {} });
    await testGetVehicleDrivers({ user });
  } else {
    const created = await testCreateVehicleDriver({ user });
    if (created?.skipped) {
      console.log("⏩ Skipped — run driver onboarding first");
      return { skipped: true };
    }
    const vehicleDriverUniqueId = created?.vehicleDriverUniqueId || created?.data?.vehicleDriverUniqueId;
    if (vehicleDriverUniqueId) {
      await testGetVehicleDrivers({ user });
      await testUpdateVehicleDriver({ user, vehicleDriverUniqueId, payload: {} });
      await testGetVehicleDrivers({ user });
      await testDeleteVehicleDriver({ user, vehicleDriverUniqueId });
      await testGetVehicleDrivers({ user });
    }
  }

  console.log("── VehicleDriver Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testVehicleDriverWorkflow,
  testGetVehicleDrivers,
  testCreateVehicleDriver,
  testUpdateVehicleDriver,
  testDeleteVehicleDriver,
};
