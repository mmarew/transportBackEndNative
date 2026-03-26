const { insertData } = require("../CRUD/Create/CreateData");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const uuidv4 = require("uuid").v4;
const { deleteFromFTP } = require("../Utils/FTPHandler");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
const {
  sendSocketIONotificationToAdmin,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToPassenger,
} = require("../Utils/Notifications");

const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const logger = require("../Utils/logger");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { currentDate } = require("../Utils/CurrentDate");
const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { accountStatus } = require("./Account.service");
const { transactionStorage } = require("../Utils/TransactionContext");
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
      throw new AppError(`Role Document requirement not found`, 400);
    }

    const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
    if (isExpirationDateRequired && !documentExpirationDate) {
      throw new AppError(`Document expiration date is required`, 400);
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
      throw new AppError(
        `Document already exists for this user and document type`,
        409,
      );
    }
    logger.debug("@currentDate", new Date(currentDate()));
    logger.debug(
      "@new Date(documentExpirationDate) ",
      new Date(documentExpirationDate),
    );
    // return;
    // Check if document is expired
    const isExpired = documentExpirationDate
      ? new Date(documentExpirationDate) < new Date(currentDate())
      : false;

    if (isExpired) {
      throw new AppError(`Document is expired`, 400);
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
      attachedDocumentCreatedAt: currentDate(),
    };

    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument,
    });

    if (result?.affectedRows > 0) {
      // Automatically update user status after document attachment
      try {
        await accountStatus({
          ownerUserUniqueId: userUniqueId,
          body: { roleId },
        });
      } catch (statusError) {
        logger.error("Failed to update user status after document attachment", {
          error: statusError.message,
          userUniqueId,
          roleId,
        });
        // Don't fail the document creation if status update fails
      }

      return { message: "success", data: "Document created successfully" };
    } else {
      throw new AppError("Failed to create document", 500);
    }
  } catch (error) {
    logger.error("Error creating attached document", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("An error occurred while creating the document", 500);
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
      throw new AppError(`No existing document found`, 404);
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
      throw new AppError(`Role Document requirement not found`, 400);
    }

    // Expiration date requirement
    const isExpirationDateRequired = documentType?.[0].isExpirationDateRequired;
    if (isExpirationDateRequired && !documentExpirationDate) {
      throw new AppError(`Document expiration date is required`, 400);
    }

    // Expired check
    if (documentExpirationDate) {
      const isExpired = new Date(documentExpirationDate) < currentDate();
      if (isExpired) {
        throw new AppError(`Document is expired`, 400);
      }
    }

    // Prepare update data
    const newUpdateData = {
      // change to PENDING status
      attachedDocumentAcceptance: "PENDING",
      attachedDocumentDescription,
      attachedDocumentFileNumber,
      documentExpirationDate,
      // attachedDocumentUpdatedAt: currentDate(),
    };

    let oldFileUrl = null;
    if (attachedDocumentName) {
      oldFileUrl = existingDoc.attachedDocumentName;
      newUpdateData.attachedDocumentName = attachedDocumentName;
    }

    const result = await updateData({
      tableName: "AttachedDocuments",
      conditions: { attachedDocumentUniqueId },
      updateValues: newUpdateData,
    });

    if (result?.affectedRows > 0) {
      // Async cleanup of the old file
      if (oldFileUrl) {
        deleteFromFTP(oldFileUrl).catch((err) => {
          logger.warn("Failed to delete stale attached document", {
            oldFileUrl,
            error: err.message,
          });
        });
      }
      return { message: "success", data: "Document updated successfully" };
    } else {
      throw new AppError("Failed to update document", 500);
    }
  } catch (error) {
    logger.error("Error updating attached document", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("An error occurred while updating the document", 500);
  }
};

