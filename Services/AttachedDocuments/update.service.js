"use strict";


const {
  getData,
  
} = require("../../CRUD/Read/ReadData");
const {
  deleteFromFTP,
  
} = require("../../Utils/FTPHandler");
const {
  updateData
} = require("../../CRUD/Update/Data.update");

const {
  sendSocketIONotificationToAdmin,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper
} = require("../../Utils/Notifications");

const logger = require("../../Utils/logger");
const {
  usersRoles
} = require("../../Utils/ListOfSeedData");
const {
  currentDate
} = require("../../Utils/CurrentDate");
const {
  pool
} = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const {
  accountStatus
} = require("../Account");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");
const messageTypes = require("../../Utils/MessageTypes");

// ── Per-target-user status recalculation queue ────────────────────────────
// Concurrent document approvals used to fire one async accountStatus per doc.
// Those reads+writes raced: a recalc that started early could read a stale
// snapshot (documents still PENDING) and overwrite the correct ACTIVE status.
// Serializing recalcs per resolved user guarantees the final recalc runs
// against the committed, final document state.
const recalcQueues = new Map();

const enqueueRecalc = (key, fn) => {
  const prev = recalcQueues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  recalcQueues.set(key, next);
  next.finally(() => {
    if (recalcQueues.get(key) === next) {
      recalcQueues.delete(key);
    }
  });
  return next;
};

// Resolve the user(s) whose account status must be recalculated after a
// document acceptance/rejection:
//  - user docs    → the owning user, with the role the document belongs to
//  - vehicle docs → the active driver(s) assigned to that vehicle (role = driver)
const resolveRecalcTargets = async ({ ownerType, ownerUniqueId, roleId, documentTypeId }) => {
  const executor = transactionStorage.getStore() || pool;
  if (ownerType === "user") {
    let resolvedRoleId = roleId;
    if (!resolvedRoleId && documentTypeId) {
      const [reqs] = await executor.query(
        `SELECT roleId FROM RoleDocumentRequirements
          WHERE documentTypeId = ? AND roleDocumentRequirementDeletedAt IS NULL
          ORDER BY roleId ASC LIMIT 1`,
        [documentTypeId]
      );
      resolvedRoleId = reqs?.[0]?.roleId ?? null;
    }
    return [{ ownerUserUniqueId: ownerUniqueId, roleId: resolvedRoleId }];
  }
  if (ownerType === "vehicle") {
    const [rows] = await executor.query(
      `SELECT driverUserUniqueId FROM VehicleDriver
        WHERE vehicleUniqueId = ?
          AND assignmentStatus = 'active'
          AND vehicleDriverDeletedAt IS NULL`,
      [ownerUniqueId]
    );
    return rows.map((row) => ({
      ownerUserUniqueId: row.driverUserUniqueId,
      roleId: usersRoles.driverRoleId
    }));
  }
  return [];
};

