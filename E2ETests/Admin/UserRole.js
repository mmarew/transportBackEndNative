// CRUD for UserRole (admin)
// Manages role assignments for users — assigning roles like Driver, Shipper, Admin

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/userRole";
const cache = { data: null };

const testGetUserRoles = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}/filter?${query}` : `${BASE_URL}/filter`;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ UserRoles fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetUserRoles:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateUserRole = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.supperAdmin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      userUniqueId:
        payload?.userUniqueId ||
        usersData?.driver?.accountData?.userData?.userUniqueId,
      roleId: 2,
      ...payload,
    };
    if (!defaultPayload.userUniqueId) {
      console.warn("⏩ testCreateUserRole skipped — no userUniqueId");
      return { skipped: true };
    }
    const result = await axios.post(
      backendURL + `${BASE_URL}/create`,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ UserRole created:",
      result.data.data?.userRoleUniqueId || result.data.userRoleUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateUserRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateUserRole = async ({ user, userRoleUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = userRoleUniqueId || cache.data?.[0]?.userRoleUniqueId;
    if (!id) throw new Error("No userRoleUniqueId found to update");
    const defaultPayload = { roleId: 1, ...payload };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ UserRole updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateUserRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteUserRole = async ({ user, userRoleUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = userRoleUniqueId || cache.data?.[0]?.userRoleUniqueId;
    if (!id) throw new Error("No userRoleUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ UserRole deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteUserRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUserRoleWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── UserRole Workflow ──");
  await testGetUserRoles({ user });
  const created = await testCreateUserRole({ user: usersData.supperAdmin });
  if (created?.skipped) {
    console.log("⏩ UserRole workflow skipped — missing prerequisites");
    return { skipped: true };
  }
  const userRoleUniqueId =
    created?.data?.userRoleUniqueId || created?.userRoleUniqueId;
  if (!userRoleUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetUserRoles({ user });
  await testUpdateUserRole({ user, userRoleUniqueId });
  await testGetUserRoles({ user });
  await testDeleteUserRole({ user, userRoleUniqueId });
  await testGetUserRoles({ user });
  console.log("── UserRole Workflow complete ──\n");
  return { userRoleUniqueId };
};

module.exports = {
  testUserRoleWorkflow,
  testGetUserRoles,
  testCreateUserRole,
  testUpdateUserRole,
  testDeleteUserRole,
};