// Delete an attached document (soft delete by marking as deleted)
const deleteAttachedDocument = async (attachedDocumentUniqueId) => {
  // get attached document first
  const attachedDocument = await getAttachedDocumentByUniqueId(
    attachedDocumentUniqueId,
  );
  const attachedDocumentName = attachedDocument?.attachedDocumentName;
  if (attachedDocumentName) {
    deleteFromFTP(attachedDocumentName).catch((err) => {
      logger.warn("deleteAttachedDocument: failed to delete file", {
        attachedDocumentUniqueId,
        error: err?.message,
      });
    });
  }

  await deleteData({
    conditions: { attachedDocumentUniqueId },
  });
  return { message: "success", data: "Document deleted successfully" };
};

/**
 * Accept or reject an attached document by admin
 * @param {Object} body - Request body object
 * @param {Object} body.user - Admin user object with userUniqueId
 * @param {string} body.attachedDocumentUniqueId - Unique ID of the document to accept/reject
 * @param {string} body.action - Action to perform: "ACCEPTED" or "REJECTED"
 * @param {string} [body.reason] - Optional reason for acceptance or rejection
 * @param {number} [body.roleId] - Role ID of the document owner (for notifications)
 * @returns {Promise<Object>} Response object with success/error message and document details
 * @example
 * const result = await acceptRejectAttachedDocuments({
 *   user: { userUniqueId: "admin-uuid" },
 *   attachedDocumentUniqueId: "doc-uuid",
 *   action: "ACCEPTED",
 *   reason: "Document is valid",
 *   roleId: 2
 * });
 */
const acceptRejectAttachedDocuments = async (body) => {
  const userUniqueId = body?.user?.userUniqueId; // Admin's unique ID
  const attachedDocumentUniqueId = body?.attachedDocumentUniqueId; // Unique ID of the document to update
  const action = body?.action; // Accept or Reject (from the request body)
  const adminDecisionReason = body?.reason || null; // Optional reason for acceptance or rejection
  const roleId = body?.roleId;

  // Ensure that all required fields are provided
  if (!userUniqueId || !attachedDocumentUniqueId || !action) {
    throw new AppError(
      "Missing required fields to accept/reject document",
      400,
    );
  }

  // Ensure action is either 'ACCEPTED' or 'REJECTED'
  if (action !== "ACCEPTED" && action !== "REJECTED") {
    throw new AppError("Invalid action. Must be 'ACCEPTED' or 'REJECTED'", 400);
  }

  // Fetch the document to ensure it exists and extract the owner's userUniqueId
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
    },
  });

  if (attachedDocument?.length === 0) {
    throw new AppError("Document not found", 404);
  }

  // Extract the owner's userUniqueId from the document
  const ownerUserUniqueId = attachedDocument[0]?.userUniqueId;
  const phoneNumber = attachedDocument[0]?.phoneNumber;

  if (!ownerUserUniqueId) {
    throw new AppError("Document owner information not found", 400);
  }

  // Proceed with updating the document's acceptance status
  const updatedDocument = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
    updateValues: {
      attachedDocumentAcceptance: action, // Update status to 'ACCEPTED' or 'REJECTED'
      attachedDocumentAcceptedRejectedByUserId: userUniqueId, // Record admin's unique ID for tracking
      attachedDocumentAcceptedRejectedAt: currentDate(),
      attachedDocumentAcceptanceReason: adminDecisionReason, // Record reason if provided
    },
  });
  const message = {
    attachedDocument,
    message: "success",
    data: `Document has been ${action.toLowerCase()}`,
  };

  if (updatedDocument.affectedRows > 0) {
    // Automatically update user status after document acceptance/rejection
    try {
      await accountStatus({
        ownerUserUniqueId,
        body: { roleId },
      });
    } catch (statusError) {
      logger.error(
        "Failed to update user status after document approval/rejection",
        {
          error: statusError.message,
          ownerUserUniqueId,
          roleId,
          action,
        },
      );
      // Don't fail the document update if status update fails
    }

    if (roleId === usersRoles.adminRoleId) {
      sendSocketIONotificationToAdmin({ message, phoneNumber });
    }
    // adjust drivers role status based on document acceptance
    const documentAndVehicleOfDriver = await driversDocumentVehicleRequirement({
      ownerUserUniqueId,
      user: attachedDocument[0],
    });
    if (roleId === usersRoles.driverRoleId) {
      // messageType ==="acceptOrRejectDriverDocument";
      documentAndVehicleOfDriver.messageType = "acceptOrRejectDriverDocument";
      sendSocketIONotificationToDriver({
        message: documentAndVehicleOfDriver,
        phoneNumber,
      });
    }
    if (roleId === usersRoles.passengerRoleId) {
      sendSocketIONotificationToPassenger({ message, phoneNumber });
    }

    return message;
  } else {
    throw new AppError("Failed to update the document status", 500);
  }
};

