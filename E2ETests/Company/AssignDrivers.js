const { usersData, backendURL } = require("../constants");
const axios = require("axios");

/**
 * Auto-assigns available drivers and vehicles to all open slots
 * in an accepted company bid batch.
 *
 * @param {Object} bid - A company bid offer object containing companyBidRequestUniqueId.
 */
const assignDrivers = async ({ bid }) => {
  const token = usersData?.companyAdmin?.token;
  if (!token) {
    console.log("❌ assignDrivers failed, no token found.");
    return;
  }

  if (!bid?.companyBidRequestUniqueId) {
    console.log("❌ assignDrivers failed, no companyBidRequestUniqueId in bid.");
    return;
  }

  const url = backendURL + "/api/company/assignments/auto";
  const payload = {
    companyBidRequestUniqueId: bid.companyBidRequestUniqueId,
  };
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.post(url, payload, config);
    console.log("✅ Success! Drivers auto-assigned.");
    console.log(
      `   Assigned: ${res.data.data?.assignedCount ?? "?"}, ` +
      `Unassigned: ${res.data.data?.unassignedCount ?? "?"}`,
    );
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to auto-assign drivers.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

module.exports = { assignDrivers };
