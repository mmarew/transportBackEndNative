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
const messageTypes = require("../Utils/MessageTypes");
const createAttachedDocument = async ({
  attachedDocumentDescription,
  attachedDocumentName,    // URL from FTP upload
  documentTypeId,
  documentExpirationDate,
  attachedDocumentFileNumber,
  roleId,
  // Polymorphic owner fields
  ownerType   = 'user',   // 'user' | 'company' | 'vehicle'
  ownerUniqueId,           // UUID of the owning entity
  uploadedByUserId,        // userUniqueId of the person who pressed upload (audit)
}) => {
  try {
    // Validate roleId / documentType link — only for user-owned documents.
    // Company and vehicle docs are NOT tied to RoleDocumentRequirements.
    if (ownerType === 'user' && roleId) {
      const documentType = await getData({
        tableName: "RoleDocumentRequirements",
        conditions: { documentTypeId, roleId },
      });

      if (documentType.length === 0) {
        throw new AppError(`Role Document requirement not found`, 400);
      }

      const isExpirationDateRequired = documentType[0].isExpirationDateRequired;
      if (isExpirationDateRequired && !documentExpirationDate) {
        throw new AppError(`Document expiration date is required`, 400);
      }
    }

    // Duplicate check: same owner + same document type
    const existingDocument = await getData({
      tableName: "AttachedDocuments",
      conditions: { ownerType, ownerUniqueId, documentTypeId },
    });

    if (existingDocument.length > 0) {
      throw new AppError(
        `Document already exists for this ${ownerType} and document type`,
        409,
      );
    }

    // Expiry check
    const isExpired = documentExpirationDate
      ? new Date(documentExpirationDate) < new Date(currentDate())
      : false;

    if (isExpired) {
      throw new AppError(`Document is expired`, 400);
    }

    const newDocument = {
      attachedDocumentUniqueId: uuidv4(),
      ownerType,
      ownerUniqueId,
      attachedDocumentDescription,
      attachedDocumentName,
      documentTypeId,
      documentExpirationDate,
      attachedDocumentAcceptance: "PENDING",
      attachedDocumentCreatedByUserId: uploadedByUserId ?? ownerUniqueId,
      attachedDocumentFileNumber,
      attachedDocumentCreatedAt: currentDate(),
    };

    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument,
    });

    if (result?.affectedRows > 0) {
      // Only trigger accountStatus for user-owned docs
      if (ownerType === 'user' && roleId) {
        try {
          await accountStatus({
            ownerUserUniqueId: ownerUniqueId,
            body: { roleId },
          });
        } catch (statusError) {
          logger.error("Failed to update user status after document attachment", {
            error: statusError.message,
            ownerUniqueId,
            roleId,
          });
        }
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
    if (error instanceof AppError) throw error;
    throw new AppError("An error occurred while creating the document", 500);
  }
};

/**
 * Retrieve all documents belonging to an owner (user, company, or vehicle).
 * @param {string} ownerUniqueId
 * @param {'user'|'company'|'vehicle'} [ownerType='user']
 */
const getAttachedDocumentsByOwner = async (ownerUniqueId, ownerType = 'user') => {
  const documents = await performJoinSelect({
    baseTable: "AttachedDocuments",
    joins: [
      {
        table: "DocumentTypes",
        on: "AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId",
      },
    ],
    conditions: { ownerType, ownerUniqueId },
  });
  return { message: "success", data: documents };
};