const getAttachedDocumentsByFilter = async ({ filter, pagination, sort }) => {
  try {
    const {
      attachedDocumentUniqueId,
      userUniqueId,
      documentTypeId,
      email,
      phoneNumber,
      fullName,
    } = filter;

    const { page = 1, limit = 10, offset = 0 } = pagination || {};
    const { by = "attachedDocumentCreatedAt", order = "DESC" } = sort || {};

    // If specific document ID is provided, return only that document
    if (attachedDocumentUniqueId) {
      const sql = `
        SELECT
          ad.*,
          dt.*,
          u.userId,
          u.fullName,
          u.phoneNumber,
          u.email,
          u.userCreatedAt,
          u.userCreatedBy,
          u.userDeletedAt,
          u.userDeletedBy,
          u.isDeleted
        FROM AttachedDocuments ad
        JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
        JOIN Users u ON ad.userUniqueId = u.userUniqueId
        WHERE ad.attachedDocumentUniqueId = ?
      `;
      const executor = transactionStorage.getStore() || pool;
      const [document] = await executor.query(sql, [attachedDocumentUniqueId]);

      if (!document || document.length === 0) {
        throw new AppError("Document not found", 404);
      }

      return {
        message: "success",
        data: document[0],
      };
    }

    // Build WHERE conditions
    const whereClauses = [];
    const params = [];

    // Only filter by userUniqueId if provided, otherwise search by email/phone/name
    if (userUniqueId && userUniqueId !== "all") {
      whereClauses.push("ad.userUniqueId = ?");
      params.push(userUniqueId);
    }

    if (documentTypeId && documentTypeId !== "all") {
      whereClauses.push("ad.documentTypeId = ?");
      params.push(documentTypeId);
    }

    // Add user profile filters (email, phone, name)
    if (email && email !== "all") {
      whereClauses.push("u.email = ?");
      params.push(email);
    }

    if (phoneNumber && phoneNumber !== "all") {
      whereClauses.push("u.phoneNumber = ?");
      params.push(phoneNumber);
    }

    if (fullName && fullName !== "all") {
      whereClauses.push("u.fullName = ?");
      params.push(fullName);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM AttachedDocuments ad
      JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
      JOIN Users u ON ad.userUniqueId = u.userUniqueId
      ${whereClause}
    `;
    const executor = transactionStorage.getStore() || pool;
    const [countResult] = await executor.query(countSql, params);
    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated results
    const sql = `
      SELECT
        ad.*,
        dt.*,
        u.userId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.userCreatedAt,
        u.userCreatedBy,
        u.userDeletedAt,
        u.userDeletedBy,
        u.isDeleted
      FROM AttachedDocuments ad
      JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
      JOIN Users u ON ad.userUniqueId = u.userUniqueId
      ${whereClause}
      ORDER BY ad.${by} ${order}
      LIMIT ? OFFSET ?
    `;
    logger.debug("@sql", sql, "@userUniqueId", userUniqueId);
    const [documents] = await executor.query(sql, [...params, limit, offset]);

    return {
      message: "success",
      data: {
        documents,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      },
    };
  } catch {
    throw new AppError("Unable to retrieve documents", 500);
  }
};

module.exports = {
  getAttachedDocumentsByFilter,
  acceptRejectAttachedDocuments,
  createAttachedDocument,
  getAttachedDocumentsByUser,
  getAttachedDocumentByUniqueId,
  updateAttachedDocument,
  deleteAttachedDocument,
};
