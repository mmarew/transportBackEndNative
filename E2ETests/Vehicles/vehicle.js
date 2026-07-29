const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

// ── Helpers ──────────────────────────────────────────────────────────────────────

const DUMMY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
  "2e00000000c4944415478016360f8cfc0000000200016633e92000000000049454e44ae426082",
  "hex"
);

const cache = { data: null };
const driverCache = { data: null };

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (from Driver/VehicleDriver.js — used during onboarding)
// ═══════════════════════════════════════════════════════════════════════════════

const createVehicle = async (token) => {
  if (!token) {
    token = usersData?.driver?.token;
    if (!token) throw new Error("Token is required to create vehicle");
  }
  const config = authConfig(token);
  try {
    const vehicleTypes = await axios.get(backendURL + "/api/admin/vehicleTypes", config);
    const vehicleTypeUniqueId = vehicleTypes.data.data[0].vehicleTypeUniqueId;
    const payload = {
      licensePlate: String(Date.now()).slice(-6),
      color: "white color",
      vehicleTypeUniqueId,
      isDriverOwnerOfVehicle: false,
    };
    await axios.post(backendURL + "/api/user/vehicles/driverUserUniqueId/self", payload, config);
    console.log("✅ Vehicle Created");
  } catch (error) {
    console.log("❌ Failed to create vehicle:", error.response?.data?.error || error.message);
  }
};

const getRequirementOfVehicleDocument = async (token) => {
  const config = authConfig(token);
  try {
    const res = await axios.get(backendURL + "/api/RoleDocumentRequirements?roleId=9", config);
    console.log("✅ Vehicle Document Requirements fetched");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get vehicle document requirements:", error.response?.data?.error || error.message);
  }
};

