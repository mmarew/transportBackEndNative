const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const {
  COMPANY_VEHICLE_ENDPOINTS,
} = require("../../Routes/EndPoints/companyVehicle.endpoints");

const logCompanyError = (message, error) => {
  console.error(
    `CompanyVehicleError: ${message}`,
    error?.response?.data?.error || error?.message || error,
  );
};

/**
 * Assigns a driver's vehicle to the company fleet.
 * Requires the driver to have already created a vehicle (stored in usersData.driver.documentAndVehicleOfDriver.vehicle).
 */
const assignVehicleToCompany = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("assignVehicleToCompany failed, no token found.");
    return null;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    logCompanyError("assignVehicleToCompany failed, no company found.");
    return null;
  }

  const vehicleUniqueId =
    usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  if (!vehicleUniqueId) {
    logCompanyError(
      "assignVehicleToCompany failed, no vehicleUniqueId found on driver.",
    );
    return null;
  }
  //check if vehicle is assigned to protect double assignments,
  const assignedVehicles = await getCompanyVehicles({});

  // find if vehicleUniqueId is already in assignedVehicles
  for (const assignedVehicle of assignedVehicles || []) {
    if (assignedVehicle.vehicleUniqueId === vehicleUniqueId) {
      return { message: "success", data: "vehicle already assigned before" };
    }
  }
  const url = backendURL + COMPANY_VEHICLE_ENDPOINTS.ASSIGN_VEHICLE;
  const payload = {
    companyUniqueId: company.companyUniqueId,
    vehicleUniqueId,
  };
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.post(url, payload, config);
    if (!usersData.companyAdmin.fleet) usersData.companyAdmin.fleet = [];
    usersData.companyAdmin.fleet.push(res.data.data);
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to assign vehicle to company fleet.", error);
    return null;
  }
};

/**
 * Fetches all vehicles currently assigned to the company fleet.
 */
const getCompanyVehicles = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("getCompanyVehicles failed, no token found.");
    return [];
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    logCompanyError("getCompanyVehicles failed, no company found.");
    return [];
  }

  const url =
    backendURL +
    COMPANY_VEHICLE_ENDPOINTS.GET_COMPANY_VEHICLES +
    `?companyUniqueId=${company.companyUniqueId}&assignmentStatus=active`;
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.get(url, config);
    usersData.companyAdmin.fleet = res.data.data;
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to get company vehicles.", error);
    return [];
  }
};

/**
 * Removes a vehicle from the company fleet by its companyVehicleUniqueId.
 */
const removeVehicleFromCompany = async ({
  userType = "companyAdmin",
  companyVehicleUniqueId,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("removeVehicleFromCompany failed, no token found.");
    return null;
  }

  if (!companyVehicleUniqueId) {
    logCompanyError(
      "removeVehicleFromCompany failed, no companyVehicleUniqueId provided.",
    );
    return null;
  }

  const url =
    backendURL +
    COMPANY_VEHICLE_ENDPOINTS.REMOVE_VEHICLE.replace(
      ":companyVehicleUniqueId",
      companyVehicleUniqueId,
    );
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.delete(url, config);
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to remove vehicle from company fleet.", error);
    return null;
  }
};

module.exports = {
  assignVehicleToCompany,
  getCompanyVehicles,
  removeVehicleFromCompany,
};
