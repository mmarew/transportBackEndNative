"use strict";

const {
  insertData
} = require("../../CRUD/Create/CreateData");
const {
  getData,
  
} = require("../../CRUD/Read/ReadData");
const { v4: uuidv4 } = require("uuid");



const logger = require("../../Utils/logger");

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


const createAttachedDocument = async ({
  attachedDocumentDescription,
  attachedDocumentName,
  // URL from FTP upload
  documentTypeId,
  documentExpirationDate,
  attachedDocumentFileNumber,
  roleId,
  // Polymorphic owner fields
  ownerType = "user",
  // 'user' | 'company' | 'vehicle'
  ownerUniqueId,
  // UUID of the owning entity
  uploadedByUserId // userUniqueId of the person who pressed upload (audit)
}) => {
  try {
    // Validate roleId / documentType link — only for user-owned documents.
    // Company and vehicle docs are NOT tied to RoleDocumentRequirements.
    if (ownerType === "user" && roleId) {
      /**
       * Role mapping context:
       *  - roleId=7 (company_admin) is the HUMAN who logs in and manages the company.
       *  - roleId=8 (company entity) holds the company-level document requirements
       *    (Company Logo, TIN, Business License, etc.).
       *
       * When a company admin uploads a company logo via /attachDocuments/self,
       * their JWT roleId is 7, but the document type (11) is mapped to roleId=8.
       *
       * Strict enforcement ("block if not in role's requirements") is only correct
       * for pure user documents (e.g. driver's license for drivers).
       * For entity documents uploaded by admins, we should NOT block — just
       * conditionally enforce expiration date if the requirement defines it.
       *
       * Strategy:
       *   1. Try to find the requirement for this (documentTypeId + roleId) pair.
       *   2. If found → enforce expiration date if required.
       *   3. If NOT found → also search entity roles (company=8, vehicle=9).
       *      If found there → enforce expiration date if required.
       *   4. If not found anywhere → still allow the upload (documentType existence
       *      is sufficient — strict blocking causes more harm than good here).
       */
      const executor = transactionStorage.getStore() || pool;

      // Try to find requirement for the user's own role first
      let requirement = null;
      const [userRoleReqs] = await executor.query(`SELECT * FROM RoleDocumentRequirements WHERE documentTypeId = ? AND roleId = ? AND roleDocumentRequirementDeletedAt IS NULL LIMIT 1`, [documentTypeId, roleId]);
      if (userRoleReqs.length > 0) {
        requirement = userRoleReqs[0];
      }

      // Not found for user role → check entity roles (company=8, vehicle=9)
      if (!requirement) {
        const [entityReqs] = await executor.query(`SELECT * FROM RoleDocumentRequirements WHERE documentTypeId = ? AND roleId IN (8, 9) AND roleDocumentRequirementDeletedAt IS NULL LIMIT 1`, [documentTypeId]);
        if (entityReqs.length > 0) {
          requirement = entityReqs[0];
        }
      }

      // Enforce expiration date only when a requirement explicitly demands it
      if (requirement && requirement.isExpirationDateRequired && !documentExpirationDate) {
        throw new AppError(`Document expiration date is required`, 400);
      }
      // No matching requirement anywhere → still allow upload (valid documentTypeId is enough)
    }

    // Duplicate check: same owner + same document type
    const existingDocument = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        ownerType,
        ownerUniqueId,
        documentTypeId
      }
    });
    if (existingDocument.length > 0) {
      throw new AppError(`Document already exists for this ${ownerType} and document type`, 409);
    }

    // Expiry check
    const isExpired = documentExpirationDate ? new Date(documentExpirationDate) < new Date(currentDate()) : false;
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
      attachedDocumentCreatedAt: currentDate()
    };
    const result = await insertData({
      tableName: "AttachedDocuments",
      colAndVal: newDocument
    });
    if (result?.affectedRows > 0) {
      // Only trigger accountStatus for user-owned docs
      if (ownerType === "user" && roleId) {
        try {
          await accountStatus({
            ownerUserUniqueId: ownerUniqueId,
            body: {
              roleId
            }
          });
        } catch (statusError) {
          logger.error("Failed to update user status after document attachment", {
            error: statusError.message,
            ownerUniqueId,
            roleId
          });
        }
      }
      return {
        message: "success",
        data: "Document created successfully"
      };
    } else {
      throw new AppError("Failed to create document", 500);
    }
  } catch (error) {
    logger.error("Error creating attached document", {
      error: error.message,
      stack: error.stack
    });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("An error occurred while creating the document", 500);
  }
};

/**
 * Retrieve all documents belonging to an owner (user, company, or vehicle).
 * @param {string} ownerUniqueId
 * @param {'user'|'company'|'vehicle'} [ownerType='user']
 */

module.exports = {
  createAttachedDocument
};
