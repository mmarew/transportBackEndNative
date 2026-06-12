// CRUD for RoleDocumentRequirements
// Defines which documents are required for each role (driver license for roleId 2, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/RoleDocumentRequirements";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetRoleDocumentRequirements = async ({ user, roleId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = roleId ? `?roleId=${roleId}` : "";
    const result = await axios.get(backendURL + BASE_URL + query, authConfig(token));
    console.log("✅ RoleDocumentRequirements fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetRoleDocumentRequirements:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateRoleDocumentRequirement = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      roleId: 2,       // driver
      documentTypeId: 1, // driver's license
      isDocumentMandatory: true,
      isExpirationDateRequired: true,
      isFileNumberRequired: true,
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ RoleDocumentRequirement created:", result.data.roleDocumentRequirementUniqueId || result.data.data?.roleDocumentRequirementUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateRoleDocumentRequirement:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateRoleDocumentRequirement = async ({ user, roleDocumentRequirementUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = roleDocumentRequirementUniqueId || cache.data?.[0]?.roleDocumentRequirementUniqueId;
    if (!id) throw new Error("No roleDocumentRequirementUniqueId found to update");
    const defaultPayload = { isDocumentMandatory: false, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ RoleDocumentRequirement updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateRoleDocumentRequirement:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteRoleDocumentRequirement = async ({ user, roleDocumentRequirementUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = roleDocumentRequirementUniqueId || cache.data?.[0]?.roleDocumentRequirementUniqueId;
    if (!id) throw new Error("No roleDocumentRequirementUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ RoleDocumentRequirement deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteRoleDocumentRequirement:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testRoleDocumentRequirementsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── RoleDocumentRequirements Workflow ──");

  // GET all (no filter)
  await testGetRoleDocumentRequirements({ user });
  // GET filtered by driver role
  await testGetRoleDocumentRequirements({ user, roleId: 2 });

  const created = await testCreateRoleDocumentRequirement({ user });
  const roleDocumentRequirementUniqueId = created?.roleDocumentRequirementUniqueId || created?.data?.roleDocumentRequirementUniqueId;
  if (!roleDocumentRequirementUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetRoleDocumentRequirements({ user });
  await testUpdateRoleDocumentRequirement({ user, roleDocumentRequirementUniqueId });
  await testGetRoleDocumentRequirements({ user });
  await testDeleteRoleDocumentRequirement({ user, roleDocumentRequirementUniqueId });
  await testGetRoleDocumentRequirements({ user });

  console.log("── RoleDocumentRequirements Workflow complete ──\n");
  return { roleDocumentRequirementUniqueId };
};

module.exports = {
  testRoleDocumentRequirementsWorkflow,
  testGetRoleDocumentRequirements,
  testCreateRoleDocumentRequirement,
  testUpdateRoleDocumentRequirement,
  testDeleteRoleDocumentRequirement,
};
