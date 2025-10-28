const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { getVehicleDrivers } = require("./VehicleDriver.service");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getUserRoleStatus,
  updateUserRoleStatus,
} = require("./UserRoleStatus.service");
const {
  findStatusByVehicleAndDocuments,
} = require("../Utils/StatusOfUsersByVehiclesAndDocs");
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
// Consolidated, secure, paginated GET with filters across columns
const getRoleDocumentRequirements = async (filters = {}) => {
  const {
    roleDocumentRequirementUniqueId,
    roleId,
    documentTypeId,
    isDocumentMandatory,
    isExpirationDateRequired,
    isFileNumberRequired,
    roleDocumentRequirementCreatedBy,
    roleUniqueId, // via join
    createdStart,
    createdEnd,
    updatedStart,
    updatedEnd,
    page = 1,
    limit = 10,
    sortBy = "roleDocumentRequirementCreatedAt",
    sortOrder = "DESC",
  } = filters;

  const where = [];
  const params = [];

  if (roleDocumentRequirementUniqueId) {
    where.push("r.roleDocumentRequirementUniqueId = ?");
    params.push(roleDocumentRequirementUniqueId);
  }
  if (roleId) {
    where.push("r.roleId = ?");
    params.push(Number(roleId));
  }
  if (documentTypeId) {
    where.push("r.documentTypeId = ?");
    params.push(Number(documentTypeId));
  }
  if (typeof isDocumentMandatory !== "undefined") {
    where.push("r.isDocumentMandatory = ?");
    params.push(String(isDocumentMandatory).toLowerCase() === "true" ? 1 : 0);
  }
  if (typeof isExpirationDateRequired !== "undefined") {
    where.push("r.isExpirationDateRequired = ?");
    params.push(
      String(isExpirationDateRequired).toLowerCase() === "true" ? 1 : 0
    );
  }
  if (typeof isFileNumberRequired !== "undefined") {
    where.push("r.isFileNumberRequired = ?");
    params.push(String(isFileNumberRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (roleDocumentRequirementCreatedBy) {
    where.push("r.roleDocumentRequirementCreatedBy = ?");
    params.push(roleDocumentRequirementCreatedBy);
  }
  if (roleUniqueId) {
    where.push("ro.roleUniqueId = ?");
    params.push(roleUniqueId);
  }
  if (createdStart) {
    where.push("r.roleDocumentRequirementCreatedAt >= ?");
    params.push(createdStart);
  }
  if (createdEnd) {
    where.push("r.roleDocumentRequirementCreatedAt <= ?");
    params.push(createdEnd);
  }
  if (updatedStart) {
    where.push("r.roleDocumentRequirementUpdatedAt >= ?");
    params.push(updatedStart);
  }
  if (updatedEnd) {
    where.push("r.roleDocumentRequirementUpdatedAt <= ?");
    params.push(updatedEnd);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const offset = (numPage - 1) * numLimit;

  const sortableMap = {
    roleDocumentRequirementCreatedAt: "r.roleDocumentRequirementCreatedAt",
    roleDocumentRequirementUpdatedAt: "r.roleDocumentRequirementUpdatedAt",
    roleId: "r.roleId",
    documentTypeId: "r.documentTypeId",
  };
  const safeSortBy =
    sortableMap[sortBy] || sortableMap.roleDocumentRequirementCreatedAt;
  const safeSortOrder =
    String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const sql = `
    SELECT 
      r.*, 
      dt.documentTypeId as dt_documentTypeId, dt.documentTypeName,
      ro.roleId as ro_roleId, ro.roleUniqueId, ro.roleName
    FROM RoleDocumentRequirements r
    LEFT JOIN DocumentTypes dt ON r.documentTypeId = dt.documentTypeId
    LEFT JOIN Roles ro ON r.roleId = ro.roleId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total
    FROM RoleDocumentRequirements r
    LEFT JOIN Roles ro ON r.roleId = ro.roleId
    ${whereClause}
  `;

  const [rows] = await pool.query(sql, [...params, numLimit, offset]);
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / numLimit);

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: numPage,
      itemsPerPage: numLimit,
      totalItems: total,
      totalPages,
      hasNext: numPage < totalPages,
      hasPrev: numPage > 1,
    },
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
// Removed individual GET by ID helper in favor of consolidated getter
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
// Removed getAllMappings in favor of consolidated getter with pagination
const driversDocumentVehicleRequirement = async (body) => {
  try {
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
    // Fetch required documents for the user's role via consolidated getter
    const requiredDocsResult = await getRoleDocumentRequirements({
      roleId,
      page: 1,
      limit: 1000,
      sortBy: "documentTypeId",
      sortOrder: "ASC",
    });
    const requiredDocuments = requiredDocsResult?.data || [];

    if (!requiredDocuments || requiredDocuments.length === 0) {
      return { message: "error", data: "No documents required for this role" };
    }
    //Get attached documents
    const sql = `
SELECT DISTINCT   AttachedDocuments.*,  DocumentTypes.*, 
  RoleDocumentRequirements.* FROM AttachedDocuments
JOIN DocumentTypes    ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
JOIN RoleDocumentRequirements    ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
WHERE AttachedDocuments.userUniqueId = ?
`;
    const values = [ownerUserUniqueId];
    const [attachedDocuments] = await pool.query(sql, values);
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
      const acceptanceStatus = attachedDocument.attachedDocumentAcceptance;

      if (attachedDocumentsByStatus[acceptanceStatus]) {
        //
        attachedDocumentsByStatus[acceptanceStatus].push(attachedDocument);
      }
      //
    });

    // Check if the user has a registered vehicle via VehicleDriver service
    const vehicleDriverResult = await getVehicleDrivers({
      ownerUserUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const userVehicle = vehicleDriverResult?.data || [];
    const vehicleRegistered = userVehicle.length > 0;
    // check if user is banned based on its userUniqueId,
    // Prefer checking by phoneNumber (available in this scope)
    let isBanned = false;
    try {
      const { getBannedUsers } = require("./BannedUsers.service");

      const banCheck = await getBannedUsers({
        check: true,
        phoneNumber,
        roleId,
      });
      isBanned = banCheck?.data?.isBanned === true;
    } catch (e) {
      // If ban check fails, treat as not banned but do not crash the flow
      isBanned = false;
    }

    // Determine the final status
    let finalStatusId;
    if (isBanned) {
      // 6 => banned (as per updated status list)
      finalStatusId = 6;
    } else {
      // Based on documents and vehicle status
      const resultOfStatus = findStatusByVehicleAndDocuments({
        attachedDocuments,
        attachedDocumentsByStatus,
        requiredDocuments,
        vehicleRegistered,
        unAttachedDocumentTypes,
      });

      if (resultOfStatus?.message == "error") {
        return resultOfStatus;
      }
      finalStatusId = resultOfStatus?.finalStatusId;
    }
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
  } catch (error) {
    console.log("@roleDocumentRequirements error", error);
    return {
      message: "error",
      data: "An error occurred during driver document vehicle requirement",
    };
  }
};

module.exports = {
  getRoleDocumentRequirements,
  driversDocumentVehicleRequirement,
  createMapping,
  updateMapping,
  deleteMapping,
};
