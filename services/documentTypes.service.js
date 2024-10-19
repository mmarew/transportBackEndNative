const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const uuidv4 = require("uuid").v4;

const createDocumentType = async ({ body, user }) => {
  const {
    documentTypeName,
    documentTypeDescription,
    uploadedDocumentName,
    uploadedDocumentExpirationDate,
    uploadedDocumentTypeId,
    uploadedDocumentDescription,
  } = body;
  const { userUniqueId } = user.data;
  // verify if userUniqueId is valid and active
  const userExists = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });
  if (userExists.length === 0) {
    return { message: "error", data: "User not found" };
  }
  // Check if the document type already exists
  const existingDocumentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeName },
  });

  if (existingDocumentType.length > 0) {
    return { message: "error", data: "Document type already exists" };
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
    documentTypeCreatedBy: userUniqueId,
    documentTypeCreatedAt: new Date(),
  };

  await insertData({ tableName: "DocumentTypes", colAndVal: newDocumentType });
  return { message: "success", data: "Document type created successfully" };
};

const getAllDocumentTypes = async () => {
  try {
    const sql = `SELECT * FROM DocumentTypes`;

    const [documentTypes] = await pool.query({ sql });
    return { message: "success", data: documentTypes };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving document types",
    };
  }
};

const getDocumentTypeById = async (documentTypeId) => {
  const documentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId: documentTypeId },
  });

  if (documentType.length === 0) {
    return { message: "error", data: "Document type not found" };
  }

  return { message: "success", data: documentType[0] };
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
  const { documentTypeName, documentTypeDescription, updatedByUserId, user } =
    updateDataValues;
  console.log("user", user);
  const userUniqueId = user?.userUniqueId;
  if (existingDocumentType.length === 0) {
    return { message: "error", data: "Document type not found" };
  }
  const documentTypeId = existingDocumentType[0].documentTypeId;
  const changeType = "update";
  //   transfer data to history record
  await insertDocumentTypeHistory({
    documentTypeId,
    changeType,
    changedByUserId: userUniqueId,
  });
  const updateValues = {
    documentTypeName,
    documentTypeDescription,
    updatedByUserId: userUniqueId,
    updatedAt: new Date(),
  };
  await updateData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId },
    updateValues,
  });

  return { message: "success", data: "Document type updated successfully" };
};

const deleteDocumentType = async (documentTypeId) => {
  // Check if the document type exists
  const existingDocumentType = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId: documentTypeId },
  });

  if (existingDocumentType.length === 0) {
    return { message: "error", data: "Document type not found" };
  }

  // Delete the document type
  await deleteData({
    tableName: "DocumentTypes",
    conditions: { documentTypeUniqueId: documentTypeId },
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
    return { message: "error", data: "DocumentType not found" };
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
    changedByUserId,
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
  getDocumentTypeById,
  updateDocumentType,
  deleteDocumentType,
};