const updateAttachedDocument = async ({
  attachedDocumentUniqueId,
  roleId,
  updatedByUserId,
  // userUniqueId of the person triggering the update (for audit)
  documentExpirationDate,
  attachedDocumentDescription,
  attachedDocumentFileNumber,
  attachedDocumentName
}) => {
  try {
    // Fetch existing document
    const existingDocs = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        attachedDocumentUniqueId
      }
    });
    if (existingDocs.length === 0) {
      throw new AppError(`No existing document found`, AppError.NOT_FOUND);
    }
    const existingDoc = existingDocs[0];

    // ── Role requirement check ─────────────────────────────────────────────
    // For user-owned docs: check the user's own role.
    // For company/vehicle docs: check entity roles (8 or 9) instead,
    // because a company admin (roleId=7) updates docs mapped to roleId=8.
    const executor = transactionStorage.getStore() || pool;
    let documentType = null;
    if (existingDoc.ownerType === "user") {
      // Check user's own role requirement
      const [userReqs] = await executor.query(`SELECT * FROM RoleDocumentRequirements WHERE documentTypeId = ? AND roleId = ? AND roleDocumentRequirementDeletedAt IS NULL LIMIT 1`, [existingDoc.documentTypeId, roleId]);
      if (userReqs.length > 0) {
        documentType = userReqs[0];
      }

      // Fallback: check entity roles if user's own role has no requirement
      if (!documentType) {
        const [entityReqs] = await executor.query(`SELECT * FROM RoleDocumentRequirements WHERE documentTypeId = ? AND roleId IN (8, 9) AND roleDocumentRequirementDeletedAt IS NULL LIMIT 1`, [existingDoc.documentTypeId]);
        if (entityReqs.length > 0) {
          documentType = entityReqs[0];
        }
      }
    } else {
      // Company or vehicle doc — check entity role directly
      const entityRoleId = existingDoc.ownerType === "company" ? usersRoles.companyRoleId : usersRoles.vehicleRoleId;
      const [entityReqs] = await executor.query(`SELECT * FROM RoleDocumentRequirements WHERE documentTypeId = ? AND roleId = ? AND roleDocumentRequirementDeletedAt IS NULL LIMIT 1`, [existingDoc.documentTypeId, entityRoleId]);
      if (entityReqs.length > 0) {
        documentType = entityReqs[0];
      }
    }

    // Expiration date enforcement (only if requirement specifies it)
    if (documentType?.isExpirationDateRequired && !documentExpirationDate) {
      throw new AppError(`Document expiration date is required`, AppError.BAD_REQUEST);
    }

    // Reject if the supplied expiration date is already in the past
    if (documentExpirationDate) {
      const isExpired = new Date(documentExpirationDate) < new Date();
      if (isExpired) {
        throw new AppError(`Document expiration date cannot be in the past`, AppError.BAD_REQUEST);
      }
    }

    // ── Snapshot current state to history BEFORE applying any changes ──────
    const wasExpired = existingDoc.documentExpirationDate ? new Date(existingDoc.documentExpirationDate) < new Date() : false;
    await executor.query(`INSERT INTO AttachedDocumentsHistory (
        attachedDocumentId, attachedDocumentUniqueId,
        ownerType, ownerUniqueId,
        attachedDocumentDescription, documentTypeId,
        attachedDocumentFileNumber, documentExpirationDate,
        attachedDocumentAcceptance,
        attachedDocumentAcceptedRejectedByUserId, attachedDocumentAcceptedRejectedAt,
        attachedDocumentName,
        attachedDocumentCreatedByUserId, attachedDocumentUpdatedByUserId,
        attachedDocumentCreatedAt, attachedDocumentUpdatedAt,
        attachedDocumentIsExpired, attachedDocumentAcceptanceReason,
        documentVersion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [existingDoc.attachedDocumentId, existingDoc.attachedDocumentUniqueId, existingDoc.ownerType, existingDoc.ownerUniqueId, existingDoc.attachedDocumentDescription, existingDoc.documentTypeId, existingDoc.attachedDocumentFileNumber, existingDoc.documentExpirationDate, existingDoc.attachedDocumentAcceptance, existingDoc.attachedDocumentAcceptedRejectedByUserId, existingDoc.attachedDocumentAcceptedRejectedAt, existingDoc.attachedDocumentName, existingDoc.attachedDocumentCreatedByUserId, updatedByUserId,
    // who triggered this snapshot
      existingDoc.attachedDocumentCreatedAt, currentDate(),
      // snapshot taken now
      wasExpired,
      // was the old doc already expired?
      existingDoc.attachedDocumentAcceptanceReason, existingDoc.documentVersion // version at time of snapshot
    ]);

    // ── Apply the update ───────────────────────────────────────────────────
    const newUpdateData = {
      attachedDocumentAcceptance: "PENDING",
      // reset to pending on any change
      attachedDocumentDescription,
      attachedDocumentFileNumber,
      documentExpirationDate,
      documentVersion: existingDoc.documentVersion + 1,
      // increment version
      attachedDocumentAcceptedRejectedByUserId: null,
      // clear old decision
      attachedDocumentAcceptedRejectedAt: null,
      attachedDocumentAcceptanceReason: null
    };
    let oldFileUrl = null;
    if (attachedDocumentName) {
      oldFileUrl = existingDoc.attachedDocumentName;
      newUpdateData.attachedDocumentName = attachedDocumentName;
    }
    const result = await updateData({
      tableName: "AttachedDocuments",
      conditions: {
        attachedDocumentUniqueId
      },
      updateValues: newUpdateData
    });
    if (result?.affectedRows > 0) {
      // Async cleanup of the old file from FTP
      if (oldFileUrl) {
        deleteFromFTP(oldFileUrl).catch(err => {
          logger.warn("Failed to delete stale attached document from FTP", {
            oldFileUrl,
            error: err.message
          });
        });
      }
      return {
        message: "Document updated successfully",
        data: null
      };
    } else {
      throw new AppError("Failed to update document", AppError.INTERNAL_SERVER_ERROR);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error("Error updating attached document", {
      error: error.message,
      stack: error.stack
    });
    throw new AppError("An error occurred while updating the document", AppError.INTERNAL_SERVER_ERROR);
  }
};

// Delete an attached document (soft delete by marking as deleted)

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
const acceptRejectAttachedDocuments = async body => {
  const userUniqueId = body?.user?.userUniqueId; // Admin's unique ID
  const attachedDocumentUniqueId = body?.attachedDocumentUniqueId; // Unique ID of the document to update
  const action = body?.action; // Accept or Reject (from the request body)
  const adminDecisionReason = body?.reason || null; // Optional reason for acceptance or rejection
  const roleId = body?.roleId;

  // Ensure that all required fields are provided
  if (!userUniqueId || !attachedDocumentUniqueId || !action) {
    throw new AppError("Missing required fields to accept/reject document", AppError.BAD_REQUEST);
  }

  // Ensure action is either 'ACCEPTED' or 'REJECTED'
  if (action !== "ACCEPTED" && action !== "REJECTED") {
    throw new AppError("Invalid action. Must be 'ACCEPTED' or 'REJECTED'", AppError.BAD_REQUEST);
  }

  // Fetch the document to get owner info (no longer joins Users since owner may be a company)
  const attachedDocument = await getData({
    tableName: "AttachedDocuments",
    conditions: {
      attachedDocumentUniqueId
    }
  });
  if (!attachedDocument || attachedDocument.length === 0) {
    throw new AppError("Document not found", AppError.NOT_FOUND);
  }

  // Extract polymorphic owner info
  const ownerUniqueId = attachedDocument[0]?.ownerUniqueId;
  const ownerType = attachedDocument[0]?.ownerType;
  const docToSnapshot = attachedDocument[0];

  // For notifications we still need the phone number — only available for user owners
  let phoneNumber = null;
  if (ownerType === "user" && ownerUniqueId) {
    const [userRows] = await pool.query("SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1", [ownerUniqueId]);
    phoneNumber = userRows?.[0]?.phoneNumber ?? null;
  }
  if (!ownerUniqueId) {
    throw new AppError("Document owner information not found", AppError.BAD_REQUEST);
  }

  // ── Snapshot current state to history BEFORE changing acceptance status ──
  const executor = transactionStorage.getStore() || pool;
  const wasExpired = docToSnapshot.documentExpirationDate ? new Date(docToSnapshot.documentExpirationDate) < new Date() : false;
  await executor.query(`INSERT INTO AttachedDocumentsHistory (
      attachedDocumentId, attachedDocumentUniqueId,
      ownerType, ownerUniqueId,
      attachedDocumentDescription, documentTypeId,
      attachedDocumentFileNumber, documentExpirationDate,
      attachedDocumentAcceptance,
      attachedDocumentAcceptedRejectedByUserId, attachedDocumentAcceptedRejectedAt,
      attachedDocumentName,
      attachedDocumentCreatedByUserId, attachedDocumentUpdatedByUserId,
      attachedDocumentCreatedAt, attachedDocumentUpdatedAt,
      attachedDocumentIsExpired, attachedDocumentAcceptanceReason,
      documentVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [docToSnapshot.attachedDocumentId, docToSnapshot.attachedDocumentUniqueId, docToSnapshot.ownerType, docToSnapshot.ownerUniqueId, docToSnapshot.attachedDocumentDescription, docToSnapshot.documentTypeId, docToSnapshot.attachedDocumentFileNumber, docToSnapshot.documentExpirationDate, docToSnapshot.attachedDocumentAcceptance, docToSnapshot.attachedDocumentAcceptedRejectedByUserId, docToSnapshot.attachedDocumentAcceptedRejectedAt, docToSnapshot.attachedDocumentName, docToSnapshot.attachedDocumentCreatedByUserId, userUniqueId,
  // admin who triggered this snapshot
    docToSnapshot.attachedDocumentCreatedAt, currentDate(),
    // snapshot taken now
    wasExpired, docToSnapshot.attachedDocumentAcceptanceReason, docToSnapshot.documentVersion]);

  // Proceed with updating the document's acceptance status
  const updatedDocument = await updateData({
    tableName: "AttachedDocuments",
    conditions: {
      attachedDocumentUniqueId
    },
    updateValues: {
      attachedDocumentAcceptance: action,
      attachedDocumentAcceptedRejectedByUserId: userUniqueId,
      attachedDocumentAcceptedRejectedAt: currentDate(),
      attachedDocumentAcceptanceReason: adminDecisionReason
    }
  });
  if (updatedDocument.affectedRows === 0) {
    throw new AppError("Failed to update the document status", AppError.INTERNAL_SERVER_ERROR);
  }
  const message = {
    attachedDocument,
    message: `Document has been ${action.toLowerCase()}`,
    data: null
  };

  // ── Post-commit: status recalc + socket notifications ─────────────────────
  // Run AFTER the transaction closes to avoid deadlocking the connection pool.
  // accountStatus calls getUserByFilterDetailed which uses pool directly —
  // calling it inside a transaction starves the pool and causes a timeout.
  //
  // setImmediate inherits the AsyncLocalStorage context, so the committed/
  // released transaction connection would still be picked up by
  // transactionStorage.getStore(). Run the work with a cleared store so every
  // query falls back to the pool instead of the closed connection.
  if (ownerType === "user" || ownerType === "vehicle") {
    transactionStorage.run(undefined, () => {
      setImmediate(async () => {
        let targets;
        try {
          targets = await resolveRecalcTargets({
            ownerType,
            ownerUniqueId,
            roleId,
            documentTypeId: attachedDocument?.[0]?.documentTypeId
          });
        } catch (resolveError) {
          logger.error("Post-commit: failed to resolve status recalculation targets", {
            error: resolveError.message,
            ownerType,
            ownerUniqueId,
            roleId,
            action
          });
          return;
        }
        for (const target of targets) {
          await enqueueRecalc(target.ownerUserUniqueId, async () => {
            try {
              await accountStatus({
                ownerUserUniqueId: target.ownerUserUniqueId,
                body: {
                  roleId: target.roleId
                }
              });
            } catch (statusError) {
              logger.error("Post-commit: failed to update user status after document action", {
                error: statusError.message,
                ownerUserUniqueId: target.ownerUserUniqueId,
                roleId: target.roleId,
                action
              });
            }
          });
        }
        // ── Notify owner about accept/reject decision ──────────────────────
        try {
          if (ownerType === "user") {
            if (Number(roleId) === usersRoles.adminRoleId) {
              message.messageType = messageTypes?.accept_reject_driver_document;
              sendSocketIONotificationToAdmin({
                message,
                phoneNumber
              });
            }
            if (Number(roleId) === usersRoles.driverRoleId) {
              message.messageType = "acceptOrRejectDriverDocument";
              sendSocketIONotificationToDriver({
                message,
                phoneNumber
              });
            }
            if (Number(roleId) === usersRoles.shipperRoleId) {
              sendSocketIONotificationToShipper({
                message,
                phoneNumber
              });
            }
          } else if (ownerType === "vehicle") {
            // Vehicle doc: notify all active drivers assigned to this vehicle
            const [assignedDrivers] = await pool.query(
              `SELECT u.phoneNumber FROM VehicleDriver vd
               JOIN Users u ON vd.driverUserUniqueId = u.userUniqueId
               WHERE vd.vehicleUniqueId = ?
                 AND vd.assignmentStatus = 'active'
                 AND vd.vehicleDriverDeletedAt IS NULL`,
              [ownerUniqueId]
            );
            for (const driver of assignedDrivers) {
              const cleanedPhone = driver.phoneNumber?.replace(/\D/g, "");
              if (cleanedPhone && /^[0-9]{9,15}$/.test(cleanedPhone)) {
                message.messageType = "acceptOrRejectDriverDocument";
                sendSocketIONotificationToDriver({
                  message,
                  phoneNumber: cleanedPhone,
                });
              }
            }
            // Also notify admin
            message.messageType = messageTypes?.accept_reject_driver_document;
            sendSocketIONotificationToAdmin({ message });
          } else if (ownerType === "company") {
            // Company doc: notify admin
            message.messageType = messageTypes?.accept_reject_driver_document;
            sendSocketIONotificationToAdmin({ message });
          }
        } catch (notifError) {
          logger.error("Post-commit: socket notification failed", {
            error: notifError.message,
            ownerUniqueId,
            ownerType,
            roleId
          });
        }
      });
    });
  }
  return message;
};

module.exports = {
  updateAttachedDocument,
  acceptRejectAttachedDocuments
};
