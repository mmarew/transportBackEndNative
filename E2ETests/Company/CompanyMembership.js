// CRUD for CompanyMembership
// Manages which users belong to which company and their role within it

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/memberships";
const cache = { data: null };

const resolveCompanyRoleUniqueId = async (token) => {
  try {
    const res = await axios.get(
      backendURL + "/api/company/roles",
      authConfig(token),
    );
    const list = res.data.data || res.data;
    if (!Array.isArray(list)) return null;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const valid = list.find((r) => uuidPattern.test(r.companyRoleUniqueId));
    return valid?.companyRoleUniqueId || null;
  } catch {
    return null;
  }
};

const testGetCompanyMemberships = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log(
      "✅ CompanyMemberships fetched:",
      result.data.data?.length ?? 0,
    );
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyMemberships:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateCompanyMembership = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.companyAdmin?.token;
    if (!token) throw new Error("token not found");
    const companyUniqueId =
      payload?.companyUniqueId ||
      usersData?.companyAdmin?.companies?.[0]?.companyUniqueId;
    const driverUserUniqueId =
      payload?.userUniqueId ||
      usersData?.driver?.accountData?.userData?.userUniqueId;
    if (!companyUniqueId) {
      console.warn(
        "⏩ testCreateCompanyMembership skipped — no companyUniqueId",
      );
      return { skipped: true };
    }
    if (!driverUserUniqueId) {
      console.warn(
        "⏩ testCreateCompanyMembership skipped — no driver userUniqueId",
      );
      return { skipped: true };
    }
    const companyRoleUniqueId =
      payload?.companyRoleUniqueId || (await resolveCompanyRoleUniqueId(token));
    const defaultPayload = {
      companyUniqueId,
      companyRoleUniqueId,
      membershipStartDate: "2026-01-01",
      ...payload,
    };
    const result = await axios.post(
      `${backendURL}${BASE_URL}/${driverUserUniqueId}`,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ CompanyMembership created:",
      result.data.data?.membershipUniqueId || result.data.membershipUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateCompanyMembership:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeactivateCompanyMembership = async ({
  user,
  membershipUniqueId,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = membershipUniqueId || cache.data?.[0]?.membershipUniqueId;
    if (!id) throw new Error("No membershipUniqueId found to deactivate");
    const result = await axios.patch(
      `${backendURL}${BASE_URL}/${id}/deactivate`,
      {},
      authConfig(token),
    );
    console.log("✅ CompanyMembership deactivated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeactivateCompanyMembership:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testReactivateCompanyMembership = async ({
  user,
  membershipUniqueId,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = membershipUniqueId || cache.data?.[0]?.membershipUniqueId;
    if (!id) throw new Error("No membershipUniqueId found to reactivate");
    const result = await axios.patch(
      `${backendURL}${BASE_URL}/${id}/reactivate`,
      {},
      authConfig(token),
    );
    console.log("✅ CompanyMembership reactivated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testReactivateCompanyMembership:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteCompanyMembership = async ({
  user,
  membershipUniqueId,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = membershipUniqueId || cache.data?.[0]?.membershipUniqueId;
    if (!id) throw new Error("No membershipUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ CompanyMembership deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteCompanyMembership:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCompanyMembershipWorkflow = async ({
  user = usersData.companyAdmin,
} = {}) => {
  console.log("\n── CompanyMembership Workflow ──");
  await testGetCompanyMemberships({ user });
  const created = await testCreateCompanyMembership({ user });
  if (created?.skipped) {
    console.log(
      "⏩ CompanyMembership workflow skipped — missing prerequisites",
    );
    return { skipped: true };
  }
  const membershipUniqueId =
    created?.data?.membershipUniqueId || created?.membershipUniqueId;
  if (!membershipUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetCompanyMemberships({ user });
  await testGetCompanyMemberships({
    user,
    filters: {
      companyUniqueId: usersData?.companyAdmin?.companies?.[0]?.companyUniqueId,
    },
  });
  await testDeactivateCompanyMembership({ user, membershipUniqueId });
  await testGetCompanyMemberships({ user });
  await testReactivateCompanyMembership({ user, membershipUniqueId });
  await testGetCompanyMemberships({ user });
  await testDeleteCompanyMembership({ user, membershipUniqueId });
  await testGetCompanyMemberships({ user });
  console.log("── CompanyMembership Workflow complete ──\n");
  return { membershipUniqueId };
};

module.exports = {
  testCompanyMembershipWorkflow,
  testGetCompanyMemberships,
  testCreateCompanyMembership,
  testDeactivateCompanyMembership,
  testReactivateCompanyMembership,
  testDeleteCompanyMembership,
};
