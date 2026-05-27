const { usersData, backendURL } = require("../constants");
const { createDriverDocument } = require("./DriversDocuments");
const { createVehicle, attachVehiclesDocuments } = require("./VehicleDriver");
const axios = require("axios");
const getDriversAccountData = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.get(backendURL + "/api/driver/account", config);
    console.log("✅ Success! Driver Account Data fetched.");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get driver account data.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
    return null;
  }
};

const evaluateDriversDocumentVehicleRequirement = async () => {
  const userData = usersData["driver"];
  const token = userData.token;

  // 1. Fetch current account data
  let accountData = await getDriversAccountData(token);
  if (!accountData) return;

  // 2. If no vehicle, create one and re-fetch account data
  if (!accountData.vehicle) {
    await createVehicle(token);
    accountData = await getDriversAccountData(token);
  }

  const vehicleUniqueId = accountData?.vehicle?.vehicleUniqueId;

  // --- DEFENSIVE PROGRAMMING: PREVENT DUPLICATES ---
  // We look through all PENDING, ACCEPTED, and REJECTED docs
  // and keep track of their documentTypeIds so we never upload them twice.
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

  // 3. Process unAttachedDriverDocuments
  const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];
  if (unAttachedDocumentTypes.length > 0) {
    for (const documentType of unAttachedDocumentTypes) {
      // Only upload if we haven't seen this document type ID before!
      if (!uploadedDocumentTypeIds.has(documentType.documentTypeId)) {
        await createDriverDocument(token, documentType);
        uploadedDocumentTypeIds.add(documentType.documentTypeId); // Mark as uploaded
      } else {
        console.log(
          `⏩ Skipping Driver Document (Already uploaded): ${documentType.documentTypeName}`,
        );
      }
    }
  }

  // 4. Process Vehicle Documents
  const requiredDocs = accountData?.requiredDocuments || [];

  // Filter for docs that belong to Vehicle (roleId === 9)
  // AND lack an attachedDocumentId
  // AND haven't been uploaded already
  const missingVehicleDocs = requiredDocs.filter(
    (doc) =>
      doc.roleId === 9 &&
      !doc.attachedDocumentId &&
      !uploadedDocumentTypeIds.has(doc.documentTypeId),
  );

  if (vehicleUniqueId && missingVehicleDocs.length > 0) {
    for (const documentType of missingVehicleDocs) {
      await attachVehiclesDocuments(token, documentType, vehicleUniqueId);
      uploadedDocumentTypeIds.add(documentType.documentTypeId); // Mark as uploaded
    }
  } else if (vehicleUniqueId) {
    console.log("✅ All Vehicle Documents are already uploaded!");
  }
};

module.exports = {
  getDriversAccountData,
  evaluateDriversDocumentVehicleRequirement,
};
