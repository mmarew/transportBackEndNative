const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getUserRoleStatus,
  updateUserRoleStatus,
} = require("./UserRoleStatus.service");
// Create a new mapping
const createMapping = async ({ body }) => {
  const {
    roleId,
    documentTypeId,
    isDocumentMandatory = true,
    isExpirationDateRequired = false,
    userUniqueId,
  } = body;

  // verify existance of roleid
  const roleExists = await getData({
    tableName: "Roles",
    conditions: { roleId },
  });

  if (roleExists.length === 0) {
    return { message: "error", data: "Role not found" };
  }
  //  verify existance of documentTypeId
  const documentTypeExists = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeId },
  });

  if (documentTypeExists.length === 0) {
    return { message: "error", data: "Document type not found" };
  }
  // Check if the mapping already exists
  const existingMapping = await pool.query(
    "SELECT * FROM RoleDocumentRequirements  WHERE roleId = ? AND documentTypeId = ?",
    [roleId, documentTypeId]
  );

  if (existingMapping[0].length > 0) {
    return { message: "error", data: "Mapping already exists" };
  }

  // Insert new mapping
  const result = await pool.query(
    "INSERT INTO RoleDocumentRequirements(roleDocumentRequirementUniqueId,roleDocumentRequirementCreatedBy, roleId, documentTypeId, isDocumentMandatory, isExpirationDateRequired,roleDocumentRequirementCreatedAt) VALUES (?, ?, ?, ?, ?,?,?)",
    [
      uuidv4(),
      userUniqueId,
      roleId,
      documentTypeId,
      isDocumentMandatory,
      isExpirationDateRequired,
      new Date(),
    ]
  );

  if (result[0].affectedRows > 0) {
    return { message: "success", data: "Mapping created successfully" };
  } else {
    return { message: "error", data: "Failed to create mapping" };
  }
};
const getMappingByRoleUniqueId = async (roleUniqueId) => {
  const rows = await performJoinSelect({
    baseTable: "RoleDocumentRequirements",
    joins: [
      {
        table: "DocumentTypes",
        on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
      },
      {
        table: "Roles",
        on: "RoleDocumentRequirements.roleId=Roles.roleId",
      },
    ],
    conditions: { "Roles.roleUniqueId": roleUniqueId },
  });
  return {
    message: "success",
    data: rows,
  };
};

// Update a mapping by ID
const updateMapping = async (roleDocumentRequirementUniqueId, data) => {
  const {
    roleId,
    documentTypeId,
    isExpirationDateRequired,
    isDocumentMandatory,
    isFileNumberRequired,
  } = data;

  // Check for duplicate roleId and documentTypeId
  const [existingRecords] = await pool.query(
    `SELECT * FROM RoleDocumentRequirements
     WHERE roleId = ? AND documentTypeId = ? AND roleDocumentRequirementUniqueId != ?`,
    [roleId, documentTypeId, roleDocumentRequirementUniqueId]
  );

  if (existingRecords.length > 0) {
    console.log(
      `Duplicate entry for roleId: ${roleId} and documentTypeId: ${documentTypeId}`
    );
    return {
      message: "error",
      data: "error on update Role Document Requirements",
    };
  }

  // Perform the update
  const result = await pool.query(
    `UPDATE RoleDocumentRequirements
     SET isDocumentMandatory = ?, roleDocumentRequirementUpdatedAt = ?, roleId = ?, documentTypeId = ?, isExpirationDateRequired = ?, isFileNumberRequired = ?
     WHERE roleDocumentRequirementUniqueId = ?`,
    [
      isDocumentMandatory,
      new Date(),
      roleId,
      documentTypeId,
      isExpirationDateRequired,
      isFileNumberRequired,
      roleDocumentRequirementUniqueId,
    ]
  );

  if (result[0].affectedRows === 0) {
    return { message: "error", data: "Failed to update mapping" };
  }

  return { message: "success", data: "Mapping updated successfully" };
};

