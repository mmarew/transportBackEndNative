const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const logger = require("../Utils/logger");
const uuidv4 = require("uuid").v4;
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const createDocumentType = async ({ body }) => {
  const { documentTypeName, documentTypeDescription, user } = body;

  // Utility function to convert string to camelCase
  const toCamelCase = (str) => {
    return str
      .toLowerCase()
      .replace(/[^a-z\s]/g, "") // Remove any non a-z characters
      .replace(/(?:^\w|\b\w)/g, (match, index) =>
        index === 0 ? match.toLowerCase() : match.toUpperCase(),
      )
      .replace(/\s+/g, ""); // Remove all spaces
  };

  const camelCaseDocumentName = toCamelCase(documentTypeName);

  const uploadedDocumentName = camelCaseDocumentName,
    uploadedDocumentExpirationDate = camelCaseDocumentName + "ExpirationDate",
    uploadedDocumentTypeId = camelCaseDocumentName + "TypeId",
    uploadedDocumentDescription = camelCaseDocumentName + "Description",
    uploadedDocumentFileNumber = camelCaseDocumentName + "FileNumber";
  const userUniqueId = user?.userUniqueId;
  // verify if userUniqueId is valid and active
  const userExists = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });
  if (userExists.length === 0) {
    throw new AppError("User not found to create document type", 400);
  }
  // Check if the document type already exists
  const existingDocumentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeName },
  });

  if (existingDocumentType.length > 0) {
    return { message: "success", data: "Document type already exists" };
  }

  // Create a new document type
  const documentTypeUniqueId = uuidv4();
  const newDocumentType = {
    uploadedDocumentTypeId,
    uploadedDocumentDescription,
    uploadedDocumentName,
    documentTypeUniqueId,
    uploadedDocumentExpirationDate,
    documentTypeName,
    documentTypeDescription,
    uploadedDocumentFileNumber,
    documentTypeCreatedBy: userUniqueId,
    documentTypeCreatedAt: currentDate(),
  };

  await insertData({ tableName: "DocumentTypes", colAndVal: newDocumentType });
  return { message: "success", data: "Document type created successfully" };
};

const getAllDocumentTypes = async (filters = {}) => {
  try {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const clauses = [];
    const params = [];

    if (filters.documentTypeUniqueId) {
      clauses.push("documentTypeUniqueId = ?");
      params.push(filters.documentTypeUniqueId);
    }

    if (filters.documentTypeName) {
      clauses.push("documentTypeName LIKE ?");
      params.push(`%${String(filters.documentTypeName).trim()}%`);
    }

    if (filters.uploadedDocumentName) {
      clauses.push("uploadedDocumentName LIKE ?");
      params.push(`%${String(filters.uploadedDocumentName).trim()}%`);
    }

    if (filters.uploadedDocumentTypeId) {
      clauses.push("uploadedDocumentTypeId LIKE ?");
      params.push(`%${String(filters.uploadedDocumentTypeId).trim()}%`);
    }

    if (filters.uploadedDocumentDescription) {
      clauses.push("uploadedDocumentDescription LIKE ?");
      params.push(`%${String(filters.uploadedDocumentDescription).trim()}%`);
    }

    if (filters.uploadedDocumentExpirationDate) {
      clauses.push("uploadedDocumentExpirationDate LIKE ?");
      params.push(`%${String(filters.uploadedDocumentExpirationDate).trim()}%`);
    }

    if (filters.uploadedDocumentFileNumber) {
      clauses.push("uploadedDocumentFileNumber LIKE ?");
      params.push(`%${String(filters.uploadedDocumentFileNumber).trim()}%`);
    }

    if (filters.documentTypeDescription) {
      clauses.push("documentTypeDescription LIKE ?");
      params.push(`%${String(filters.documentTypeDescription).trim()}%`);
    }

    if (filters.documentTypeCreatedBy) {
      clauses.push("documentTypeCreatedBy = ?");
      params.push(filters.documentTypeCreatedBy);
    }

    if (filters.documentTypeUpdatedBy) {
      clauses.push("documentTypeUpdatedBy = ?");
      params.push(filters.documentTypeUpdatedBy);
    }

    if (filters.documentTypeDeletedBy) {
      clauses.push("documentTypeDeletedBy = ?");
      params.push(filters.documentTypeDeletedBy);
    }

    if (filters.documentTypeCurrentVersion !== undefined) {
      clauses.push("documentTypeCurrentVersion = ?");
      params.push(Number(filters.documentTypeCurrentVersion));
    }

    if (filters.isDocumentTypeDeleted !== undefined) {
      clauses.push("isDocumentTypeDeleted = ?");
      params.push(filters.isDocumentTypeDeleted ? 1 : 0);
    } else {
      clauses.push("isDocumentTypeDeleted = 0");
    }

    if (filters.documentTypeCreatedAt) {
      clauses.push("DATE(documentTypeCreatedAt) = DATE(?)");
      params.push(filters.documentTypeCreatedAt);
    }

    if (filters.documentTypeUpdatedAt === "notNull") {
      clauses.push("documentTypeUpdatedAt IS NOT NULL");
    } else if (filters.documentTypeUpdatedAt === "null") {
      clauses.push("documentTypeUpdatedAt IS NULL");
    } else if (filters.documentTypeUpdatedAt) {
      clauses.push("DATE(documentTypeUpdatedAt) = DATE(?)");
      params.push(filters.documentTypeUpdatedAt);
    }

    if (filters.documentTypeDeletedAt === "notNull") {
      clauses.push("documentTypeDeletedAt IS NOT NULL");
    } else if (filters.documentTypeDeletedAt === "null") {
      clauses.push("documentTypeDeletedAt IS NULL");
    } else if (filters.documentTypeDeletedAt) {
      clauses.push("DATE(documentTypeDeletedAt) = DATE(?)");
      params.push(filters.documentTypeDeletedAt);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const dataSql = `
      SELECT *
      FROM DocumentTypes
      ${whereClause}
      ORDER BY documentTypeCreatedAt DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM DocumentTypes
      ${whereClause}
    `;

    const executor = transactionStorage.getStore() || pool;
    const [dataRows] = await executor.query(dataSql, [...params, limit, offset]);
    const [countRows] = await executor.query(countSql, params);
    const total = countRows?.[0]?.total || 0;

    if (!dataRows || dataRows.length === 0) {
      throw new AppError("No document types found", 404);
    }

    return {
      message: "success",
      data: dataRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  } catch (error) {
    logger.error("Error retrieving document types", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Failed to retrieve document types", 500);
  }
};

const updateDocumentType = async ({
  documentTypeUniqueId,
  updateDataValues,
}) => {
  // Check if the document type exists
  const existingDocumentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId },
  });
  const { documentTypeName, documentTypeDescription, user } = updateDataValues;
  const userUniqueId = user?.userUniqueId;
  if (existingDocumentType.length === 0) {
    throw new AppError("Document type not existed", 404);
  }
  const documentTypeId = existingDocumentType[0].documentTypeId;
  const changeType = "update";
  //   transfer data to history record
  await insertDocumentTypeHistory({
    documentTypeId,
    changeType,
    changedByUserId: userUniqueId,
  });
  const updateValues = {};

  if (documentTypeName !== undefined) {
    updateValues.documentTypeName = documentTypeName;
  }

  if (documentTypeDescription !== undefined) {
    updateValues.documentTypeDescription = documentTypeDescription;
  }

  if (updateDataValues.uploadedDocumentName !== undefined) {
    updateValues.uploadedDocumentName = updateDataValues.uploadedDocumentName;
  }

  if (updateDataValues.uploadedDocumentTypeId !== undefined) {
    updateValues.uploadedDocumentTypeId =
      updateDataValues.uploadedDocumentTypeId;
  }

  if (updateDataValues.uploadedDocumentDescription !== undefined) {
    updateValues.uploadedDocumentDescription =
      updateDataValues.uploadedDocumentDescription;
  }

  if (updateDataValues.uploadedDocumentExpirationDate !== undefined) {
    updateValues.uploadedDocumentExpirationDate =
      updateDataValues.uploadedDocumentExpirationDate;
  }

  if (updateDataValues.uploadedDocumentFileNumber !== undefined) {
    updateValues.uploadedDocumentFileNumber =
      updateDataValues.uploadedDocumentFileNumber;
  }

  if (updateDataValues.isRequired !== undefined) {
    updateValues.isRequired = updateDataValues.isRequired;
  }

  if (updateDataValues.documentTypeCurrentVersion !== undefined) {
    updateValues.documentTypeCurrentVersion = Number(
      updateDataValues.documentTypeCurrentVersion,
    );
  }

  if (Object.keys(updateValues).length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  updateValues.documentTypeUpdatedBy = userUniqueId;
  updateValues.documentTypeUpdatedAt = currentDate();
  await updateData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId },
    updateValues,
  });

  return { message: "success", data: "Document type updated successfully" };
};

