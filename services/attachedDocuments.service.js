const {
  getData,
  insertData,
  updateData,
  deleteData,
} = require("../CRUD/Read/ReadData");
const uuidv4 = require("uuid").v4;

// Create a new attached document
const createAttachedDocument = async ({
  userUniqueId,
  documentName,
  documentDescription,
  documentTypeId,
  documentPath,
  documentExpirationDate,
  createdByUserId,
}) => {
  // Check if the document already exists for the same user and document type
  const existingDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: {
      userUniqueId,
      documentTypeId,
      attachedDocumentName: documentName,
    },
  });

  if (existingDocument.length > 0) {
    return {
      message: "error",
      data: "Document already exists for this user and document type",
    };
  }

  const newDocument = {
    attachedDocumentUniqueId: uuidv4(),
    userUniqueId,
    attachedDocumentName: documentName,
    attachedDocumentDescription: documentDescription,
    documentTypeId,
    attachedDocumentPath: documentPath,
    documentExpirationDate,
    attachedDocumentIsDeleted: false,
    createdByUserId,
    createdAt: new Date(),
  };

  const result = await insertData({
    tableName: "AttachedDocuments",
    colAndVal: newDocument,
  });

  if (result.affectedRows > 0) {
    return { message: "success", data: "Document created successfully" };
  } else {
    return { message: "error", data: "Failed to create document" };
  }
};

// Retrieve all attached documents
const getAllAttachedDocuments = async () => {
  return await getData({
    tableName: "AttachedDocuments",
  });
};

// Retrieve an attached document by ID
const getAttachedDocumentById = async (attachedDocumentId) => {
  const result = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentId },
  });

  if (result.length === 0) {
    return null;
  }

  return result[0];
};

// Update an attached document
const updateAttachedDocument = async (
  attachedDocumentId,
  {
    documentName,
    documentDescription,
    documentTypeId,
    documentPath,
    documentExpirationDate,
    updatedByUserId,
  }
) => {
  // Check if the document exists
  const existingDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentId },
  });

  if (existingDocument.length === 0) {
    return { message: "error", data: "Document not found" };
  }

  // Update the document details
  const updateValues = {
    attachedDocumentName: documentName,
    attachedDocumentDescription: documentDescription,
    documentTypeId,
    attachedDocumentPath:
      documentPath || existingDocument[0].attachedDocumentPath, // Retain old path if not updated
    documentExpirationDate,
    updatedByUserId,
    attachedDocumentUpdatedAt: new Date(),
  };

  const result = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentId },
    updateValues,
  });

  if (result.affectedRows > 0) {
    return { message: "success", data: "Document updated successfully" };
  } else {
    return { message: "error", data: "Failed to update document" };
  }
};

// Delete an attached document (soft delete by marking as deleted)
const deleteAttachedDocument = async (attachedDocumentId, deletedByUserId) => {
  const existingDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentId },
  });

  if (existingDocument.length === 0) {
    return { message: "error", data: "Document not found" };
  }

  const result = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentId },
    updateValues: {
      attachedDocumentIsDeleted: true,
      deletedByUserId,
      attachedDocumentDeletedAt: new Date(),
    },
  });

  if (result.affectedRows > 0) {
    return { message: "success", data: "Document deleted successfully" };
  } else {
    return { message: "error", data: "Failed to delete document" };
  }
};

module.exports = {
  createAttachedDocument,
  getAllAttachedDocuments,
  getAttachedDocumentById,
  updateAttachedDocument,
  deleteAttachedDocument,
};
