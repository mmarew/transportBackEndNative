// CRUD for VehicleType
// Manages vehicle categories (Light Truck, Heavy Truck, Container Truck, etc.)
// CREATE and UPDATE require multipart/form-data with a vehicleTypeIconName file attachment.

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/vehicleTypes";
const cache = { data: null };

// Path to dummy file used for icon upload (same one used for company documents)
const DUMMY_FILE_PATH = path.join(__dirname, "../dummy.txt");

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
// Requires multipart/form-data with vehicleTypeIconName file field
const testCreateVehicleType = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const form = new FormData();
    form.append("vehicleTypeName", (payload?.vehicleTypeName) || "E2E Test Vehicle Type " + Date.now());
    form.append("carryingCapacity", String(payload?.carryingCapacity || 50));
    form.append("cargoType", payload?.cargoType || "bulk_only");
    form.append("vehicleTypeDescription", payload?.vehicleTypeDescription || "E2E test vehicle type — should be deleted");
    // Attach dummy icon file (required by the controller)
    form.append("vehicleTypeIconName", fs.createReadStream(DUMMY_FILE_PATH), "vehicle_icon_e2e.txt");

    const result = await axios.post(backendURL + BASE_URL, form, {
      headers: {
        Authorization: "Bearer " + token,
        ...form.getHeaders(),
      },
    });
    console.log("✅ VehicleType created:", result.data.vehicleTypeUniqueId || result.data.data?.vehicleTypeUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
// UPDATE also accepts optional icon file via multipart/form-data
const testUpdateVehicleType = async ({ user, vehicleTypeUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleTypeUniqueId || cache.data?.[0]?.vehicleTypeUniqueId;
    if (!id) throw new Error("No vehicleTypeUniqueId found to update");

    const form = new FormData();
    form.append("vehicleTypeDescription", payload?.vehicleTypeDescription || "Updated E2E test vehicle type");
    if (payload?.vehicleTypeName) form.append("vehicleTypeName", payload.vehicleTypeName);

    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, form, {
      headers: {
        Authorization: "Bearer " + token,
        ...form.getHeaders(),
      },
    });
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
