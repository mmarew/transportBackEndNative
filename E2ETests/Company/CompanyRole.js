// CRUD for CompanyRole
// Defines roles within a company (e.g., Manager, Dispatcher, Accountant)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/roles";
const cache = { data: null };

const testGetCompanyRoles = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ CompanyRoles fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyRoles:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetCompanyRoleById = async ({ user, companyRoleUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyRoleUniqueId || cache.data?.[0]?.companyRoleUniqueId;
    if (!id) throw new Error("No companyRoleUniqueId found");
    const result = await axios.get(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ CompanyRole fetched by ID:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyRoleById:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateCompanyRole = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      companyRoleName: "E2E_TEST_ROLE_" + Date.now(),
      companyRoleDescription: "E2E test company role",
      ...payload,
    };
    const result = await axios.post(
      backendURL + BASE_URL,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ CompanyRole created:",
      result.data.data?.companyRoleUniqueId || result.data.companyRoleUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateCompanyRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateCompanyRole = async ({
  user,
  companyRoleUniqueId,
  payload,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyRoleUniqueId || cache.data?.[0]?.companyRoleUniqueId;
    if (!id) throw new Error("No companyRoleUniqueId found to update");
    const defaultPayload = {
      companyRoleName: "E2E_UPDATED_ROLE",
      companyRoleDescription: "Updated description",
      ...payload,
    };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ CompanyRole updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateCompanyRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteCompanyRole = async ({ user, companyRoleUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyRoleUniqueId || cache.data?.[0]?.companyRoleUniqueId;
    if (!id) throw new Error("No companyRoleUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ CompanyRole deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteCompanyRole:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCompanyRoleWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CompanyRole Workflow ──");
  await testGetCompanyRoles({ user });
  const created = await testCreateCompanyRole({ user });
  const companyRoleUniqueId =
    created?.data?.companyRoleUniqueId || created?.companyRoleUniqueId;
  if (!companyRoleUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetCompanyRoles({ user });
  await testGetCompanyRoleById({ user, companyRoleUniqueId });
  await testUpdateCompanyRole({ user, companyRoleUniqueId });
  await testGetCompanyRoles({ user });
  await testDeleteCompanyRole({ user, companyRoleUniqueId });
  await testGetCompanyRoles({ user });
  console.log("── CompanyRole Workflow complete ──\n");
  return { companyRoleUniqueId };
};

module.exports = {
  testCompanyRoleWorkflow,
  testGetCompanyRoles,
  testGetCompanyRoleById,
  testCreateCompanyRole,
  testUpdateCompanyRole,
  testDeleteCompanyRole,
};
