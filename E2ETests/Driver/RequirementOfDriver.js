const { usersData } = require("../constants");
const { createDriverDocument } = require("./DriversDocuments");
const { createVehicle, attachVehiclesDocuments } = require("./VehicleDriver");
const { testGetAccountData } = require("../Auth/Account");

// Thin wrapper kept for backward compatibility — delegates to testGetAccountData
const getDriversAccountData = async ({ token, isFetchMandatory = true }) => {
  if (!token && !usersData.driver?.token) {
    throw new Error("Driver token is missing. Cannot fetch account data.");
  }
  return testGetAccountData({ userType: "driver", isFetchMandatory });
};

const evaluateDriversDocumentVehicleRequirement = async () => {
  const token = usersData.driver?.token;
  if (!token) throw new Error("Driver token is missing. Cannot evaluate document requirements.");

  // 1. Fetch current account data
  let accountData = await testGetAccountData({ userType: "driver" });
  if (!accountData) throw new Error("Failed to fetch driver account data");

  // 2. If no vehicle, create one and re-fetch
  if (!accountData.vehicle) {
    await createVehicle(token);
    accountData = await testGetAccountData({ userType: "driver" });
    if (!accountData.vehicle) throw new Error("Failed to create vehicle for driver");
  }

  const vehicleUniqueId = accountData?.vehicle?.vehicleUniqueId;

  // Track already uploaded documents to avoid duplicates
  const uploadedDocumentTypeIds = new Set();
  if (accountData?.attachedDocumentsByStatus) {
    for (const status of ["PENDING", "ACCEPTED", "REJECTED"]) {
      (accountData.attachedDocumentsByStatus[status] || []).forEach((doc) => {
        uploadedDocumentTypeIds.add(doc.documentTypeId);
      });
    }
  }

  // 3. Upload missing documents
  const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];
  if (unAttachedDocumentTypes.length > 0) {
    for (const documentType of unAttachedDocumentTypes) {
      if (!uploadedDocumentTypeIds.has(documentType.documentTypeId)) {
        if (documentType.roleId === 9 && vehicleUniqueId) {
          await attachVehiclesDocuments({ token, documentType, vehicleUniqueId });
        } else if (documentType.roleId === 2) {
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