const attachVehiclesDocuments = async ({ token, documentType, vehicleUniqueId }) => {
  const form = new FormData();
  const dummyFilePath = path.join(__dirname, "../dummy.png");
  const fileBuffer = fs.readFileSync(dummyFilePath);

  form.append(documentType.uploadedDocumentName, fileBuffer, { filename: "dummy.png", contentType: "image/png" });
  form.append(documentType.uploadedDocumentTypeId, documentType.documentTypeId);

  if (documentType.isFileNumberRequired === 1) {
    form.append(documentType.uploadedDocumentFileNumber, "VEH-" + Date.now());
  }
  if (documentType.isExpirationDateRequired === 1) {
    form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
  }
  if (documentType.isDescriptionRequired === 1) {
    form.append(documentType.uploadedDocumentDescription, "Vehicle document dummy description");
  }

  try {
    await axios.post(backendURL + `/api/vehicle/attachDocuments/${vehicleUniqueId}`, form, {
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    });
    console.log(`✅ Uploaded Vehicle Document: ${documentType.documentTypeName}`);
  } catch (error) {
    console.log(`❌ Failed to upload vehicle document: ${documentType.documentTypeName}`, error.response?.data?.error || error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE TYPE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + "/api/admin/vehicleTypes", authConfig(token));
    console.log("✅ VehicleTypes fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateVehicleType = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const vehicleTypeName = payload?.vehicleTypeName || "E2E Test Vehicle Type " + Date.now();
    const form = new FormData();
    form.append("vehicleTypeName", vehicleTypeName);
    form.append("carryingCapacity", String(payload?.carryingCapacity || 50));
    form.append("cargoType", payload?.cargoType || "bulk_only");
    form.append("vehicleTypeDescription", payload?.vehicleTypeDescription || "E2E test vehicle type");
    form.append("vehicleTypeIconName", new Blob([DUMMY_PNG], { type: "image/png" }), "vehicle_icon_e2e.png");

    await axios.post(backendURL + "/api/admin/vehicleTypes", form, {
      headers: { Authorization: "Bearer " + token },
    });

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

const testUpdateVehicleType = async ({ user, vehicleTypeUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleTypeUniqueId || cache.data?.[0]?.vehicleTypeUniqueId;
    if (!id) throw new Error("No vehicleTypeUniqueId found to update");
    const form = new FormData();
    form.append("vehicleTypeDescription", payload?.vehicleTypeDescription || "Updated E2E test vehicle type");
    if (payload?.vehicleTypeName) form.append("vehicleTypeName", payload.vehicleTypeName);
    const result = await axios.put(`${backendURL}/api/admin/vehicleTypes/${id}`, form, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ VehicleType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteVehicleType = async ({ user, vehicleTypeUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleTypeUniqueId || cache.data?.[0]?.vehicleTypeUniqueId;
    if (!id) throw new Error("No vehicleTypeUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/admin/vehicleTypes/${id}`, authConfig(token));
    console.log("✅ VehicleType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testVehicleTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleType Workflow ──");
  await testGetVehicleTypes({ user });
  const created = await testCreateVehicleType({ user });
  const vehicleTypeUniqueId = created?.vehicleTypeUniqueId;
  if (!vehicleTypeUniqueId) {
    console.warn("⚠️  No ID returned");
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

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE STATUS TYPE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleStatusTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + "/vehicleStatusTypes", authConfig(token));
    console.log("✅ VehicleStatusTypes fetched:", result.data.data?.length ?? 0);
    driverCache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleStatusTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateVehicleStatusType = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.post(backendURL + "/vehicleStatusType", payload, authConfig(token));
    console.log("✅ VehicleStatusType created:", result.data.data?.vehicleStatusTypeUniqueId);
    return result.data.data;
  } catch (error) {
    console.error("❌ testCreateVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateVehicleStatusType = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = uniqueId || driverCache.data?.[0]?.vehicleStatusTypeUniqueId;
    if (!id) throw new Error("No ID found to update");
    const result = await axios.put(`${backendURL}/vehicleStatusType/${id}`, payload, authConfig(token));
    console.log("✅ VehicleStatusType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteVehicleStatusType = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = uniqueId || driverCache.data?.[0]?.vehicleStatusTypeUniqueId;
    if (!id) throw new Error("No ID found to delete");
    const result = await axios.delete(`${backendURL}/vehicleStatusType/${id}`, authConfig(token));
    console.log("✅ VehicleStatusType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleStatusType:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testVehicleStatusTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleStatusType Workflow ──");
  await testGetVehicleStatusTypes({ user });
  const createPayload = { typeName: "E2ETestStatus" + Date.now(), description: "E2E test status type description" };
  const created = await testCreateVehicleStatusType({ user, payload: createPayload });
  const uniqueId = created?.vehicleStatusTypeUniqueId;
  if (!uniqueId) {
    console.warn("⚠️  No ID returned");
    return { skipped: true };
  }
  await testGetVehicleStatusTypes({ user });
  await testUpdateVehicleStatusType({ user, uniqueId, payload: { typeName: "E2EUpdatedStatus" } });
  await testGetVehicleStatusTypes({ user });
  await testDeleteVehicleStatusType({ user, uniqueId });
  await testGetVehicleStatusTypes({ user });
  console.log("── VehicleStatusType Workflow complete ──\n");
  return { uniqueId };
};

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE OWNERSHIP CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleOwnerships = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + "/api/admin/vehicleOwnerships", authConfig(token));
    console.log("✅ VehicleOwnerships fetched:", result.data.data?.length ?? 0);
    driverCache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleOwnerships:", error.response?.data?.error || error.message);
    throw error;
  }
};

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
    const result = await axios.post(backendURL + "/api/admin/vehicleOwnerships", defaultPayload, authConfig(token));
    console.log("✅ VehicleOwnership created:", result.data.ownershipUniqueId || result.data.data?.ownershipUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateVehicleOwnership = async ({ user, ownershipUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = ownershipUniqueId || driverCache.data?.[0]?.ownership?.ownershipUniqueId;
    if (!id) throw new Error("No ownershipUniqueId found to update");
    const defaultPayload = { ownershipEndDate: null, ...payload };
    const result = await axios.put(`${backendURL}/api/admin/vehicleOwnerships/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleOwnership updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteVehicleOwnership = async ({ user, ownershipUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = ownershipUniqueId || driverCache.data?.[0]?.ownership?.ownershipUniqueId;
    if (!id) throw new Error("No ownershipUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/admin/vehicleOwnerships/${id}`, authConfig(token));
    console.log("✅ VehicleOwnership deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleOwnership:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testVehicleOwnershipWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleOwnership Workflow ──");
  await testGetVehicleOwnerships({ user });
  if (driverCache.data?.length > 0) {
    const ownershipUniqueId = driverCache.data[0].ownership?.ownershipUniqueId;
    console.log("📋 Using existing ownership:", ownershipUniqueId);
    await testUpdateVehicleOwnership({ user, ownershipUniqueId, payload: {} });
    await testGetVehicleOwnerships({ user });
  } else {
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
  return { cache: driverCache };
};

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE DRIVER CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleDrivers = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `/api/vehicleDriver?${query}` : "/api/vehicleDriver";
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ VehicleDrivers fetched:", result.data.data?.length ?? 0);
    driverCache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleDrivers:", error.response?.data?.error || error.message);
    throw error;
  }
};

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
    const result = await axios.post(backendURL + "/api/vehicleDriver", defaultPayload, authConfig(token));
    console.log("✅ VehicleDriver created:", result.data.vehicleDriverUniqueId || result.data.data?.vehicleDriverUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateVehicleDriver = async ({ user, vehicleDriverUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleDriverUniqueId || driverCache.data?.[0]?.vehicleDriverUniqueId;
    if (!id) throw new Error("No vehicleDriverUniqueId found to update");
    const defaultPayload = { assignmentStatus: "active", ...payload };
    const result = await axios.put(`${backendURL}/api/vehicleDriver/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleDriver updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteVehicleDriver = async ({ user, vehicleDriverUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleDriverUniqueId || driverCache.data?.[0]?.vehicleDriverUniqueId;
    if (!id) throw new Error("No vehicleDriverUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/vehicleDriver/${id}`, authConfig(token));
    console.log("✅ VehicleDriver deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleDriver:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testVehicleDriverWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── VehicleDriver Workflow ──");
  await testGetVehicleDrivers({ user });
  if (driverCache.data?.length > 0) {
    const vehicleDriverUniqueId = driverCache.data[0].vehicleDriverUniqueId;
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
  return { cache: driverCache };
};

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE PROFILE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicles = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `/api/vehicles?${query}` : "/api/vehicles";
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Vehicles fetched:", result.data.data?.length ?? 0);
    driverCache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicles:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateVehicle = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const vehicleTypeUniqueId = payload?.vehicleTypeUniqueId || usersData?.driver?.accountData?.vehicle?.vehicleTypeUniqueId;
    if (!vehicleTypeUniqueId) {
      console.warn("⏩ testCreateVehicle skipped — vehicleTypeUniqueId not available");
      return { skipped: true };
    }
    const driverUserUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId || "self";
    const url = `/api/user/vehicles/driverUserUniqueId/${driverUserUniqueId}`;
    const defaultPayload = { vehicleTypeUniqueId, licensePlate: "E2E-" + Date.now().toString().slice(-6), color: "White", isDriverOwnerOfVehicle: true, ...payload };
    const result = await axios.post(backendURL + url, defaultPayload, authConfig(token));
    console.log("✅ Vehicle created:", result.data.vehicleUniqueId || result.data.data?.vehicleUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicle:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateVehicle = async ({ user, vehicleUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleUniqueId || driverCache.data?.[0]?.vehicleUniqueId || usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
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

const testDeleteVehicle = async ({ user, vehicleUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleUniqueId || driverCache.data?.[0]?.vehicleUniqueId;
    if (!id) throw new Error("No vehicleUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/user/vehicles/${id}`, authConfig(token));
    console.log("✅ Vehicle deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicle:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testVehicleProfileWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── VehicleProfile Workflow ──");
  await testGetVehicles({ user });
  const existingVehicle = usersData?.driver?.accountData?.vehicle;
  if (existingVehicle?.vehicleUniqueId) {
    console.log("📋 Using existing vehicle from driver onboarding:", existingVehicle.vehicleUniqueId);
    await testUpdateVehicle({ user, vehicleUniqueId: existingVehicle.vehicleUniqueId, payload: { color: "Silver" } });
    await testGetVehicles({ user });
  } else {
    const created = await testCreateVehicle({ user });
    if (created?.skipped) {
      console.log("⏩ Skipped — run driver onboarding first");
      return { skipped: true };
    }
    const vehicleUniqueId = created?.vehicleUniqueId || created?.data?.vehicleUniqueId;
    if (vehicleUniqueId) {
      await testGetVehicles({ user });
      await testUpdateVehicle({ user, vehicleUniqueId, payload: { color: "Red" } });
      await testGetVehicles({ user });
      await testDeleteVehicle({ user, vehicleUniqueId });
      await testGetVehicles({ user });
    }
  }
  console.log("── VehicleProfile Workflow complete ──\n");
  return { cache: driverCache };
};

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLE STATUS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleStatuses = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `/api/vehicleStatus?${query}` : "/api/vehicleStatus";
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ VehicleStatuses fetched:", result.data.data?.length ?? 0);
    driverCache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetVehicleStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateVehicleStatus = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const vehicleUniqueId = payload?.vehicleUniqueId || usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
    if (!vehicleUniqueId) {
      console.warn("⏩ testCreateVehicleStatus skipped — no vehicleUniqueId");
      return { skipped: true };
    }
    const defaultPayload = { vehicleUniqueId, VehicleStatusTypeId: 1, ...payload };
    const result = await axios.post(backendURL + "/api/vehicleStatus", defaultPayload, authConfig(token));
    console.log("✅ VehicleStatus created:", result.data.data?.vehicleStatusUniqueId || result.data.vehicleStatusUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateVehicleStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateVehicleStatus = async ({ user, vehicleStatusUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleStatusUniqueId || driverCache.data?.[0]?.vehicleStatusUniqueId;
    if (!id) throw new Error("No vehicleStatusUniqueId found to update");
    const defaultPayload = { VehicleStatusTypeId: 2, ...payload };
    const result = await axios.put(`${backendURL}/api/vehicleStatus/${id}`, defaultPayload, authConfig(token));
    console.log("✅ VehicleStatus updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateVehicleStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteVehicleStatus = async ({ user, vehicleStatusUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = vehicleStatusUniqueId || driverCache.data?.[0]?.vehicleStatusUniqueId;
    if (!id) throw new Error("No vehicleStatusUniqueId found to delete");
    const result = await axios.delete(`${backendURL}/api/vehicleStatus/${id}`, authConfig(token));
    console.log("✅ VehicleStatus deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteVehicleStatus:", error.response?.data?.error || error.message);
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
  const vehicleStatusUniqueId = created?.data?.vehicleStatusUniqueId || created?.vehicleStatusUniqueId;
  if (!vehicleStatusUniqueId) {
    console.warn("⚠️  No ID returned");
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Helpers (from Driver/VehicleDriver.js)
  createVehicle,
  getRequirementOfVehicleDocument,
  attachVehiclesDocuments,
  // VehicleType
  testVehicleTypeWorkflow,
  testGetVehicleTypes,
  testCreateVehicleType,
  testUpdateVehicleType,
  testDeleteVehicleType,
  // VehicleStatusType
  testVehicleStatusTypeWorkflow,
  testGetVehicleStatusTypes,
  testCreateVehicleStatusType,
  testUpdateVehicleStatusType,
  testDeleteVehicleStatusType,
  // VehicleOwnership
  testVehicleOwnershipWorkflow,
  testGetVehicleOwnerships,
  testCreateVehicleOwnership,
  testUpdateVehicleOwnership,
  testDeleteVehicleOwnership,
  // VehicleDriver
  testVehicleDriverWorkflow,
  testGetVehicleDrivers,
  testCreateVehicleDriver,
  testUpdateVehicleDriver,
  testDeleteVehicleDriver,
  // VehicleProfile
  testVehicleProfileWorkflow,
  testGetVehicles,
  testCreateVehicle,
  testUpdateVehicle,
  testDeleteVehicle,
  // VehicleStatus
  testVehicleStatusWorkflow,
  testGetVehicleStatuses,
  testCreateVehicleStatus,
  testUpdateVehicleStatus,
  testDeleteVehicleStatus,
};
