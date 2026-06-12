const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/commissionStatus/admin/commission-statuses";
const cache = { data: null };

// ── GET all ────────────────────────────────────────────────────────────────────
const testGetCommissionStatuses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ CommissionStatuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCommissionStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateCommissionStatus = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ CommissionStatus created:", result.data.data?.id);
    return result.data.data;
  } catch (error) {
    console.error("❌ testCreateCommissionStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateCommissionStatus = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.id;
    if (!id) throw new Error("No ID found to update");

    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, payload, authConfig(token));
    console.log("✅ CommissionStatus updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateCommissionStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteCommissionStatus = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId || cache.data?.[0]?.id;
    if (!id) throw new Error("No ID found to delete");

    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ CommissionStatus deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCommissionStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCommissionStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CommissionStatus Workflow ──");

  await testGetCommissionStatuses({ user });

  const createPayload = {
    statusName: "TEST_STATUS",
    description: "test description",
  };

  const created = await testCreateCommissionStatus({ user, payload: createPayload });
  const uniqueId = created?.id;
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetCommissionStatuses({ user });
  
  const updatePayload = {
    statusName: "UPDATED_TEST_STATUS",
    description: "updated description",
  };
  await testUpdateCommissionStatus({ user, uniqueId, payload: updatePayload });
  await testGetCommissionStatuses({ user });
  await testDeleteCommissionStatus({ user, uniqueId });
  await testGetCommissionStatuses({ user });

  console.log("── CommissionStatus Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  testCommissionStatusWorkflow,
  testGetCommissionStatuses,
  testCreateCommissionStatus,
  testUpdateCommissionStatus,
  testDeleteCommissionStatus,
};
