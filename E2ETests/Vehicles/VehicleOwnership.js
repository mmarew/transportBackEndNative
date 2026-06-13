// CRUD for VehicleOwnership
// Links a vehicle to its owner. Usually set when driver creates a vehicle.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/vehicleOwnerships";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetVehicleOwnerships = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ VehicleOwnerships fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleOwnerships:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateVehicleOwnership = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const vehicleUniqueId = payload?.vehicleUniqueId || usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
    const ownerUserUniqueId = payload?.ownerUserUniqueId || usersData?.driver?.accountData?.userData?.userUniqueId;

    if (!vehicleUniqueId || !ownerUserUniqueId) {
      console.warn("⏩ testCreateVehicleOwnership skipped — driver accountData not available");
      return { skipped: true };
    }

    const defaultPayload = { vehicleUniqueId, ownerUserUniqueId, ...payload };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ VehicleOwnership created:", result.data.ownershipUniqueId || result.data.data?.ownershipUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateVehicleOwnership = async ({ user, ownershipUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = ownershipUniqueId || cache.data?.[0]?.ownership?.ownershipUniqueId;
    if (!id) throw new Error("No ownershipUniqueId found to update");
    // Service reads ownershipUniqueId from params (merged by controller).
    // Must supply at least one of: vehicleUniqueId, userUniqueId, roleId, ownershipStartDate, ownershipEndDate
    const defaultPayload = { ownershipEndDate: null, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleOwnership updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteVehicleOwnership = async ({ user, ownershipUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = ownershipUniqueId || cache.data?.[0]?.ownership?.ownershipUniqueId;
    if (!id) throw new Error("No ownershipUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ VehicleOwnership deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testVehicleOwnershipWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleOwnership Workflow ──");

  await testGetVehicleOwnerships({ user });

  // If ownerships already exist from driver onboarding, use them
  if (cache.data?.length > 0) {
    const ownershipUniqueId = cache.data[0].ownership?.ownershipUniqueId;
    console.log("📋 Using existing ownership:", ownershipUniqueId);
    await testUpdateVehicleOwnership({ user, ownershipUniqueId, payload: {} });
    await testGetVehicleOwnerships({ user });
  } else {
    // Try to create one
    const created = await testCreateVehicleOwnership({ user });
    if (created?.skipped) {
      console.log("⏩ Skipped — run driver onboarding first");
      return { skipped: true };
    }
    const ownershipUniqueId = created?.ownershipUniqueId || created?.data?.ownershipUniqueId;
    if (ownershipUniqueId) {
      await testGetVehicleOwnerships({ user });
      await testUpdateVehicleOwnership({ user, ownershipUniqueId, payload: {} });
      await testGetVehicleOwnerships({ user });
    }
  }

  console.log("── VehicleOwnership Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testVehicleOwnershipWorkflow,
  testGetVehicleOwnerships,
  testCreateVehicleOwnership,
  testUpdateVehicleOwnership,
  testDeleteVehicleOwnership,
};
