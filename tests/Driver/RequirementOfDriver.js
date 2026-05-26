const { usersData } = require("../constants");
const { createDriverDocument } = require("./DriversDocuments");
const { createVehicle } = require("./VehicleDriver");
const getDriversAccountData = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.get(backendURL + "/api/driver/account", config);
    console.log("✅ Success! Requirement of Vehicle Document:");
    console.log(res.data);
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
const evaluateDriversDocumentVehicleRequirement = async () => {
  const userData = usersData["driver"];
  const vehicleData = userData.documentAndVehicleOfDriver.vehicle;

  if (!vehicleData) {
    await createVehicle(userData.token);
  }
  const unAttachedDocumentTypes =
    userData?.documentAndVehicleOfDriver?.unAttachedDocumentTypes;
  if (unAttachedDocumentTypes?.length > 0) {
    for await (const documentType of unAttachedDocumentTypes) {
      await createDriverDocument(userData.token, documentType);
    }
  }
};
module.exports = {
  getDriversAccountData,
  evaluateDriversDocumentVehicleRequirement,
};
