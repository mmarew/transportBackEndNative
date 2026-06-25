const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

// Bare-mounted routes (no /api/ prefix) — paths come directly from endpoints file
const CREATE_URL = "/vehicleStatusType";
const GET_URL    = "/vehicleStatusTypes";
const UPDATE_URL = "/vehicleStatusType";
const DELETE_URL = "/vehicleStatusType";
const cache = { data: null };

// ── GET all ────────────────────────────────────────────────────────────────────
const testGetVehicleStatusTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(backendURL + GET_URL, authConfig(token));
    console.log("✅ VehicleStatusTypes fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleStatusTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateVehicleStatusType = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.post(backendURL + CREATE_URL, payload, authConfig(token));
    console.log("✅ VehicleStatusType created:", result.data.data?.vehicleStatusTypeUniqueId);
    return result.data.data;
  } catch (error) {
    console.error("❌ testCreateVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateVehicleStatusType = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.vehicleStatusTypeUniqueId;
    if (!id) throw new Error("No ID found to update");

    const result = await axios.put(`${backendURL}${UPDATE_URL}/${id}`, payload, authConfig(token));
    console.log("✅ VehicleStatusType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteVehicleStatusType = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.vehicleStatusTypeUniqueId;
    if (!id) throw new Error("No ID found to delete");

    const result = await axios.delete(`${backendURL}${DELETE_URL}/${id}`, authConfig(token));
    console.log("✅ VehicleStatusType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testVehicleStatusTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleStatusType Workflow ──");

  await testGetVehicleStatusTypes({ user });

  const createPayload = {
    typeName: "E2ETestStatus" + Date.now(),
    description: "E2E test status type description",
  };

  const created = await testCreateVehicleStatusType({ user, payload: createPayload });
  const uniqueId = created?.vehicleStatusTypeUniqueId;
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetVehicleStatusTypes({ user });
  
  const updatePayload = {
    typeName: "E2EUpdatedStatus",
    description: "Updated E2E description",
  };

  await testUpdateVehicleStatusType({ user, uniqueId, payload: updatePayload });
  await testGetVehicleStatusTypes({ user });
  await testDeleteVehicleStatusType({ user, uniqueId });
  await testGetVehicleStatusTypes({ user });

  console.log("── VehicleStatusType Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  testVehicleStatusTypeWorkflow,
  testGetVehicleStatusTypes,
  testCreateVehicleStatusType,
  testUpdateVehicleStatusType,
  testDeleteVehicleStatusType,
};
