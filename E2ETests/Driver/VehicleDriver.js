const { backendURL } = require("../constants");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

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
      licensePlate: "123412",
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
const attachVehiclesDocuments = async ({
  token,
  documentType,
  vehicleUniqueId,
}) => {
  const form = new FormData();
  const dummyFilePath = path.join(__dirname, "../dummy.txt");

  // 1. Attach the file
  form.append(
    documentType.uploadedDocumentName,
    fs.createReadStream(dummyFilePath),
  );

  // 2. Attach Document Type ID
  form.append(documentType.uploadedDocumentTypeId, documentType.documentTypeId);

  // 3. Attach File Number if required
  if (documentType.isFileNumberRequired === 1) {
    form.append(documentType.uploadedDocumentFileNumber, "VEH-" + Date.now());
  }

  // 4. Attach Expiration Date if required
  if (documentType.isExpirationDateRequired === 1) {
    form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
  }

  // 5. Attach Description if required
  if (documentType.isDescriptionRequired === 1) {
    form.append(
      documentType.uploadedDocumentDescription,
      "Vehicle document dummy description",
    );
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
  };

  try {
    const res = await axios.post(
      backendURL + `/api/vehicle/attachDocuments/${vehicleUniqueId}`,
      form,
      config,
    );
    console.log(`✅ Uploaded Vehicle Document: ${documentType.documentTypeName}`);
  } catch (error) {
    console.log(`❌ Failed to upload vehicle document: ${documentType.documentTypeName}`);
    console.log("Error:", error.response?.data?.error || error.message);
  }
};
module.exports = {
  attachVehiclesDocuments,
  getRequirementOfVehicleDocument,
  createVehicle,
};
