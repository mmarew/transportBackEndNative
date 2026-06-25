// CRUD for VehicleType
// Manages vehicle categories (Light Truck, Heavy Truck, Container Truck, etc.)
// CREATE and UPDATE require multipart/form-data with a vehicleTypeIconName file attachment.
// Multer only accepts: JPEG, PNG, PDF, SVG

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/vehicleTypes";
const cache = { data: null };

// Minimal valid 1×1 PNG in binary — avoids any file system dependency
// and always passes the JPEG/PNG/PDF/SVG mimetype filter
const DUMMY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
  "2e00000000c4944415478016360f8cfc0000000200016633e92000000000049454e44ae426082",
  "hex"
);

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
// Requires multipart/form-data with vehicleTypeIconName file field.
// The service does NOT return the ID — we GET after create to find it.
const testCreateVehicleType = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const vehicleTypeName = (payload?.vehicleTypeName) || "E2E Test Vehicle Type " + Date.now();

    const form = new FormData();
    form.append("vehicleTypeName", vehicleTypeName);
    form.append("carryingCapacity", String(payload?.carryingCapacity || 50));
    form.append("cargoType", payload?.cargoType || "bulk_only");
    form.append("vehicleTypeDescription", payload?.vehicleTypeDescription || "E2E test vehicle type — should be deleted");
    form.append("vehicleTypeIconName", new Blob([DUMMY_PNG], { type: "image/png" }), "vehicle_icon_e2e.png");

    await axios.post(backendURL + BASE_URL, form, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    // Service returns no ID — GET to find the newly created entry by name
    const list = await testGetVehicleTypes({ user });
    const created = list?.data?.find(v => v.vehicleTypeName === vehicleTypeName);
    const vehicleTypeUniqueId = created?.vehicleTypeUniqueId;
    console.log("✅ VehicleType created:", vehicleTypeUniqueId);
    return { vehicleTypeUniqueId };
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
  const vehicleTypeUniqueId = created?.vehicleTypeUniqueId;
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
