const { usersData, backendURL } = require("../constants");
const axios = require("axios");
let vehicleRequirements = null;

const createVehicle = async (token) => {
  //get vehicle types first
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const vehicleTypes = await axios.get(
      backendURL + "/api/admin/vehicleTypes",
      config,
    );
    console.log("✅ Success! Vehicle Types:");
    // console.log(vehicleTypes.data);
    const vehicleTypeUniqueId = vehicleTypes.data.data[0].vehicleTypeUniqueId;

    const payload = {
      licensePlate: "123456",
      color: "white color",
      vehicleTypeUniqueId,
      isDriverOwnerOfVehicle: false,
    };
    console.log("payload", payload);
    // In the future you will extract a valid vehicle type ID from vehicleTypes.data
    // and pass it in this payload instead of {}
    const res = await axios.post(
      backendURL + "/api/user/vehicles/driverUserUniqueId/self",
      payload,
      config,
    );
    console.log("✅ Success! Vehicle Created:");
    console.log(res.data);
  } catch (error) {
    console.log("❌ Failed to create vehicle.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
  }
};
const getRequirementOfVehicleDocument = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.get(
      backendURL + "/api/RoleDocumentRequirements?roleId=9",
      config,
    );
    console.log("✅ Success! Requirement of Vehicle Document:");
    console.log(res.data);
    vehicleRequirements = res?.data?.data;
  } catch (error) {
    console.log("❌ Failed to get requirement of vehicle document.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
  }
};
const attachVehiclesDocuments = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const formData = new FormData();
  formData.append();

  try {
    const res = await axios.post(
      backendURL + "/api/vehicle/attachDocuments/:vehicleUniqueId",
      {},
      config,
    );
    console.log("✅ Success! Attached Vehicle Document:");
    console.log(res.data);
  } catch (error) {
    console.log("❌ Failed to attach vehicle document.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
  }
};
module.exports = {
  attachVehiclesDocuments,
  getRequirementOfVehicleDocument,
  createVehicle,
};
