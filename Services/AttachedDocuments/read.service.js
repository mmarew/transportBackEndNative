"use strict";


const {
  getData,
  performJoinSelect
} = require("../../CRUD/Read/ReadData");
const {
  
  resolveDocumentUrl
} = require("../../Utils/FTPHandler");







const {
  pool
} = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");


/**
 * Retrieve all documents belonging to an owner (user, company, or vehicle).
 * @param {string} ownerUniqueId
 * @param {'user'|'company'|'vehicle'} [ownerType='user']
 */
const getAttachedDocumentsByOwner = async (ownerUniqueId, ownerType = "user") => {
  const documents = await performJoinSelect({
    baseTable: "AttachedDocuments",
    joins: [{
      table: "DocumentTypes",
      on: "AttachedDocuments.documentTypeId = DocumentTypes.documentTypeId"
    }],
    conditions: {
      ownerType,
      ownerUniqueId
    }
  });
  // Resolve document URLs to current domain
  for (const doc of documents) {
    doc.attachedDocumentName = resolveDocumentUrl(doc.attachedDocumentName);
  }
  return {
    message: "Documents fetched successfully",
    data: documents
  };
};

// Keep backward-compat alias — callers passing a userUniqueId still work

// Keep backward-compat alias — callers passing a userUniqueId still work
const getAttachedDocumentsByUser = userUniqueId => getAttachedDocumentsByOwner(userUniqueId, "user");

// Retrieve an attached document by ID

// Retrieve an attached document by ID
const getAttachedDocumentByUniqueId = async attachedDocumentUniqueId => {
  const result = await getData({
    tableName: "AttachedDocuments",
    conditions: {
      attachedDocumentUniqueId
    }
  });
  if (result.length === 0) {
    return null;
  }
  const doc = result[0];
  doc.attachedDocumentName = resolveDocumentUrl(doc.attachedDocumentName);
  return doc;
};

const getAttachedDocumentsByFilter = async ({
  filter,
  pagination,
  sort
}) => {
  try {
    const {
      attachedDocumentUniqueId,
      ownerType,
      ownerUniqueId,
      documentTypeId,
      // User-specific filters (only apply when ownerType='user')
      email,
      phoneNumber,
      fullName
    } = filter;
    const {
      page = 1,
      limit = 10,
      offset = 0
    } = pagination || {};
    const {
      by = "attachedDocumentCreatedAt",
      order = "DESC"
    } = sort || {};

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
      const doc = document[0];
      doc.attachedDocumentName = resolveDocumentUrl(doc.attachedDocumentName);
      return {
        message: "Document fetched successfully",
        data: doc
      };
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
    const userJoin = needsUserJoin ? `JOIN Users u ON ad.ownerType = 'user' AND ad.ownerUniqueId = u.userUniqueId` : "";
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
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

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

    // Resolve document URLs to current domain
    for (const doc of documents) {
      doc.attachedDocumentName = resolveDocumentUrl(doc.attachedDocumentName);
    }
    return {
      message: "Documents fetched successfully",
      data: documents,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        limit,
      }
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Unable to retrieve documents", 500);
  }
};

/**
 * getDocumentHistory
 * Returns the full snapshot history for all documents owned by an entity
 * (user / company / vehicle), newest snapshot first.
 *
 * Optional: filter to a single document by attachedDocumentUniqueId.
 */

/**
 * getDocumentHistory
 * Returns the full snapshot history for all documents owned by an entity
 * (user / company / vehicle), newest snapshot first.
 *
 * Optional: filter to a single document by attachedDocumentUniqueId.
 */
const getDocumentHistory = async ({
  ownerType,
  ownerUniqueId,
  attachedDocumentUniqueId = null,
  // optional: narrow to one document
  pagination = {},
  sort = {}
}) => {
  try {
    const {
      page = 1,
      limit = 10,
      offset = 0
    } = pagination;
    const {
      by = "attachedDocumentUpdatedAt",
      order = "DESC"
    } = sort;

    // Whitelist sort columns to prevent SQL injection
    const allowedSortCols = ["attachedDocumentUpdatedAt", "attachedDocumentCreatedAt", "documentVersion", "attachedDocumentAcceptance"];
    const safeBy = allowedSortCols.includes(by) ? by : "attachedDocumentUpdatedAt";
    const safeOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const params = [ownerType, ownerUniqueId];
    let whereExtra = "";
    if (attachedDocumentUniqueId) {
      whereExtra = " AND h.attachedDocumentUniqueId = ?";
      params.push(attachedDocumentUniqueId);
    }

    // Count total rows for pagination
    const [[{
      total
    }]] = await pool.query(`SELECT COUNT(*) AS total FROM AttachedDocumentsHistory h
       WHERE h.ownerType = ? AND h.ownerUniqueId = ?${whereExtra}`, params);
    const totalCount = Number(total);
    const totalPages = Math.ceil(totalCount / limit) || 0;

    // Fetch history rows joined with DocumentTypes for context
    const [history] = await pool.query(`SELECT
          h.*,
          dt.documentTypeName,
          dt.documentTypeDescription
       FROM AttachedDocumentsHistory h
       LEFT JOIN DocumentTypes dt ON dt.documentTypeId = h.documentTypeId
       WHERE h.ownerType = ? AND h.ownerUniqueId = ?${whereExtra}
       ORDER BY h.${safeBy} ${safeOrder}
       LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
    return {
      message: "Document history fetched successfully",
      data: history,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: totalCount,
        limit: Number(limit),
      }
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Unable to retrieve document history", 500);
  }
};

module.exports = {
  getAttachedDocumentsByOwner,
  getAttachedDocumentsByUser,
  getAttachedDocumentByUniqueId,
  getAttachedDocumentsByFilter,
  getDocumentHistory
};
