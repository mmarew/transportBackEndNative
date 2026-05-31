const { usersData, backendURL } = require("../constants");
const axios = require("axios");
const { COMPANY_VEHICLE_ENDPOINTS } = require("../../Routes/EndPoints/companyVehicle.endpoints");

/**
 * Assigns a driver's vehicle to the company fleet.
 * Requires the driver to have already created a vehicle (stored in usersData.driver.documentAndVehicleOfDriver.vehicle).
 */
const assignVehicleToCompany = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ assignVehicleToCompany failed, no token found.");
    return;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    console.log("❌ assignVehicleToCompany failed, no company found.");
    return;
  }

  const vehicleUniqueId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  console.log("🚀 ~ assignVehicleToCompany ~ usersData?.driver?.accountData:", usersData?.driver?.accountData.vehicle)
  if (!vehicleUniqueId) {
    console.log("❌ assignVehicleToCompany failed, no vehicleUniqueId found on driver.");
    return;
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
    console.log("✅ Success! Vehicle assigned to company fleet.");
    // Store the assigned vehicle record for use in later steps (e.g. auto-assign)
    if (!usersData.companyAdmin.fleet) usersData.companyAdmin.fleet = [];
    usersData.companyAdmin.fleet.push(res.data.data);
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to assign vehicle to company fleet.");
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

/**
 * Fetches all vehicles currently assigned to the company fleet.
 */
const getCompanyVehicles = async ({ userType = "companyAdmin" } = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ getCompanyVehicles failed, no token found.");
    return;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    console.log("❌ getCompanyVehicles failed, no company found.");
    return;
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
    console.log("✅ Success! Company vehicles fetched.");
    usersData.companyAdmin.fleet = res.data.data;
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to get company vehicles.");
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

/**
 * Removes a vehicle from the company fleet by its companyVehicleUniqueId.
 */
const removeVehicleFromCompany = async ({
  userType = "companyAdmin",
  companyVehicleUniqueId,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ removeVehicleFromCompany failed, no token found.");
    return;
  }

  if (!companyVehicleUniqueId) {
    console.log("❌ removeVehicleFromCompany failed, no companyVehicleUniqueId provided.");
    return;
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
    console.log("✅ Success! Vehicle removed from company fleet.");
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to remove vehicle from company fleet.");
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

module.exports = {
  assignVehicleToCompany,
  getCompanyVehicles,
  removeVehicleFromCompany,
};
