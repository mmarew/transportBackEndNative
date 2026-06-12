// CRUD for Vehicle (Profile)
// Tests vehicle creation, update, deletion and related queries.
// Vehicles are created during driver onboarding — this file tests direct vehicle CRUD.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const cache = { data: null };

// ── GET all vehicles ───────────────────────────────────────────────────────────
const testGetVehicles = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `/api/vehicles?${query}` : "/api/vehicles";
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Vehicles fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicles:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE vehicle ─────────────────────────────────────────────────────────────
const testCreateVehicle = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");

    // Need vehicleTypeUniqueId from seed data
    const vehicleTypeUniqueId = payload?.vehicleTypeUniqueId ||
      usersData?.driver?.accountData?.vehicle?.vehicleTypeUniqueId;
    if (!vehicleTypeUniqueId) {
      console.warn("⏩ testCreateVehicle skipped — vehicleTypeUniqueId not available");
      return { skipped: true };
    }

    const driverUserUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId || "self";
    const url = `/api/user/vehicles/driverUserUniqueId/${driverUserUniqueId}`;
    const defaultPayload = {
      vehicleTypeUniqueId,
      licensePlate: "E2E-" + Date.now().toString().slice(-6),
      color: "White",
      isDriverOwnerOfVehicle: true,
      ...payload,
    };
    const result = await axios.post(backendURL + url, defaultPayload, authConfig(token));
    console.log("✅ Vehicle created:", result.data.vehicleUniqueId || result.data.data?.vehicleUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicle:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE vehicle ─────────────────────────────────────────────────────────────
const testUpdateVehicle = async ({ user, vehicleUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleUniqueId ||
      cache.data?.[0]?.vehicleUniqueId ||
      usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
    if (!id) throw new Error("No vehicleUniqueId found to update");
    const defaultPayload = { color: "Blue", ...payload };
    const result = await axios.put(`${backendURL}/api/user/vehicles/${id}`, defaultPayload, authConfig(token));
    console.log("✅ Vehicle updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicle:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE vehicle ─────────────────────────────────────────────────────────────
const testDeleteVehicle = async ({ user, vehicleUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleUniqueId || cache.data?.[0]?.vehicleUniqueId;
    if (!id) throw new Error("No vehicleUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/user/vehicles/${id}`, authConfig(token));
    console.log("✅ Vehicle deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicle:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testVehicleProfileWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── VehicleProfile Workflow ──");

  await testGetVehicles({ user });

  // If driver already has a vehicle from onboarding, test update on it
  const existingVehicle = usersData?.driver?.accountData?.vehicle;
  if (existingVehicle?.vehicleUniqueId) {
    console.log("📋 Using existing vehicle from driver onboarding:", existingVehicle.vehicleUniqueId);
    await testUpdateVehicle({ user, vehicleUniqueId: existingVehicle.vehicleUniqueId, payload: { color: "Silver" } });
    await testGetVehicles({ user });
  } else {
    // No existing vehicle — try to create one
    const created = await testCreateVehicle({ user });
    if (created?.skipped) {
      console.log("⏩ Skipped — run driver onboarding first to get vehicleTypeUniqueId");
      return { skipped: true };
    }
    const vehicleUniqueId = created?.vehicleUniqueId || created?.data?.vehicleUniqueId;
    if (vehicleUniqueId) {
      await testGetVehicles({ user });
      await testUpdateVehicle({ user, vehicleUniqueId, payload: { color: "Red" } });
      await testGetVehicles({ user });
      // Note: deleting the vehicle used in the main flow will break other tests.
      // Only delete if this was a newly created test vehicle.
      await testDeleteVehicle({ user, vehicleUniqueId });
      await testGetVehicles({ user });
    }
  }

  console.log("── VehicleProfile Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testVehicleProfileWorkflow,
  testGetVehicles,
  testCreateVehicle,
  testUpdateVehicle,
  testDeleteVehicle,
};