// Keep backward-compat alias — callers passing a userUniqueId still work
const getAttachedDocumentsByUser = (userUniqueId) =>
  getAttachedDocumentsByOwner(userUniqueId, 'user');

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

  // Fetch the document to get owner info (no longer joins Users since owner may be a company)
  const attachedDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
  });

  if (!attachedDocument || attachedDocument.length === 0) {
    throw new AppError("Document not found", 404);
  }

  // Extract polymorphic owner info
  const ownerUniqueId = attachedDocument[0]?.ownerUniqueId;
  const ownerType     = attachedDocument[0]?.ownerType;

  // For notifications we still need the phone number — only available for user owners
  let phoneNumber = null;
  if (ownerType === 'user' && ownerUniqueId) {
    const [userRows] = await pool.query(
      "SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1",
      [ownerUniqueId],
    );
    phoneNumber = userRows?.[0]?.phoneNumber ?? null;
  }

  if (!ownerUniqueId) {
    throw new AppError("Document owner information not found", 400);
  }

  // Proceed with updating the document's acceptance status
  const updatedDocument = await updateData({
    tableName: "AttachedDocuments",
    conditions: { attachedDocumentUniqueId },
    updateValues: {
      attachedDocumentAcceptance: action,
      attachedDocumentAcceptedRejectedByUserId: userUniqueId,
      attachedDocumentAcceptedRejectedAt: currentDate(),
      attachedDocumentAcceptanceReason: adminDecisionReason,
    },
  });

  if (updatedDocument.affectedRows === 0) {
    throw new AppError("Failed to update the document status", 500);
  }

  const message = {
    attachedDocument,
    message: "success",
    data: `Document has been ${action.toLowerCase()}`,
  };

  // ── Post-commit: status recalc + socket notifications ─────────────────────
  // Run AFTER the transaction closes to avoid deadlocking the connection pool.
  // accountStatus calls getUserByFilterDetailed which uses pool directly —
  // calling it inside a transaction starves the pool and causes a timeout.
  if (ownerType === 'user') {
    setImmediate(async () => {
      try {
        await accountStatus({
          ownerUserUniqueId: ownerUniqueId,
          body: { roleId },
        });
      } catch (statusError) {
        logger.error(
          "Post-commit: failed to update user status after document action",
          { error: statusError.message, ownerUniqueId, roleId, action },
        );
      }

      try {
        if (Number(roleId) === usersRoles.adminRoleId) {
          message.messageType = messageTypes?.accept_reject_driver_document;
          sendSocketIONotificationToAdmin({ message, phoneNumber });
        }
        if (Number(roleId) === usersRoles.driverRoleId) {
          message.messageType = "acceptOrRejectDriverDocument";
          sendSocketIONotificationToDriver({ message, phoneNumber });
        }
        if (Number(roleId) === usersRoles.passengerRoleId) {
          sendSocketIONotificationToPassenger({ message, phoneNumber });
        }
      } catch (notifError) {
        logger.error("Post-commit: socket notification failed", {
          error: notifError.message,
          ownerUniqueId,
          roleId,
        });
      }
    });
  }

  return message;
};

const getAttachedDocumentsByFilter = async ({ filter, pagination, sort }) => {
  try {
    const {
      attachedDocumentUniqueId,
      ownerType,
      ownerUniqueId,
      documentTypeId,
      // User-specific filters (only apply when ownerType='user')
      email,
      phoneNumber,
      fullName,
    } = filter;

    const { page = 1, limit = 10, offset = 0 } = pagination || {};
    const { by = "attachedDocumentCreatedAt", order = "DESC" } = sort || {};

    // If specific document ID is provided, return only that document
    if (attachedDocumentUniqueId) {
      const sql = `
        SELECT ad.*, dt.*
        FROM AttachedDocuments ad
        JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
        WHERE ad.attachedDocumentUniqueId = ?
      `;
      const executor = transactionStorage.getStore() || pool;
      const [document] = await executor.query(sql, [attachedDocumentUniqueId]);

      if (!document || document.length === 0) {
        throw new AppError("Document not found", 404);
      }

      return { message: "success", data: document[0] };
    }

    // Build WHERE conditions
    const whereClauses = [];
    const params = [];

    if (ownerType) {
      whereClauses.push("ad.ownerType = ?");
      params.push(ownerType);
    }

    if (ownerUniqueId && ownerUniqueId !== "all") {
      whereClauses.push("ad.ownerUniqueId = ?");
      params.push(ownerUniqueId);
    }

    if (documentTypeId && documentTypeId !== "all") {
      whereClauses.push("ad.documentTypeId = ?");
      params.push(documentTypeId);
    }

    // User-profile filters: only join Users when filtering by user attributes
    const needsUserJoin = email || phoneNumber || fullName;
    const userJoin = needsUserJoin
      ? `JOIN Users u ON ad.ownerType = 'user' AND ad.ownerUniqueId = u.userUniqueId`
      : "";

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
      ${userJoin}
      ${whereClause}
    `;
    const executor = transactionStorage.getStore() || pool;
    const [countResult] = await executor.query(countSql, params);
    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated results
    const sql = `
      SELECT ad.*, dt.*
      FROM AttachedDocuments ad
      JOIN DocumentTypes dt ON ad.documentTypeId = dt.documentTypeId
      ${userJoin}
      ${whereClause}
      ORDER BY ad.${by} ${order}
      LIMIT ? OFFSET ?
    `;
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
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Unable to retrieve documents", 500);
  }
};

module.exports = {
  getAttachedDocumentsByFilter,
  acceptRejectAttachedDocuments,
  createAttachedDocument,
  getAttachedDocumentsByOwner,
  getAttachedDocumentsByUser,      // backward-compat alias
  getAttachedDocumentByUniqueId,
  updateAttachedDocument,
  deleteAttachedDocument,
};
