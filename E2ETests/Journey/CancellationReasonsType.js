// CRUD for CancellationReasonsType
// Admin-managed list of reasons drivers/shippers can choose when cancelling a journey

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/cancellationReasons";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetCancellationReasonTypes = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ CancellationReasonTypes fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCancellationReasonTypes:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateCancellationReasonType = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      cancellationReason: "E2E test cancellation reason — " + Date.now(),
      roleId: 1,
      requestMode: "both",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ CancellationReasonType created:", result.data.cancellationReasonTypeUniqueId || result.data.data?.cancellationReasonTypeUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCancellationReasonType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateCancellationReasonType = async ({ user, cancellationReasonTypeUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = cancellationReasonTypeUniqueId || cache.data?.[0]?.cancellationReasonTypeUniqueId;
    if (!id) throw new Error("No ID found to update");
    const defaultPayload = { cancellationReason: "Updated E2E test cancellation reason", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ CancellationReasonType updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateCancellationReasonType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteCancellationReasonType = async ({ user, cancellationReasonTypeUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = cancellationReasonTypeUniqueId || cache.data?.[0]?.cancellationReasonTypeUniqueId;
    if (!id) throw new Error("No ID found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ CancellationReasonType deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCancellationReasonType:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCancellationReasonsTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CancellationReasonsType Workflow ──");

  await testGetCancellationReasonTypes({ user });

  const created = await testCreateCancellationReasonType({ user });
  const cancellationReasonTypeUniqueId = created?.cancellationReasonTypeUniqueId || created?.data?.cancellationReasonTypeUniqueId;
  if (!cancellationReasonTypeUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetCancellationReasonTypes({ user });
  await testUpdateCancellationReasonType({ user, cancellationReasonTypeUniqueId });
  await testGetCancellationReasonTypes({ user });
  await testDeleteCancellationReasonType({ user, cancellationReasonTypeUniqueId });
  await testGetCancellationReasonTypes({ user });

  console.log("── CancellationReasonsType Workflow complete ──\n");
  return { cancellationReasonTypeUniqueId };
};

module.exports = {
  testCancellationReasonsTypeWorkflow,
  testGetCancellationReasonTypes,
  testCreateCancellationReasonType,
  testUpdateCancellationReasonType,
  testDeleteCancellationReasonType,
};