const deleteDocumentType = async ({ documentTypeUniqueId, user }) => {
  const userUniqueId = user?.userUniqueId;
  // Check if the document type exists
  const existingDocumentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId },
  });

  if (!existingDocumentType || existingDocumentType.length === 0) {
    throw new AppError("Document type not found", 404);
  }

  if (existingDocumentType?.[0]?.isDocumentTypeDeleted) {
    throw new AppError("Document type already deleted", 409);
  }
  const updateValues = {
    isDocumentTypeDeleted: true,
    documentTypeDeletedBy: userUniqueId,
    documentTypeDeletedAt: currentDate(),
  };
  // Delete the document type
  await updateData({
    updateValues,
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId },
  });

  return { message: "success", data: "Document type deleted successfully" };
};
const insertDocumentTypeHistory = async ({
  documentTypeId,
  changeType,
  changedByUserId,
}) => {
  // Get the current data of the DocumentType
  const documentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeId },
  });

  if (documentType.length === 0) {
    throw new AppError("Document Type not found for history record", 404);
  }

  const currentDocumentType = documentType[0];

  // Insert the old data into the history table
  const insertDataValues = {
    documentTypeId: currentDocumentType.documentTypeId,
    documentTypeUniqueId: currentDocumentType.documentTypeUniqueId,
    documentTypeName: currentDocumentType.documentTypeName,
    documentTypeDescription: currentDocumentType.documentTypeDescription,
    documentTypeCreatedBy: currentDocumentType.documentTypeCreatedBy,
    documentTypeUpdatedBy: currentDocumentType.documentTypeUpdatedBy,
    documentTypeDeletedBy: currentDocumentType.documentTypeDeletedBy,
    documentTypeCreatedAt: currentDocumentType.documentTypeCreatedAt,
    documentTypeUpdatedAt: currentDocumentType.documentTypeUpdatedAt,
    documentTypeDeletedAt: currentDocumentType.documentTypeDeletedAt,
    documentTypeVersion: currentDocumentType.documentTypeVersion + 1 || 1, // Increment version
    changeType,
    changedByUserId: changedByUserId || currentDocumentType.documentTypeCreatedBy,
  };

  const result = await insertData({
    tableName: "DocumentTypesHistory",
    colAndVal: insertDataValues,
  });

  return result;
};

module.exports = {
  createDocumentType,
  getAllDocumentTypes,
  updateDocumentType,
  deleteDocumentType,
};