// Delete a mapping by ID
const deleteMapping = async (roleDocumentRequirementUniqueId) => {
  const result = await pool.query(
    "DELETE FROM RoleDocumentRequirements  WHERE roleDocumentRequirementUniqueId = ?",
    [roleDocumentRequirementUniqueId]
  );
  if (result[0].affectedRows === 0) {
    return { message: "error", data: "Failed to delete mapping" };
  }
  return { message: "success", data: "Mapping deleted successfully" };
};
const getAllMappings = async () => {
  const rows = await performJoinSelect({
    baseTable: "RoleDocumentRequirements",
    joins: [
      {
        table: "DocumentTypes",
        on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
      },
      {
        table: "Roles",
        on: "RoleDocumentRequirements.roleId=Roles.roleId",
      },
    ],
  });
  return {
    message: "success",
    data: rows,
  };
};
const driversDocumentVehicleRequirement = async (body) => {
  const ownerUserUniqueId = body.ownerUserUniqueId;
  const user = body?.user;
  const roleId = 2;
  const phoneNumber = user?.phoneNumber;
  const userRoleStatusDescription = body?.userRoleStatusDescription;
  console.log(" roleId, phoneNumber", roleId, phoneNumber);
  // Fetch initial user data based on role ID and phone number
  let userRoleStatus = await getUserRoleStatus({ roleId, phoneNumber });
  if (!userRoleStatus || userRoleStatus.length === 0) {
    return { message: "error", data: "User data not found" };
  }

  const { userRoleStatusUniqueId, userRoleId, statusId } = userRoleStatus[0];
  // return;
  // Fetch required documents for the user's role
  const requiredDocuments = await performJoinSelect({
    baseTable: "RoleDocumentRequirements",
    joins: [
      {
        table: "DocumentTypes",
        on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
      },
    ],
    conditions: { roleId },
  });

  if (!requiredDocuments || requiredDocuments.length === 0) {
    return { message: "error", data: "No documents required for this role" };
  }

  // Fetch attached documents with its type for the user
  // const attachedDocuments = await performJoinSelect({
  //   // tableName: "AttachedDocuments",
  //   // conditions: { userUniqueId: ownerUserUniqueId },
  //   baseTable: "AttachedDocuments",
  //   joins: [
  //     {
  //       table: "DocumentTypes",
  //       on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
  //     },
  //     {
  //       table: "RoleDocumentRequirements",
  //       on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
  //     },
  //   ],
  //   conditions: { userUniqueId: ownerUserUniqueId },
  // });

  // const attachedDocuments = await performJoinSelect({
  //   baseTable: "AttachedDocuments",
  //   columns: "AttachedDocuments.*, DocumentTypes.*, RoleDocumentRequirements.*",
  //   joins: [
  //     {
  //       table: "DocumentTypes",
  //       on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
  //     },
  //     {
  //       table: "RoleDocumentRequirements",
  //       on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
  //     },
  //   ],
  //   conditions: { userUniqueId: ownerUserUniqueId },
  //   groupBy: "AttachedDocuments.attachedDocumentId", // prevents duplicates
  // });

  const sqlQuery = `
  SELECT 
    AttachedDocuments.attachedDocumentId, 
    AttachedDocuments.documentTypeId, 
    DocumentTypes.documentTypeName, 
    GROUP_CONCAT(RoleDocumentRequirements.roleDocumentRequirementId) AS roleDocumentRequirementIds
  FROM AttachedDocuments
  JOIN DocumentTypes ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
  JOIN RoleDocumentRequirements ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
  WHERE AttachedDocuments.userUniqueId = ?
  GROUP BY AttachedDocuments.attachedDocumentId, AttachedDocuments.documentTypeId, DocumentTypes.documentTypeName
`;

  const values = [ownerUserUniqueId]; // Dynamic parameter to avoid SQL injection

  const [attachedDocuments] = await pool.query(sqlQuery, values);

  // Find unattached document types
  const unAttachedDocumentTypes = requiredDocuments.filter(
    (requiredDocument) =>
      !attachedDocuments.some(
        (attachedDocument) =>
          attachedDocument.documentTypeId === requiredDocument.documentTypeId
      )
  );

  // Group attached documents by their status (PENDING, ACCEPTED, REJECTED)
  const attachedDocumentsByStatus = {
    PENDING: [],
    ACCEPTED: [],
    REJECTED: [],
  };
  attachedDocuments.forEach((attachedDocument) => {
    //
    const documentStatus = attachedDocument.attachedDocumentAcceptance;
    //
    if (attachedDocumentsByStatus[documentStatus]) {
      //
      attachedDocumentsByStatus[documentStatus].push(attachedDocument);
    }
    //
  });

  // Check if the user has a registered vehicle
  const userVehicle = await performJoinSelect({
    baseTable: "VehicleOwnership",
    joins: [
      {
        table: "Vehicle",
        on: "Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId",
      },
    ],
    conditions: { "VehicleOwnership.userUniqueId": ownerUserUniqueId },
  });
  const vehicleRegistered = userVehicle.length > 0;

  // Determine the final status based on documents and vehicle status
  const resultOfStatus = findStatusByVehicleAndDocuments({
    attachedDocuments,
    attachedDocumentsByStatus,
    requiredDocuments,
    vehicleRegistered,
    unAttachedDocumentTypes,
  });
  // finalStatusId;
  console.log(
    "@driversDocumentVehicleRequirement resultOfStatus",
    resultOfStatus
  );
  if (resultOfStatus?.message == "error") {
    return resultOfStatus;
  }
  const finalStatusId = resultOfStatus?.finalStatusId;
  if (statusId !== finalStatusId) {
    // Update role status if its current status is different from saved one
    const userRoleStatusData = {
      user,
      roleId,
      userRoleStatusUniqueId,
      userRoleId,
      newStatusId: finalStatusId,
      userRoleStatusDescription,
      phoneNumber,
    };

    await updateUserRoleStatus(userRoleStatusData);
  }
  //get latest user role status

  const userData = await getUserRoleStatus({ roleId, phoneNumber });
  return {
    message: "success",
    messageType: "driversDocumentVehicleRequirement",
    vehicle: userVehicle[0] || null,
    userData: userData[0] || null,
    attachedDocumentsByStatus,
    unAttachedDocumentTypes, // Documents that are required but not attached
  };
};

