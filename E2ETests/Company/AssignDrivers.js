const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const { authConfig } = require("../Utils");

const logCompanyError = (message, error) => {
  console.error(
    `CompanyAssignmentError: ${message}`,
    error?.response?.data?.error || error?.message || error,
  );
};

/**
 * Auto-assigns available drivers and vehicles to all open slots
 * in an accepted company bid batch.
 *
 * @param {Object} bid - A company bid offer object containing companyBidRequestUniqueId.
 */
const assignDrivers = async ({ bid }) => {
  const token = usersData?.companyAdmin?.token;
  if (!token) {
    logCompanyError("assignDrivers failed, no token found.");
    return null;
  }
  const companyBidRequestUniqueId = bid.offers?.[0]?.companyBidRequestUniqueId;
  if (!companyBidRequestUniqueId) {
    logCompanyError(
      "assignDrivers failed, no companyBidRequestUniqueId in bid.",
    );
    return null;
  }

  const url = backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.AUTO_ASSIGN;
  const payload = {
    companyBidRequestUniqueId,
  };
  const config = authConfig(token);

  try {
    const res = await axios.post(url, payload, config);
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to auto-assign drivers.", error);
    return null;
  }
};

module.exports = { assignDrivers };
