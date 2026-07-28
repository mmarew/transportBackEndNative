// Account endpoints — profile and status for all role types.
// Use testGetAccountData(userType) as the single source for fetching any user's account.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  ACCOUNT_ENDPOINTS,
} = require("../../Routes/EndPoints/account.endpoints");

// Role → account endpoint mapping
const ROLE_ACCOUNT_ENDPOINTS = {
  driver: ACCOUNT_ENDPOINTS.DRIVER_ACCOUNT,
  shipper: ACCOUNT_ENDPOINTS.SHIPPER_ACCOUNT,
  companyAdmin: ACCOUNT_ENDPOINTS.COMPANY_ADMIN_ACCOUNT,
  dispatcher: ACCOUNT_ENDPOINTS.DISPATCHER_ACCOUNT,
};

// ── GET account data for any role ─────────────────────────────────────────────
// Replaces getDriversAccountData, getShipperAccountData, etc.
// Caches the result back into usersData[userType].accountData
const testGetAccountData = async ({
  userType = "driver",
  isFetchMandatory = true,
} = {}) => {
  // Return cached data if available and fetch is not mandatory
  if (!isFetchMandatory && usersData[userType]?.accountData) {
    return usersData[userType].accountData;
  }

  const token = usersData[userType]?.token;
  if (!token) {
    console.warn(`⏩ testGetAccountData (${userType}) skipped — no token`);
    return null;
  }

  const endpoint = ROLE_ACCOUNT_ENDPOINTS[userType];
  if (!endpoint) {
    console.warn(
      `⏩ testGetAccountData skipped — no account endpoint for role: ${userType}`,
    );
    return null;
  }

  try {
    const result = await axios.get(backendURL + endpoint, authConfig(token));
    console.log(`✅ Account data fetched (${userType})`);
    usersData[userType].accountData = result.data;
    return result.data;
  } catch (error) {
    console.error(
      `❌ testGetAccountData (${userType}):`,
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET account status (admin queries any user's status by phone + roleId) ────
const testGetAccountStatus = async ({ userType = "driver" } = {}) => {
  const token = usersData.admin?.token;
  const userData = usersData[userType];

  if (!token) throw new Error("admin token not found");
  if (!userData?.token) {
    console.warn(`⏩ testGetAccountStatus (${userType}) skipped — no token`);
    return { skipped: true };
  }

  try {
    const result = await axios.get(
      backendURL +
        ACCOUNT_ENDPOINTS.ACCOUNT_STATUS +
        `?roleId=${userData.roleId}&phoneNumber=${encodeURIComponent(userData.phoneNumber)}`,
      authConfig(token),
    );
    console.log(
      `✅ Account status (${userType}):`,
      result.data?.data?.currentStatusName ?? result.data?.status ?? "OK",
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

// ── Full workflow ──────────────────────────────────────────────────────────────
const testAccountWorkflow = async () => {
  console.log("\n── Account Workflow ──");

  // Fetch account data for all active users
  await testGetAccountData({ userType: "driver" });
  await testGetAccountData({ userType: "shipper" });
  await testGetAccountData({ userType: "companyAdmin" });

  // Check account status via admin
  await testGetAccountStatus({ userType: "driver" });
  await testGetAccountStatus({ userType: "shipper" });

  console.log("── Account Workflow complete ──\n");
};

module.exports = {
  testAccountWorkflow,
  testGetAccountData,
  testGetAccountStatus,
  // Keep old names as aliases so existing imports don't break
  testGetDriverAccountMe: (opts) =>
    testGetAccountData({ userType: "driver", ...opts }),
  testGetCompanyAdminAccountMe: (opts) =>
    testGetAccountData({ userType: "companyAdmin", ...opts }),
};
