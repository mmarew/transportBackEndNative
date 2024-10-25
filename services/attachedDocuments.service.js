const { insertData } = require("../CRUD/Create/CreateData");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const uuidv4 = require("uuid").v4;
const { deleteFile } = require("../Utils/fileUtils");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
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
    const documentType = await getData({
      tableName: "DocumentTypes",
      conditions: {
        documentTypeId,
      },
    });
    if (documentType.length === 0) {
      deleteFile(attachedDocumentName);
      return {
        message: "error",
        error: `Document type not found`,
      };
    }
    const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
    if (isExpirationDateRequired && !documentExpirationDate) {
      deleteFile(attachedDocumentName);
      return {
        message: "error",
        error: `Document expiration date is required`,
      };
    }
    // Check if the document already exists for the same user and document type
    const existingDocument = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        userUniqueId,
        documentTypeId,
      },
    });

    if (existingDocument.length > 0) {
      // Remove file if already existed
      deleteFile(attachedDocumentName);

      return {
        message: "error",
        error: `Document already exists for this user and document type`,
      };
    }
    // Determine if the document is expired (based on expiration date)
    const isExpired = documentExpirationDate
      ? new Date(documentExpirationDate) < new Date()
      : false;
    if (isExpired) {
      deleteFile(attachedDocumentName);
      return {
        message: "error",
        error: `Document is expired`,
      };
    }
    const newDocument = {
      attachedDocumentUniqueId: uuidv4(),
      userUniqueId, // The user who own the created  document
      attachedDocumentDescription,
      documentTypeId,
      documentExpirationDate,
      attachedDocumentAcceptance: "PENDING", // Default status when document is created
      attachedDocumentCreatedByUserId: createdByUserId,
      attachedDocumentCreatedAt: new Date(),
    };
    // Insert the new document into the database
    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument,
    });

    if (result?.affectedRows > 0) {
      return { message: "success", data: "Document created successfully" };
    } else {
      deleteFile(attachedDocumentName);
      return { message: "error", error: "Failed to create document" };
    }
  } catch (error) {
    deleteFile(attachedDocumentName);
    console.error("Error creating attached document:", error);
    return {
      message: "error",
      error: "An error occurred while creating the document",
    };
  }
};

// Retrieve all attached documents
const getAttachedDocumentsByUser = async (userUniqueId) => {
  return await performJoinSelect({
    baseTable: "AttachedDocuments",
    joins: [
      {
        table: "DocumentTypes",
        on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
      },
    ],
    conditions: {
      userUniqueId: userUniqueId,
    },
  });
};

// Retrieve an attached document by ID
const getAttachedDocumentByUniqueId = async (attachedDocumentUniqueId) => {
  const result = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });

  if (result.length === 0) {
    return null;
  }

  return result[0];
};

// Update an attached document
const updateAttachedDocument = async (
  attachedDocumentUniqueId,
  {
    documentDescription,
    documentTypeId,
    attachedDocumentName, // Updated field name
    documentExpirationDate,
    updatedByUserId,
  }
) => {
  // Validate all fields
  if (!attachedDocumentUniqueId) {
    return {
      message: "error",
      data: "Attached document unique id is required",
    };
  }

  if (!updatedByUserId) {
    return { message: "error", data: "Updated by user id is required" };
  }

  if (!documentTypeId) {
    return { message: "error", data: "Document type id is required" };
  }

  // Validate documentExpirationDate if provided
  let isExpired = false;
  if (documentExpirationDate) {
    const date = new Date(documentExpirationDate);
    if (isNaN(date.getTime())) {
      return { message: "error", data: "Invalid date format for expiration" };
    }
    // Check if the document is expired based on the provided date
    isExpired = date < new Date();
  }

  // Fetch the existing document
  const existingDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });

  if (existingDocument.length === 0) {
    return { message: "error", data: "Document not found" };
  }

  // Prepare the historical data to insert into AttachedDocumentsHistory
  const historyDocument = {
    attachedDocumentUniqueId: existingDocument[0].attachedDocumentUniqueId,
    userUniqueId: existingDocument[0].userUniqueId,
    attachedDocumentDescription:
      existingDocument[0].attachedDocumentDescription,
    documentTypeId: existingDocument[0].documentTypeId,
    documentExpirationDate: existingDocument[0].documentExpirationDate,
    attachedDocumentAcceptance: existingDocument[0].attachedDocumentAcceptance,
    attachedDocumentCreatedByUserId:
      existingDocument[0].attachedDocumentCreatedByUserId,
    attachedDocumentCreatedAt: existingDocument[0].attachedDocumentCreatedAt,
    attachedDocumentUpdatedByUserId: updatedByUserId,
    attachedDocumentUpdatedAt: new Date(),
    attachedDocumentIsExpired:
      existingDocument[0].documentExpirationDate < new Date(),
    attachedDocumentAcceptanceReason:
      existingDocument[0].attachedDocumentAcceptanceReason,
    attachedDocumentName: existingDocument[0].attachedDocumentName, // Store the previous document name
  };

  // Insert the current document into the history table
  const historyResult = await insertData({
    tableName: "AttachedDocumentsHistory",
    colAndVal: historyDocument,
  });

  if (historyResult.affectedRows === 0) {
    return { message: "error", data: "Failed to archive current document" };
  }

  // Delete the existing document from the active table
  const deleteResult = await deleteData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });

  if (deleteResult.affectedRows === 0) {
    return { message: "error", data: "Failed to delete current document" };
  }

  // Insert the updated document back into AttachedDocuments (keeping the same UUID)
  const newDocument = {
    attachedDocumentUniqueId: existingDocument[0].attachedDocumentUniqueId, // Retain the same UUID
    userUniqueId: existingDocument[0].userUniqueId,
    attachedDocumentDescription:
      documentDescription || existingDocument[0].attachedDocumentDescription,
    documentTypeId: documentTypeId || existingDocument[0].documentTypeId,
    attachedDocumentName:
      attachedDocumentName || existingDocument[0].attachedDocumentName, // Retain the existing name if not updated
    documentExpirationDate:
      documentExpirationDate || existingDocument[0].documentExpirationDate,
    attachedDocumentCreatedByUserId:
      existingDocument[0].attachedDocumentCreatedByUserId,
    attachedDocumentCreatedAt: existingDocument[0].attachedDocumentCreatedAt, // Retain the original created date
    attachedDocumentAcceptance: "PENDING", // Reset to pending status
    attachedDocumentIsExpired: isExpired, // Update expiration status
  };

  const insertResult = await insertData({
    tableName: "AttachedDocuments",
    colAndVal: newDocument,
  });

  if (insertResult.affectedRows > 0) {
    return { message: "success", data: "Document updated successfully" };
  } else {
    return { message: "error", data: "Failed to update document" };
  }
};

// Delete an attached document (soft delete by marking as deleted)
const deleteAttachedDocument = async (attachedDocumentUniqueId) => {
  const data = await deleteData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });
  return { message: "success", data: "Document deleted successfully" };
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

  if (attachedDocument.length === 0) {
    return {
      message: "error",
      data: "Document not found or does not belong to this user",
    };
  }

  // Update the document's acceptance status
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
      attachedDocumentAcceptedRejectedByUserId: userUniqueId, // Record admin's unique ID for tracking
      attachedDocumentAcceptedRejectedAt: new Date(),
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
  getAttachedDocumentByUniqueId,
  updateAttachedDocument,
  deleteAttachedDocument,
};
