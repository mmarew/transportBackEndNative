const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const uuidv4 = require("uuid").v4;
const path = require("path");
const { deleteFile } = require("../Utils/fileUtils");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendNotificationToAdmin,
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");

// Create a new attached document
const createAttachedDocument = async ({
  attachedDocumentDescription,
  attachedDocumentName, // File path where it's stored
  documentTypeId,
  documentExpirationDate, // Expiration date of the document
  createdByUserId,
  userUniqueId,
}) => {
  try {
    // Check if the document already exists for the same user and document type
    const existingDocument = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        userUniqueId,
        documentTypeId,
        attachedDocumentIsDeleted: false, // Check only active (non-deleted) documents
      },
    });

    if (existingDocument.length > 0) {
      const fullPath = path.resolve(
        __dirname, // Get the file path relative to the current file's directory
        "..", // Navigate up one level (from services folder)
        "uploads/" + attachedDocumentName
      );
      // Remove file if already existed
      deleteFile(fullPath);

      return {
        message: "error",
        data: `Document already exists for this user and document type`,
      };
    }
    console.log("first");
    // Determine if the document is expired (based on expiration date)
    const isExpired = documentExpirationDate
      ? new Date(documentExpirationDate) < new Date()
      : false;
    const newDocument = {
      attachedDocumentUniqueId: uuidv4(),
      userUniqueId, // The user who own the created  document
      attachedDocumentDescription,
      documentTypeId,
      documentExpirationDate,
      attachedDocumentAcceptance: "PENDING", // Default status when document is created
      attachedDocumentIsExpired: isExpired, // Set based on expiration date
      attachedDocumentIsDeleted: false, // Default to not deleted
      attachedDocumentCreatedByUserId: createdByUserId,
      attachedDocumentUpdatedByUserId: null, // Not updated yet
      attachedDocumentDeletedByUserId: null, // Not deleted yet
      attachedDocumentCreatedAt: new Date(),
      attachedDocumentDeletedAt: null, // Not deleted yet
    };
    console.log(newDocument);
    // Insert the new document into the database
    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument,
    });

    if (result?.affectedRows > 0) {
      return { message: "success", data: "Document created successfully" };
    } else {
      return { message: "error", data: "Failed to create document" };
    }
  } catch (error) {
    console.error("Error creating attached document:", error);
    return {
      message: "error",
      data: "An error occurred while creating the document",
    };
  }
};

// Retrieve all attached documents
const getAttachedDocumentsByUser = async (body) => {
  return await getData({
    tableName: "AttachedDocuments",
    conditions: {},
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

const acceptRejectAttachedDocuments = async (body) => {
  const userUniqueId = body?.user?.userUniqueId; // Admin's unique ID
  const ownerUserUniqueId = body?.ownerUserUniqueId; // The driver (document owner's) unique ID
  const attachedDocumentUniqueId = body?.attachedDocumentUniqueId; // Unique ID of the document to update
  const action = body?.action; // Accept or Reject (from the request body)
  const adminDecisionReason = body?.reason || null; // Optional reason for acceptance or rejection
  const phoneNumber = body?.phoneNumber || null;
  const roleId = body?.roleId;

  // Ensure that all required fields are provided
  if (
    !userUniqueId ||
    !ownerUserUniqueId ||
    !attachedDocumentUniqueId ||
    !action
  ) {
    return { message: "error", data: "Missing required fields" };
  }

  // Ensure action is either 'ACCEPTED' or 'REJECTED'
  if (action !== "ACCEPTED" && action !== "REJECTED") {
    return {
      message: "error",
      data: "Invalid action. Must be 'ACCEPTED' or 'REJECTED'",
    };
  }

  // Fetch the document to ensure it exists and belongs to the correct user
  const attachedDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: {
      attachedDocumentUniqueId,
      userUniqueId: ownerUserUniqueId, // Ensure the document belongs to the driver (owner)
    },
  });
  attachedDocument[0].attachedDocumentAcceptance = action;
  if (attachedDocument.length === 0) {
    return {
      message: "error",
      data: "Document not found or does not belong to this user",
    };
  }

  // Proceed with updating the document's acceptance status
  const updatedDocument = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
    updateValues: {
      attachedDocumentAcceptance: action, // Update status to 'ACCEPTED' or 'REJECTED'
      attachedDocumentUpdatedByUserId: userUniqueId, // Record admin's unique ID for tracking
      attachedDocumentUpdatedAt: new Date(), // Set the update timestamp
      attachedDocumentAcceptanceReason: adminDecisionReason, // Record reason if provided
    },
  });
  const message = {
    attachedDocument,
    message: "success",
    data: `Document has been ${action.toLowerCase()}`,
  };
  if (roleId == 3) sendNotificationToAdmin({ message, phoneNumber });
  if (roleId == 2) sendNotificationToDriver({ message, phoneNumber });
  if (roleId == 1) sendNotificationToPassenger({ message, phoneNumber });
  if (updatedDocument.affectedRows > 0) {
    return {
      message: "success",
      data: `Document has been ${action.toLowerCase()}`,
    };
  } else {
    return { message: "error", data: "Failed to update the document status" };
  }
};

module.exports = {
  acceptRejectAttachedDocuments,
  createAttachedDocument,
  getAttachedDocumentsByUser,
  getAttachedDocumentById,
  updateAttachedDocument,
  deleteAttachedDocument,
};
