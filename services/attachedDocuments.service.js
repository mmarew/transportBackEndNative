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
const {
  driversDocumentVehicleRequirement,
} = require("./DriverRequest.service");
// Create a new attached document
const createAttachedDocument = async ({
  attachedDocumentDescription,
  attachedDocumentName, // File path where it's stored
  documentTypeId,
  documentExpirationDate, // Expiration date of the document
  createdByUserId,
  userUniqueId,
  roleId,
}) => {
  try {
    const documentType = await getData({
      tableName: "RoleDocumentRequirements",
      conditions: {
        documentTypeId,
        roleId: roleId,
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
      attachedDocumentName,
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

const updateAttachedDocument = async (
  attachedDocumentUniqueId,
  {
    documentDescription,
    documentTypeId,
    documentExpirationDate,
    attachedDocumentName, // File name (existing or new)
    updatedByUserId,
  }
) => {
  // Validation of required fields
  if (!attachedDocumentUniqueId) {
    return {
      message: "error",
      data: "Attached document unique ID is required",
    };
  }
  if (!updatedByUserId) {
    return { message: "error", data: "Updated by user ID is required" };
  }

  // Check if documentExpirationDate is valid and determine if expired
  let isExpired = false;
  if (documentExpirationDate) {
    const expirationDate = new Date(documentExpirationDate);
    if (isNaN(expirationDate.getTime())) {
      return { message: "error", data: "Invalid date format for expiration" };
    }
    isExpired = expirationDate < new Date();
  }

  // Fetch existing document data
  const existingDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });
  if (existingDocument.length === 0) {
    return { message: "error", data: "Document not found" };
  }

  // Prepare historical data with version increment
  const documentVersion = existingDocument[0].documentVersion || 1;
  const historyDocument = {
    ...existingDocument[0],
    attachedDocumentUpdatedByUserId: updatedByUserId,
    attachedDocumentUpdatedAt: new Date(),
    documentVersion: documentVersion + 1,
  };

  // Insert historical record
  const historyResult = await insertData({
    tableName: "AttachedDocumentsHistory",
    colAndVal: historyDocument,
  });
  if (historyResult.affectedRows === 0) {
    return { message: "error", data: "Failed to archive current document" };
  }

  // Prepare updated document data
  const updatedDocument = {
    attachedDocumentDescription:
      documentDescription || existingDocument[0].attachedDocumentDescription,
    documentTypeId: documentTypeId || existingDocument[0].documentTypeId,
    attachedDocumentName:
      attachedDocumentName || existingDocument[0].attachedDocumentName,
    documentExpirationDate:
      documentExpirationDate || existingDocument[0].documentExpirationDate,
    attachedDocumentAcceptance: "PENDING",
    attachedDocumentCreatedByUserId:
      existingDocument[0].attachedDocumentCreatedByUserId,
    attachedDocumentCreatedAt: existingDocument[0].attachedDocumentCreatedAt,
  };

  // Update the AttachedDocuments table with the new data
  const updateResult = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
    updateValues: { ...updatedDocument },
  });

  if (updateResult.affectedRows > 0) {
    return { message: "success", data: "Document updated successfully" };
  } else {
    return { message: "error", data: "Failed to update document" };
  }
};

// Delete an attached document (soft delete by marking as deleted)
const deleteAttachedDocument = async (attachedDocumentUniqueId) => {
  // get attached document first
  const attachedDocument = await getAttachedDocumentByUniqueId(
    attachedDocumentUniqueId
  );
  const attachedDocumentName = attachedDocument?.attachedDocumentName;
  if (attachedDocumentName) deleteFile(attachedDocumentName);

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
  if (updatedDocument.affectedRows > 0) {
    if (roleId == 3) sendNotificationToAdmin({ message, phoneNumber });
    // adjust drivers role status based on document acceptance
    const statusOfDriver = await driversDocumentVehicleRequirement({
      ownerUserUniqueId,
    });
    if (roleId == 2)
      sendNotificationToDriver({ message: statusOfDriver, phoneNumber });
    if (roleId == 1) sendNotificationToPassenger({ message, phoneNumber });

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
