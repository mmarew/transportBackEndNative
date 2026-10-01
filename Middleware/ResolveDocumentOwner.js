/**
 * ResolveDocumentOwner.js
 *
 * Middleware factory that resolves the owner context of an attached document
 * straight from the database, so authorizeDocumentAccess() can apply the
 * correct ownership rules no matter which route the request arrived on.
 *
 * Why this exists:
 *   Mutation routes are addressed by document id only
 *   (/api/user/attachedDocuments/:attachedDocumentUniqueId), so the route
 *   cannot know whether the document belongs to a user, a company or a vehicle.
 *   Reading the ownerType/ownerUniqueId pair from the row removes that guesswork
 *   and lets the single authorization middleware own every rule.
 *
 * Populates:
 *   req.ownerType        → 'user' | 'company' | 'vehicle'
 *   req.ownerUniqueIdParam → the resolved owner id (used as the authorization target)
 *   req.attachedDocument → the minimal owner columns of the document row
 *
 * Usage:
 *   router.delete(
 *     ATTACHED_DOCUMENTS_ENDPOINTS.USER_DELETE_DOCUMENT,
 *     verifyTokenOfAxios,
 *     validator(attachedDocumentParams, "params"),
 *     resolveDocumentOwner(),
 *     authorizeDocumentAccess(),
 *     controller.deleteAttachedDocument,
 *   );
 */

const { pool } = require("./Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const AppError = require("../Utils/AppError");

const resolveDocumentOwner = () => {
  return async (req, _res, next) => {
    try {
      const attachedDocumentUniqueId = req.params?.attachedDocumentUniqueId;

      if (!attachedDocumentUniqueId) {
        throw new AppError(
          "attachedDocumentUniqueId is required",
          AppError.BAD_REQUEST,
        );
      }

      const executor = transactionStorage.getStore() || pool;

      const [rows] = await executor.query(
        `SELECT attachedDocumentUniqueId, ownerType, ownerUniqueId
         FROM AttachedDocuments
         WHERE attachedDocumentUniqueId = ?
         LIMIT 1`,
        [attachedDocumentUniqueId],
      );

      if (!rows.length) {
        throw new AppError("Document not found", AppError.NOT_FOUND);
      }

      const document = rows[0];

      req.attachedDocument = document;
      // Fall back to 'user' so documents written before ownerType existed are
      // treated as self-owned (and therefore only reachable by their owner).
      req.ownerType = document.ownerType ?? "user";
      req.ownerUniqueIdParam = document.ownerUniqueId;

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = { resolveDocumentOwner };