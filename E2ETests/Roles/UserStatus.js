const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/userStatuses";

// ── GET all ────────────────────────────────────────────────────────────────────
// Note: Backend might not have GET_ALL for UserStatus in endpoints? Let's check routes.
// From routes: Only GET_USER_STATUS_BY_ID is defined. 
// We will test Create, Update, Delete.
// But wait, if there's no GET ALL, how do we know the ID of the created one?
// create will return the id.
// We will create, update, delete.

const testCreateUserStatus = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ UserStatus created:", result.data.statusUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateUserStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateUserStatus = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId;
    if (!id) throw new Error("No ID found to update");

    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, payload, authConfig(token));
    console.log("✅ UserStatus updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateUserStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteUserStatus = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId;
    if (!id) throw new Error("No ID found to delete");

    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ UserStatus deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteUserStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testGetUserStatusById = async ({ user, uniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const id = uniqueId;
    if (!id) throw new Error("No ID found to get");

    const result = await axios.get(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ UserStatus fetched:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testGetUserStatusById:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUserStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── UserStatus Workflow ──");

  const createPayload = {
    statusName: "testStatus" + Date.now(),
    statusDescription: "test status description",
  };

  const created = await testCreateUserStatus({ user, payload: createPayload });
  const uniqueId = created?.statusUniqueId;
  if (!uniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetUserStatusById({ user, uniqueId });
  
  const updatePayload = {
    statusName: "updatedStatus",
    statusDescription: "updated description",
  };
  await testUpdateUserStatus({ user, uniqueId, payload: updatePayload });
  await testGetUserStatusById({ user, uniqueId });
  await testDeleteUserStatus({ user, uniqueId });

  console.log("── UserStatus Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  testUserStatusWorkflow,
  testCreateUserStatus,
  testUpdateUserStatus,
  testDeleteUserStatus,
  testGetUserStatusById,
};