const findStatusByVehicleAndDocuments = ({
  vehicleRegistered,
  attachedDocumentsByStatus,
  requiredDocuments,
  attachedDocuments,
  unAttachedDocumentTypes,
}) => {
  let finalStatusId = null;
  console.log(
    "vehicleRegistered",
    vehicleRegistered,
    "attachedDocumentsByStatus",
    attachedDocumentsByStatus,
    "  requiredDocuments",
    requiredDocuments,
    "attachedDocuments",
    attachedDocuments,
    "unAttachedDocumentTypes",
    unAttachedDocumentTypes
  );
  // Check for invalid or missing inputs

  // Check if the user has a registered vehicle

  // 1. All Documents Accepted, Vehicle Registered (Active)
  if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length >= requiredDocuments.length
  ) {
    finalStatusId = 1;
  }
  // 2. No Document, No Vehicle Registered
  else if (!vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 2;
  }
  // 3. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 3;
  }
  // 4. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 4;
  }
  // 5. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 5;
  }
  // 6. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 6;
  }
  // 7. All Documents Accepted, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
  ) {
    finalStatusId = 7;
  }
  // 8. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 8;
  }
  // 9. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 9;
  }
  // 10. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 10;
  }
  // 11. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 11;
  }
  // 12. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 12;
  }

  // 13. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length >= requiredDocuments.length
  ) {
    finalStatusId = 13;
  }
  // 14. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 14;
  }
  // 15. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 15;
  }
  // 16. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 16;
  }
  // 17. Vehicle Registered, Some Documents Not Attached
  else if (vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 17;
  }
  // 18. No Vehicle Registered, Some Documents Not Attached
  else if (!vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 18;
  }
  // 19. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 19;
  }
  // 20. Vehicle Not Registered, All Documents Attached, Mixed Statuses
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 20;
  }
  // 21. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 21;
  }
  // 22. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 22;
  }
  // 23. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 23;
  }
  // 24. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 24;
  }
  // 25. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length >= requiredDocuments.length
  ) {
    finalStatusId = 25;
  }
  // 26. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 26;
  }
  // 27. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 27;
  }
  // 28. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 28;
  }
  // Default error case
  else {
    console.log(
      "@attachedDocumentsByStatus.PENDING.",
      attachedDocumentsByStatus.PENDING?.length,
      "requiredDocuments.length ",
      requiredDocuments.length
    );
    return {
      message: "error",
      data: "Unable to determine driver's status.",
    };
  }
  return { message: "success", finalStatusId: finalStatusId };
};
module.exports = {
  driversDocumentVehicleRequirement,
  getAllMappings,
  getMappingByRoleUniqueId,
  createMapping,
  updateMapping,
  deleteMapping,
};
