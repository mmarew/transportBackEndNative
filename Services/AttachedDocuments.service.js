const { insertData } = require("../CRUD/Create/CreateData");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const uuidv4 = require("uuid").v4;
const { deleteFile } = require("../Utils/FileUtils");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
const {
  sendNotificationToAdmin,
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");

const { pool } = require("../Middleware/Database.config");
const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const { deleteFromFTP } = require("../Utils/FTPHandler");
// Create a new attached document
// const createAttachedDocument = async ({
//   attachedDocumentDescription,
//   attachedDocumentName, // File path where it's stored
//   documentTypeId,
//   documentExpirationDate, // Expiration date of the document
//   attachedDocumentFileNumber,
//   roleId,
//   userUniqueId,
// }) => {
//   try {
//     // const { userUniqueId } = user;
//     const conditions = {
//       documentTypeId,
//       roleId: roleId,
//     };
//     console.log("@conditions", conditions);
//     const documentType = await getData({
//       tableName: "RoleDocumentRequirements",
//       conditions,
//     });
//     if (documentType.length === 0) {
//       deleteFile(attachedDocumentName);
//       return {
//         message: "error",
//         error: `Document type not found`,
//       };
//     }
//     const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
//     if (isExpirationDateRequired && !documentExpirationDate) {
//       deleteFile(attachedDocumentName);
//       return {
//         message: "error",
//         error: `Document expiration date is required`,
//       };
//     }
//     // Check if the document already exists for the same user and document type
//     const existingDocument = await getData({
//       tableName: "AttachedDocuments",
//       conditions: {
//         userUniqueId,
//         documentTypeId,
//       },
//     });

//     if (existingDocument.length > 0) {
//       // Remove file if already existed
//       deleteFile(attachedDocumentName);

//       return {
//         message: "error",
//         error: `Document already exists for this user and document type`,
//       };
//     }
//     // Determine if the document is expired (based on expiration date)
//     const isExpired = documentExpirationDate
//       ? new Date(documentExpirationDate) < new Date()
//       : false;
//     if (isExpired) {
//       deleteFile(attachedDocumentName);
//       return {
//         message: "error",
//         error: `Document is expired`,
//       };
//     }
//     const newDocument = {
//       attachedDocumentUniqueId: uuidv4(),
//       userUniqueId, // The user who own the created  document
//       attachedDocumentDescription,
//       attachedDocumentName,
//       documentTypeId,
//       documentExpirationDate,
//       attachedDocumentAcceptance: "PENDING", // Default status when document is created
//       attachedDocumentCreatedByUserId: userUniqueId,
//       attachedDocumentFileNumber,
//       attachedDocumentCreatedAt: new Date(),
//     };
//     // Insert the new document into the database
//     const result = await insertData({
//       tableName: "AttachedDocuments",
//       colAndVal: newDocument,
//     });

//     if (result?.affectedRows > 0) {
//       return { message: "success", data: "Document created successfully" };
//     } else {
//       deleteFile(attachedDocumentName);
//       return { message: "error", error: "Failed to create document" };
//     }
//   } catch (error) {
//     deleteFile(attachedDocumentName);
//     console.log("Error creating attached document:", error);
//     return {
//       message: "error",
//       error: "An error occurred while creating the document",
//     };
//   }
// };
// services
const createAttachedDocument = async ({
  attachedDocumentDescription,
  attachedDocumentName, // This is now the URL from FTP
  documentTypeId,
  documentExpirationDate,
  attachedDocumentFileNumber,
  roleId,
  userUniqueId,
}) => {
  try {
    const conditions = {
      documentTypeId,
      roleId: roleId,
    };

    const documentType = await getData({
      tableName: "RoleDocumentRequirements",
      conditions,
    });

    if (documentType.length === 0) {
      return {
        message: "error",
        error: `Role Document requirement not found`,
      };
    }

    const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
    if (isExpirationDateRequired && !documentExpirationDate) {
      return {
        message: "error",
        error: `Document expiration date is required`,
      };
    }

    // Check if the document already exists
    const existingDocument = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        userUniqueId,
        documentTypeId,
      },
    });

    if (existingDocument.length > 0) {
      return {
        message: "error",
        error: `Document already exists for this user and document type`,
      };
    }

    // Check if document is expired
    const isExpired = documentExpirationDate
      ? new Date(documentExpirationDate) < new Date()
      : false;

    if (isExpired) {
      return {
        message: "error",
        error: `Document is expired`,
      };
    }

    const newDocument = {
      attachedDocumentUniqueId: uuidv4(),
      userUniqueId,
      attachedDocumentDescription,
      attachedDocumentName, // This is now the URL
      documentTypeId,
      documentExpirationDate,
      attachedDocumentAcceptance: "PENDING",
      attachedDocumentCreatedByUserId: userUniqueId,
      attachedDocumentFileNumber,
      attachedDocumentCreatedAt: new Date(),
    };

    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument,
    });

    if (result?.affectedRows > 0) {
      return { message: "success", data: "Document created successfully" };
    } else {
      return { message: "error", error: "Failed to create document" };
    }
  } catch (error) {
    console.log("Error creating attached document:", error);
    return {
      message: "error",
      error: "An error occurred while creating the document",
    };
  }
};

