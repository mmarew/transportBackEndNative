const { usersData, backendURL } = require("../constants");
const { createDriverDocument } = require("./DriversDocuments");
const { createVehicle, attachVehiclesDocuments } = require("./VehicleDriver");
const axios = require("axios");

const getDriversAccountData = async ({ token }) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.get(backendURL + "/api/driver/account", config);
    console.log("✅ Driver Account Data fetched");
    usersData["driver"]["accountData"] = res.data;
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get driver account data:", error.response?.data?.error || error.message);
    return null;
  }
};

const evaluateDriversDocumentVehicleRequirement = async () => {
  const userData = usersData["driver"];
  const token = userData.token;

  // 1. Fetch current account data
  let accountData = await getDriversAccountData({ token });
  if (!accountData) return;

  // 2. If no vehicle, create one and re-fetch account data
  if (!accountData.vehicle) {
    await createVehicle(token);
    accountData = await getDriversAccountData({ token });
  }

  const vehicleUniqueId = accountData?.vehicle?.vehicleUniqueId;

  // --- Track already uploaded documents ---
  const uploadedDocumentTypeIds = new Set();
  if (accountData?.attachedDocumentsByStatus) {
    const statuses = ["PENDING", "ACCEPTED", "REJECTED"];
    for (const status of statuses) {
      const docsList = accountData.attachedDocumentsByStatus[status] || [];
      docsList.forEach((doc) => {
        uploadedDocumentTypeIds.add(doc.documentTypeId);
      });
    }
  }

  // 3. Process unAttached documents (both user and vehicle docs)
  const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];
  
  if (unAttachedDocumentTypes.length > 0) {
    for (const documentType of unAttachedDocumentTypes) {
      if (!uploadedDocumentTypeIds.has(documentType.documentTypeId)) {
        // Vehicle documents (roleId === 9)
        if (documentType.roleId === 9 && vehicleUniqueId) {
          await attachVehiclesDocuments({ token, documentType, vehicleUniqueId });
        }
        // User documents (roleId === 2)
        else if (documentType.roleId === 2) {
          await createDriverDocument(token, documentType);
        }
        uploadedDocumentTypeIds.add(documentType.documentTypeId);
      }
    }
  } else {
    console.log("✅ All required documents are already uploaded!");
  }
};

module.exports = {
  getDriversAccountData,
  evaluateDriversDocumentVehicleRequirement,
};
