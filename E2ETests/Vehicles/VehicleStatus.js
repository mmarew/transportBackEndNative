// CRUD for VehicleStatus
// Tracks vehicle status over time (e.g., available, in-maintenance, on-trip)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/vehicleStatus";
const cache = { data: null };

const testGetVehicleStatuses = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ VehicleStatuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetVehicleStatuses:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateVehicleStatus = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const vehicleUniqueId =
      payload?.vehicleUniqueId ||
      usersData?.driver?.accountData?.vehicleData?.vehicleUniqueId;
    if (!vehicleUniqueId) {
      console.warn(
        "⏩ testCreateVehicleStatus skipped — no vehicleUniqueId (run driver onboarding first)",
      );
      return { skipped: true };
    }
    const defaultPayload = {
      vehicleUniqueId,
      VehicleStatusTypeId: 1,
      ...payload,
    };
    const result = await axios.post(
      backendURL + BASE_URL,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ VehicleStatus created:",
      result.data.data?.vehicleStatusUniqueId ||
        result.data.vehicleStatusUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateVehicleStatus:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateVehicleStatus = async ({
  user,
  vehicleStatusUniqueId,
  payload,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleStatusUniqueId || cache.data?.[0]?.vehicleStatusUniqueId;
    if (!id) throw new Error("No vehicleStatusUniqueId found to update");
    const defaultPayload = { VehicleStatusTypeId: 2, ...payload };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ VehicleStatus updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateVehicleStatus:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteVehicleStatus = async ({
  user,
  vehicleStatusUniqueId,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleStatusUniqueId || cache.data?.[0]?.vehicleStatusUniqueId;
    if (!id) throw new Error("No vehicleStatusUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ VehicleStatus deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteVehicleStatus:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testVehicleStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleStatus Workflow ──");
  await testGetVehicleStatuses({ user });
  const created = await testCreateVehicleStatus({ user });
  if (created?.skipped) {
    console.log("⏩ VehicleStatus workflow skipped — missing vehicleUniqueId");
    return { skipped: true };
  }
  const vehicleStatusUniqueId =
    created?.data?.vehicleStatusUniqueId || created?.vehicleStatusUniqueId;
  if (!vehicleStatusUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetVehicleStatuses({ user });
  await testUpdateVehicleStatus({ user, vehicleStatusUniqueId });
  await testGetVehicleStatuses({ user });
  await testDeleteVehicleStatus({ user, vehicleStatusUniqueId });
  await testGetVehicleStatuses({ user });
  console.log("── VehicleStatus Workflow complete ──\n");
  return { vehicleStatusUniqueId };
};

module.exports = {
  testVehicleStatusWorkflow,
  testGetVehicleStatuses,
  testCreateVehicleStatus,
  testUpdateVehicleStatus,
  testDeleteVehicleStatus,
};