// Retrieve all attached documents
const getAttachedDocumentsByUser = async (userUniqueId) => {
  const documents = await performJoinSelect({
    baseTable: "AttachedDocuments",
    joins: [
      {
        table: "DocumentTypes",
        on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
      },
    ],
    conditions: {
      userUniqueId,
    },
  });
  return {
    message: "success",
    data: documents,
  };
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

// const updateAttachedDocument = async (
//   attachedDocumentUniqueId,
//   user,
//   requestBody,
//   uploadedFiles
// ) => {
//   console.log("@uploadedFiles", uploadedFiles);
//   // Validate inputs
//   if (!attachedDocumentUniqueId) {
//     return {
//       message: "error",
//       data: "Attached document unique ID is required",
//     };
//   }
//   if (!user || !user.userUniqueId) {
//     return { message: "error", data: "User information is missing" };
//   }

//   const userUniqueId = user.userUniqueId;

//   // Fetch existing document details
//   const [existingDocument] = await performJoinSelect({
//     baseTable: "AttachedDocuments",
//     joins: [
//       {
//         on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
//         table: "DocumentTypes",
//       },
//     ],
//     // tableName: "AttachedDocuments",
//     conditions: { attachedDocumentUniqueId },
//   });
//   // console.log("existingDocument", existingDocument);
//   // return;
//   if (!existingDocument) {
//     return { message: "error", data: "Attached document not found" };
//   }

//   // Extract new data from the request body
//   const documentDescription =
//     requestBody[existingDocument.uploadedDocumentDescription] || null;
//   const documentTypeId =
//     requestBody[existingDocument.uploadedDocumentTypeId] || null;
//   let documentExpirationDate =
//     requestBody[existingDocument.uploadedDocumentExpirationDate] || null;

//   // Validate and process expiration date
//   let isExpired = false;
//   if (documentExpirationDate == "null") {
//     documentExpirationDate = null;
//   }
//   if (documentExpirationDate) {
//     const expirationDate = new Date(documentExpirationDate);
//     if (isNaN(expirationDate.getTime())) {
//       return { message: "error", data: "Invalid date format for expiration" };
//     }
//     isExpired = expirationDate < new Date();
//   }

//   // Handle file uploads
//   let attachedDocumentName = existingDocument.attachedDocumentName;
//   if (uploadedFiles && uploadedFiles.length > 0) {
//     const fileUrl = uploadedFiles[0];
//     const urlParts = fileUrl?.split("/");
//     const filename = urlParts?.[urlParts.length - 1];
//     if (!filename) {
//       console.log("Error: Could not extract filename from URL:", fileUrl);
//       return { success: false, error: "Invalid file URL" };
//     }

//     deleteFromFTP(attachedDocumentName);

//     // deleteFile(existingDocument.attachedDocumentName); // Delete old file
//     // use full url to store in database
//     attachedDocumentName = fileUrl;
//   }

//   // Prepare historical record for AttachedDocumentsHistory
//   const historyDocument = {
//     attachedDocumentId: existingDocument.attachedDocumentId, // ID of the original document
//     attachedDocumentUniqueId: existingDocument.attachedDocumentUniqueId,
//     userUniqueId: existingDocument.userUniqueId,
//     attachedDocumentDescription: existingDocument.attachedDocumentDescription,
//     documentTypeId: existingDocument.documentTypeId,
//     documentExpirationDate: existingDocument.documentExpirationDate,
//     attachedDocumentAcceptance: existingDocument.attachedDocumentAcceptance,
//     attachedDocumentAcceptedRejectedByUserId:
//       existingDocument.attachedDocumentAcceptedRejectedByUserId,
//     attachedDocumentAcceptedRejectedAt:
//       existingDocument.attachedDocumentAcceptedRejectedAt,
//     attachedDocumentName: existingDocument.attachedDocumentName,
//     attachedDocumentCreatedByUserId:
//       existingDocument.attachedDocumentCreatedByUserId,
//     attachedDocumentUpdatedByUserId: userUniqueId, // Current user making the update
//     attachedDocumentDeletedByUserId:
//       existingDocument.attachedDocumentDeletedByUserId,
//     attachedDocumentCreatedAt: existingDocument.attachedDocumentCreatedAt,
//     attachedDocumentUpdatedAt: new Date(),
//     attachedDocumentDeletedAt: existingDocument.attachedDocumentDeletedAt,
//     attachedDocumentIsExpired: isExpired,
//     attachedDocumentAcceptanceReason:
//       existingDocument.attachedDocumentAcceptanceReason,
//     documentVersion: (existingDocument.documentVersion || 1) + 1,
//   };

//   // Insert historical record
//   const historyResult = await insertData({
//     tableName: "AttachedDocumentsHistory",
//     colAndVal: historyDocument,
//   });

//   if (!historyResult || historyResult.affectedRows === 0) {
//     return { message: "error", data: "Failed to archive current document" };
//   }

//   // Prepare updated document data for AttachedDocuments
//   const updateValues = {
//     attachedDocumentDescription:
//       documentDescription || existingDocument.attachedDocumentDescription,
//     documentTypeId: documentTypeId || existingDocument.documentTypeId,
//     attachedDocumentName:
//       attachedDocumentName || existingDocument.attachedDocumentName,
//     documentExpirationDate:
//       documentExpirationDate || existingDocument.documentExpirationDate,
//     attachedDocumentAcceptance: "PENDING",
//   };
//   console.log("documentDescription", documentDescription);
//   console.log("updateValues  ===========>  ", updateValues);
//   // Update the AttachedDocuments table with the new data
//   const updateResult = await updateData({
//     tableName: "AttachedDocuments",
//     conditions: { attachedDocumentUniqueId },
//     updateValues,
//   });

//   if (updateResult.affectedRows > 0) {
//     return { message: "success", data: "Document updated successfully" };
//   }

//   return { message: "error", data: "Failed to update document" };
// };

const updateAttachedDocument = async ({
  attachedDocumentUniqueId,
  roleId,
  documentExpirationDate,
  attachedDocumentDescription,
  attachedDocumentFileNumber,
  attachedDocumentName,
}) => {
  try {
    // Fetch existing document
    const existingDocs = await getData({
      tableName: "AttachedDocuments",
      conditions: { attachedDocumentUniqueId },
    });

    if (existingDocs.length === 0) {
      return {
        message: "error",
        error: `No existing document found`,
      };
    }

    const existingDoc = existingDocs[0];

    // Check role requirement
    const documentType = await getData({
      tableName: "RoleDocumentRequirements",
      conditions: {
        documentTypeId: existingDoc.documentTypeId,
        roleId,
      },
    });

    if (documentType.length === 0) {
      return {
        message: "error",
        error: `Role Document requirement not found`,
      };
    }

    // Expiration date requirement
    const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
    if (isExpirationDateRequired && !documentExpirationDate) {
      return {
        message: "error",
        error: `Document expiration date is required`,
      };
    }

    // Expired check
    if (documentExpirationDate) {
      const isExpired = new Date(documentExpirationDate) < new Date();
      if (isExpired) {
        return {
          message: "error",
          error: `Document is expired`,
        };
      }
    }

    // Prepare update data
    const newUpdateData = {
      // change to PENDING status
      attachedDocumentAcceptance: "PENDING",
      attachedDocumentDescription,
      attachedDocumentFileNumber,
      documentExpirationDate,
      // attachedDocumentUpdatedAt: new Date(),
    };

    if (attachedDocumentName) {
      newUpdateData.attachedDocumentName = attachedDocumentName;
    }

    const result = await updateData({
      // tableName: "AttachedDocuments",
      // conditions: { attachedDocumentUniqueId },
      // colAndVal: newUpdateData,
      tableName: "AttachedDocuments",
      conditions: { attachedDocumentUniqueId },
      updateValues: newUpdateData,
    });

    if (result?.affectedRows > 0) {
      return { message: "success", data: "Document updated successfully" };
    } else {
      return { message: "error", error: "Failed to update document" };
    }
  } catch (error) {
    console.log("Error updating attached document:", error);
    return {
      message: "error",
      error: "An error occurred while updating the document",
    };
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
  console.log("@deleteAttachedDocument data data ===========> ", data);
  return { message: "success", data: "Document deleted successfully" };
};

const acceptRejectAttachedDocuments = async (body) => {
  const userUniqueId = body?.user?.userUniqueId; // Admin's unique ID
  const ownerUserUniqueId = body?.ownerUserUniqueId; // The driver (document owner's) unique ID
  const attachedDocumentUniqueId = body?.attachedDocumentUniqueId; // Unique ID of the document to update
  const action = body?.action; // Accept or Reject (from the request body)
  const adminDecisionReason = body?.reason || null; // Optional reason for acceptance or rejection
  const roleId = body?.roleId;

  // Ensure that all required fields are provided
  if (
    !userUniqueId ||
    !ownerUserUniqueId ||
    !attachedDocumentUniqueId ||
    !action
  ) {
    return {
      message: "error",
      data: "Missing required fields to accept/reject document",
    };
  }

  // Ensure action is either 'ACCEPTED' or 'REJECTED'
  if (action !== "ACCEPTED" && action !== "REJECTED") {
    return {
      message: "error",
      data: "Invalid action. Must be 'ACCEPTED' or 'REJECTED'",
    };
  }
  // Fetch the document to ensure it exists and belongs to the correct user
  const attachedDocument = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "AttachedDocuments",
        on: "AttachedDocuments.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: {
      attachedDocumentUniqueId,
      ["AttachedDocuments.userUniqueId"]: ownerUserUniqueId, // Ensure the document belongs to the driver (owner)
    },
  });
  const phoneNumber = attachedDocument[0].phoneNumber;
  if (attachedDocument?.length === 0) {
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
    const documentAndVehicleOfDriver = await driversDocumentVehicleRequirement({
      ownerUserUniqueId,
      user: attachedDocument[0],
    });
    if (roleId == 2) {
      // messageType == "acceptOrRejectDriverDocument";
      documentAndVehicleOfDriver.messageType = "acceptOrRejectDriverDocument";
      sendNotificationToDriver({
        message: documentAndVehicleOfDriver,
        phoneNumber,
      });
    }
    if (roleId == 1) sendNotificationToPassenger({ message, phoneNumber });

    return message;
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
