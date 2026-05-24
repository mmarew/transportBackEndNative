"use strict";



const {
  deleteFromFTP,
  
} = require("../../Utils/FTPHandler");

const deleteData = require("../../CRUD/Delete/DeleteData");


const logger = require("../../Utils/logger");


const {
  pool
} = require("../../Middleware/Database.config");





// Delete an attached document (soft delete by marking as deleted)
const deleteAttachedDocument = async attachedDocumentUniqueId => {
  // get attached document first
  const attachedDocument = await getAttachedDocumentByUniqueId(attachedDocumentUniqueId);
  const attachedDocumentName = attachedDocument?.attachedDocumentName;
  if (attachedDocumentName) {
    deleteFromFTP(attachedDocumentName).catch(err => {
      logger.warn("deleteAttachedDocument: failed to delete file", {
        attachedDocumentUniqueId,
        error: err?.message
      });
    });
  }
  await deleteData({
    conditions: {
      attachedDocumentUniqueId
    }
  });
  return {
    message: "success",
    data: "Document deleted successfully"
  };
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

module.exports = {
  deleteAttachedDocument
};
