const { getData } = require("../CRUD/Read/ReadData");
const { getVehicleDrivers } = require("./VehicleDriver.service");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent,
} = require("./UserRoleStatus.service");
const {
  findStatusByVehicleAndDocuments,
} = require("../Utils/StatusOfUsersByVehiclesAndDocs");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { transactionStorage } = require("../Utils/TransactionContext");
// Create a new mapping
const createMapping = async ({ body }) => {
  const {
    roleId,
    documentTypeId,
    documentTypeUniqueId,
    isDocumentMandatory = true,
    isFileNumberRequired = false,
    isExpirationDateRequired = false,
    isDescriptionRequired = false,
    userUniqueId,
  } = body;

  let resolvedDocumentTypeId = documentTypeId;
  if (!resolvedDocumentTypeId && documentTypeUniqueId) {
    const dt = await getData({
      tableName: "DocumentTypes",
      conditions: { documentTypeUniqueId },
    });
    if (dt.length === 0) {
      throw new AppError("Document type not found by UUID", 404);
    }
    resolvedDocumentTypeId = dt[0].documentTypeId;
  }

  // Convert to integers to match database types
  const numericRoleId = parseInt(roleId, 10);
  const numericDocumentTypeId = parseInt(resolvedDocumentTypeId, 10);

  // verify existence of roleid
  const roleExists = await getData({
    tableName: "Roles",
    conditions: { roleId: numericRoleId },
  });

  if (roleExists.length === 0) {
    throw new AppError("Role not found", 404);
  }
  //  verify existence of documentTypeId
  let documentTypeExists = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeId: numericDocumentTypeId },
  });

  // If not found by ID, try finding by name if documentTypeName is provided in the body
  if (documentTypeExists.length === 0 && body.documentTypeName) {
    const dtByName = await getData({
      tableName: "DocumentTypes",
      conditions: { documentTypeName: body.documentTypeName },
    });
    if (dtByName.length > 0) {
      documentTypeExists = dtByName;
      numericDocumentTypeId = dtByName[0].documentTypeId;
    }
  }

  if (documentTypeExists.length === 0) {
    throw new AppError(
      `Document type not found for ID: ${numericDocumentTypeId}${body.documentTypeName ? " or Name: " + body.documentTypeName : ""}. Please ensure DocumentTypes are seeded first.`,
      404,
    );
  }
  const executor = transactionStorage.getStore() || pool;
  // Check if the mapping already exists
  const existingMapping = await executor.query(
    "SELECT * FROM RoleDocumentRequirements WHERE roleId = ? AND documentTypeId = ? AND roleDocumentRequirementDeletedAt IS NULL",
    [numericRoleId, numericDocumentTypeId],
  );

  if (existingMapping[0].length > 0) {
    throw new AppError("Mapping already exists", 400);
  }

  // Insert new mapping
  const result = await executor.query(
    "INSERT INTO RoleDocumentRequirements(roleDocumentRequirementUniqueId,roleDocumentRequirementCreatedBy, roleId, documentTypeId, isDocumentMandatory, isFileNumberRequired, isExpirationDateRequired, isDescriptionRequired, roleDocumentRequirementCreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      uuidv4(),
      userUniqueId,
      numericRoleId,
      numericDocumentTypeId,
      isDocumentMandatory,
      isFileNumberRequired,
      isExpirationDateRequired,
      isDescriptionRequired,
      currentDate(),
    ],
  );

  if (result[0].affectedRows > 0) {
    return { message: "success", data: "Mapping created successfully" };
  } else {
    throw new AppError("Failed to create mapping", 500);
  }
};
// Consolidated, secure, paginated GET with filters across columns
const getRoleDocumentRequirements = async (filters = {}) => {
  const {
    roleDocumentRequirementUniqueId,
    roleId,
    documentTypeId,
    roleName,
    documentTypeName,
    isDocumentMandatory,
    isExpirationDateRequired,
    isFileNumberRequired,
    isDescriptionRequired,
    roleDocumentRequirementCreatedBy,
    roleDocumentRequirementUpdatedBy,
    roleDocumentRequirementDeletedBy,
    roleUniqueId, // via join
    roleDocumentRequirementCreatedAt,
    roleDocumentRequirementUpdatedAt,
    roleDocumentRequirementDeletedAt,
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
  if (roleName) {
    where.push("ro.roleName LIKE ?");
    params.push(`%${String(roleName).trim()}%`);
  }
  if (documentTypeName) {
    where.push("dt.documentTypeName LIKE ?");
    params.push(`%${String(documentTypeName).trim()}%`);
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
      String(isExpirationDateRequired).toLowerCase() === "true" ? 1 : 0,
    );
  }
  if (typeof isFileNumberRequired !== "undefined") {
    where.push("r.isFileNumberRequired = ?");
    params.push(String(isFileNumberRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (typeof isDescriptionRequired !== "undefined") {
    where.push("r.isDescriptionRequired = ?");
    params.push(String(isDescriptionRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (roleDocumentRequirementCreatedBy) {
    where.push("r.roleDocumentRequirementCreatedBy = ?");
    params.push(roleDocumentRequirementCreatedBy);
  }
  if (roleDocumentRequirementUpdatedBy) {
    where.push("r.roleDocumentRequirementUpdatedBy = ?");
    params.push(roleDocumentRequirementUpdatedBy);
  }
  if (roleDocumentRequirementDeletedBy) {
    where.push("r.roleDocumentRequirementDeletedBy = ?");
    params.push(roleDocumentRequirementDeletedBy);
  }
  if (roleUniqueId) {
    where.push("ro.roleUniqueId = ?");
    params.push(roleUniqueId);
  }

  if (roleDocumentRequirementCreatedAt) {
    where.push("DATE(r.roleDocumentRequirementCreatedAt) = DATE(?)");
    params.push(roleDocumentRequirementCreatedAt);
  }

  if (roleDocumentRequirementUpdatedAt === "notNull") {
    where.push("r.roleDocumentRequirementUpdatedAt IS NOT NULL");
  } else if (roleDocumentRequirementUpdatedAt === "null") {
    where.push("r.roleDocumentRequirementUpdatedAt IS NULL");
  } else if (roleDocumentRequirementUpdatedAt) {
    where.push("DATE(r.roleDocumentRequirementUpdatedAt) = DATE(?)");
    params.push(roleDocumentRequirementUpdatedAt);
  }

  if (roleDocumentRequirementDeletedAt === "notNull") {
    where.push("r.roleDocumentRequirementDeletedAt IS NOT NULL");
  } else if (
    roleDocumentRequirementDeletedAt === "null" ||
    roleDocumentRequirementDeletedAt === undefined
  ) {
    where.push("r.roleDocumentRequirementDeletedAt IS NULL");
  } else if (roleDocumentRequirementDeletedAt) {
    where.push("DATE(r.roleDocumentRequirementDeletedAt) = DATE(?)");
    params.push(roleDocumentRequirementDeletedAt);
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
    dt.*,
    ro.*
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
    LEFT JOIN DocumentTypes dt ON r.documentTypeId = dt.documentTypeId
    LEFT JOIN Roles ro ON r.roleId = ro.roleId
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(sql, [...params, numLimit, offset]);
  const [countRows] = await executor.query(countSql, params);
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
    documentTypeUniqueId,
    isExpirationDateRequired,
    isDocumentMandatory,
    isFileNumberRequired,
    isDescriptionRequired,
    roleDocumentRequirementUpdatedBy,
  } = data;

  const executor = transactionStorage.getStore() || pool;
  const [currentRows] = await executor.query(
    "SELECT * FROM RoleDocumentRequirements WHERE roleDocumentRequirementUniqueId = ?",
    [roleDocumentRequirementUniqueId],
  );
  if (!currentRows || currentRows.length === 0) {
    throw new AppError("Mapping not found", 404);
  }
  if (currentRows[0]?.roleDocumentRequirementDeletedAt) {
    throw new AppError("Mapping already deleted", 400);
  }

  let resolvedDocumentTypeId = documentTypeId;
  if (!resolvedDocumentTypeId && documentTypeUniqueId) {
    const dt = await getData({
      tableName: "DocumentTypes",
      conditions: { documentTypeUniqueId },
    });
    if (dt.length === 0) {
      throw new AppError("Document type not found", 404);
    }
    resolvedDocumentTypeId = dt[0].documentTypeId;
  }

  const nextRoleId = roleId !== undefined ? roleId : currentRows[0].roleId;
  const nextDocumentTypeId =
    resolvedDocumentTypeId !== undefined
      ? resolvedDocumentTypeId
      : currentRows[0].documentTypeId;

  const [dupRows] = await executor.query(
    "SELECT * FROM RoleDocumentRequirements WHERE roleId = ? AND documentTypeId = ? AND roleDocumentRequirementUniqueId != ? AND roleDocumentRequirementDeletedAt IS NULL",
    [nextRoleId, nextDocumentTypeId, roleDocumentRequirementUniqueId],
  );

  if (dupRows.length > 0) {
    throw new AppError("Mapping already exists", 400);
  }

  const setParts = [];
  const values = [];

  if (roleId !== undefined) {
    setParts.push("roleId = ?");
    values.push(roleId);
  }

  if (resolvedDocumentTypeId !== undefined) {
    setParts.push("documentTypeId = ?");
    values.push(resolvedDocumentTypeId);
  }

  if (isDocumentMandatory !== undefined) {
    setParts.push("isDocumentMandatory = ?");
    values.push(isDocumentMandatory ? 1 : 0);
  }

  if (isFileNumberRequired !== undefined) {
    setParts.push("isFileNumberRequired = ?");
    values.push(isFileNumberRequired ? 1 : 0);
  }

  if (isExpirationDateRequired !== undefined) {
    setParts.push("isExpirationDateRequired = ?");
    values.push(isExpirationDateRequired ? 1 : 0);
  }

  if (isDescriptionRequired !== undefined) {
    setParts.push("isDescriptionRequired = ?");
    values.push(isDescriptionRequired ? 1 : 0);
  }

  if (roleDocumentRequirementUpdatedBy !== undefined) {
    setParts.push("roleDocumentRequirementUpdatedBy = ?");
    values.push(roleDocumentRequirementUpdatedBy);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  setParts.push("roleDocumentRequirementUpdatedAt = ?");
  values.push(currentDate());

  const sql = `UPDATE RoleDocumentRequirements SET ${setParts.join(", ")} WHERE roleDocumentRequirementUniqueId = ?`;
  values.push(roleDocumentRequirementUniqueId);

  const result = await executor.query(sql, values);
  if (result[0].affectedRows === 0) {
    throw new AppError("Failed to update mapping", 500);
  }

  return { message: "success", data: "Mapping updated successfully" };
};
// Removed individual GET by ID helper in favor of consolidated getter
// Delete a mapping by ID
const deleteMapping = async (roleDocumentRequirementUniqueId, deletedBy) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query(
    "SELECT * FROM RoleDocumentRequirements WHERE roleDocumentRequirementUniqueId = ?",
    [roleDocumentRequirementUniqueId],
  );
  if (!existingRows || existingRows.length === 0) {
    throw new AppError("Mapping not found", 404);
  }
  if (existingRows[0]?.roleDocumentRequirementDeletedAt) {
    throw new AppError("Mapping already deleted", 400);
  }

  const result = await executor.query(
    "UPDATE RoleDocumentRequirements SET roleDocumentRequirementDeletedAt = ?, roleDocumentRequirementDeletedBy = ? WHERE roleDocumentRequirementUniqueId = ? AND roleDocumentRequirementDeletedAt IS NULL",
    [currentDate(), deletedBy, roleDocumentRequirementUniqueId],
  );

  if (result[0].affectedRows === 0) {
    throw new AppError("Failed to delete mapping", 500);
  }
  return { message: "success", data: "Mapping deleted successfully" };
};
// Removed getAllMappings in favor of consolidated getter with pagination
const driversDocumentVehicleRequirement = async (body) => {
  try {
    const ownerUserUniqueId = body.ownerUserUniqueId;
    const user = body?.user;
    const roleId = usersRoles.driverRoleId;
    const phoneNumber = user?.phoneNumber;
    const userRoleStatusDescription = body?.userRoleStatusDescription;
    const { userRoleStatusUniqueId, userRoleId, statusId } = user;

    // Fetch required documents for the user's role via consolidated getter
    const requiredDocsResult = await getRoleDocumentRequirements({
      roleId,
      page: 1,
      limit: 1000,
      sortBy: "documentTypeId",
      sortOrder: "ASC",
    });

    const requiredDocuments = requiredDocsResult?.data || [];

    // If no documents are required, return success with empty data instead of error
    // This allows the verification to proceed even if no documents are configured
    if (!requiredDocuments || requiredDocuments.length === 0) {
      // Return structure matching the normal response format
      return {
        message: "success",
        messageType: "driversDocumentVehicleRequirement",
        data: "No documents required for this role",
        vehicle: null,
        userData: null,
        unAttachedDocumentTypes: [],
        attachedDocumentsByStatus: {
          PENDING: [],
          ACCEPTED: [],
          REJECTED: [],
        },
      };
    }
    //Get attached documents
    const sql = `
SELECT DISTINCT   AttachedDocuments.*,  DocumentTypes.*, 
  RoleDocumentRequirements.* FROM AttachedDocuments
JOIN DocumentTypes    ON AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId
JOIN RoleDocumentRequirements    ON RoleDocumentRequirements.documentTypeId = DocumentTypes.documentTypeId
WHERE AttachedDocuments.userUniqueId = ? and RoleDocumentRequirements.roleId = ?
`;
    const executor = transactionStorage.getStore() || pool;
    const values = [ownerUserUniqueId, roleId];
    const [attachedDocuments] = await executor.query(sql, values);
    // Find unattached document types
    const unAttachedDocumentTypes = requiredDocuments.filter(
      (requiredDocument) =>
        !attachedDocuments.some(
          (attachedDocument) =>
            attachedDocument.documentTypeId === requiredDocument.documentTypeId,
        ),
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
      driverUserUniqueId: ownerUserUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const userVehicle = vehicleDriverResult?.data || [];
    const vehicleRegistered = userVehicle.length > 0;

    // ========== SUBSCRIPTION CHECK ==========
    let hasActiveSubscription = false;
    try {
      const {
        getUserSubscriptionsWithFilters,
      } = require("./UserSubscription.service");
      const activeSubscriptions = await getUserSubscriptionsWithFilters({
        driverUniqueId: ownerUserUniqueId,
        isActive: true,
      });
      hasActiveSubscription = activeSubscriptions?.data?.length > 0;
    } catch (e) {
      const logger = require("../Utils/logger");
      logger.error("Error checking active subscription", {
        error: e.message,
        stack: e.stack,
      });
      hasActiveSubscription = false;
    }

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
      const logger = require("../Utils/logger");
      logger.error("Error checking ban status", {
        error: e.message,
        stack: e.stack,
      });
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
        hasActiveSubscription, // Pass subscription status
      });

      if (resultOfStatus?.message === "error") {
        throw new AppError(
          resultOfStatus?.data || "Error determining status",
          400,
        );
      }
      finalStatusId = resultOfStatus?.finalStatusId;
    }

    // return {
    //   message: "success",
    //   finalStatusId,requiredDocsResult
    // };
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

    const userData = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });
    return {
      message: "success",
      messageType: "driversDocumentVehicleRequirement",
      vehicle: userVehicle?.[0] || null,
      userData: userData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes, // Documents that are required but not attached
    };
  } catch (error) {
    throw new AppError(
      error.message ||
        "An error occurred during driver document vehicle requirement",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  getRoleDocumentRequirements,
  driversDocumentVehicleRequirement,
  createMapping,
  updateMapping,
  deleteMapping,
};
