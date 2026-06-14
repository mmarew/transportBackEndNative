// Account Status & Profile Endpoints
// Tests the "account" endpoints used by all role types to get their own profile data.
// Routes are: /api/account/status, /api/driver/account (via companyAdmin), etc.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  ACCOUNT_ENDPOINTS,
} = require("../../Routes/EndPoints/account.endpoints");

// ── GET: /api/account/status ──────────────────────────────────────────────────
// Returns the current account status for the authenticated user.
const testGetAccountStatus = async ({ userType = "driver" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    const adminToken = usersData.admin.token;
    if (!token) {
      console.log(`⏩ testGetAccountStatus (${userType}) skipped — no token`);
      return { skipped: true };
    }
    console.log(
      " users data ",
      `?roleId=${usersData[userType].roleId}&phoneNumber=${usersData[userType].phoneNumber}`,
    );
    const result = await axios.get(
      backendURL +
        ACCOUNT_ENDPOINTS.ACCOUNT_STATUS +
        `?roleId=${usersData[userType].roleId}&phoneNumber=${encodeURIComponent(usersData[userType].phoneNumber)}`,
      authConfig(adminToken),
    );
    console.log(
      `✅ Account status (${userType}):`,
      result.data?.status ?? result.data?.data?.status ?? "OK",
    );
    return result.data;
  } catch (error) {
    console.error(
      `❌ testGetAccountStatus (${userType}):`,
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: /api/driver/account ──────────────────────────────────────────────────
const testGetDriverAccountMe = async ({ userType = "driver" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log(`⏩ testGetDriverAccountMe skipped — no ${userType} token`);
      return { skipped: true };
    }
    const result = await axios.get(
      backendURL + ACCOUNT_ENDPOINTS.DRIVER_ACCOUNT,
      authConfig(token),
    );
    console.log(
      "✅ Driver account (me) fetched:",
      result.data?.data?.userUniqueId ?? "OK",
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetDriverAccountMe:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: /api/companyAdmin/account ────────────────────────────────────────────
const testGetCompanyAdminAccountMe = async ({
  userType = "companyAdmin",
} = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log(
        `⏩ testGetCompanyAdminAccountMe skipped — no ${userType} token`,
      );
      return { skipped: true };
    }
    const result = await axios.get(
      backendURL + ACCOUNT_ENDPOINTS.COMPANY_ADMIN_ACCOUNT,
      authConfig(token),
    );
    console.log(
      "✅ CompanyAdmin account (me) fetched:",
      result.data?.data?.userUniqueId ?? "OK",
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyAdminAccountMe:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testAccountWorkflow = async () => {
  console.log("\n── Account Workflow ──");

  await testGetAccountStatus({ userType: "driver" });
  await testGetAccountStatus({ userType: "shipper" });
  await testGetDriverAccountMe({ userType: "driver" });
  await testGetCompanyAdminAccountMe({ userType: "companyAdmin" });

  console.log("── Account Workflow complete ──\n");
};

module.exports = {
  testAccountWorkflow,
  testGetAccountStatus,
  testGetDriverAccountMe,
  testGetCompanyAdminAccountMe,
};
