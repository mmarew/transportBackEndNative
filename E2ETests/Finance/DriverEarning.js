// GET-only for DriverEarning
// Retrieves driver earnings filtered by date range with pagination

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/driverEarning";
const cache = { data: null };

const testGetDriverEarnings = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const driverUniqueId =
      filters?.driverUniqueId ||
      usersData?.driver?.accountData?.userData?.userUniqueId ||
      "self";
    const defaultFilters = {
      driverUniqueId,
      limit: 10,
      ...filters,
    };
    const query = new URLSearchParams(defaultFilters).toString();
    const url = `${BASE_URL}?${query}`;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ DriverEarnings fetched:", result.data.data?.length ?? 0);
    if (result.data.data?.length) {
      const sample = result.data.data[0];
      console.log(
        "   Sample — mode:",
        sample.journey?.requestMode,
        "| earning:",
        sample.journey?.effectiveEarning,
        "| company:",
        sample.company?.companyName ?? "individual",
      );
    }
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetDriverEarnings:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDriverEarningWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── DriverEarning Workflow ──");
  const result = await testGetDriverEarnings({ user });
  if (usersData?.driver?.accountData?.userData?.userUniqueId) {
    await testGetDriverEarnings({
      user,
      filters: {
        driverUniqueId: usersData.driver.accountData.userData.userUniqueId,
        fromDate: "2026-01-01",
        toDate: "2030-12-31",
      },
    });
  }
  console.log("── DriverEarning Workflow complete ──\n");
  return { data: result };
};

module.exports = {
  testDriverEarningWorkflow,
  testGetDriverEarnings,
};
