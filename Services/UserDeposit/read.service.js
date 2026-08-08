"use strict";

const {
  pool
} = require("../../Middleware/Database.config");







const {
  transactionStorage
} = require("../../Utils/TransactionContext");
const { PAGINATION } = require("../../Utils/Constants");


// Create

// Removed specialized GET helpers in favor of consolidated getUserDeposit
const getUserDeposit = async (filters = {}) => {
  const {
    driverUniqueId,
    depositStatus,
    includeNullStatus,
    minAmount,
    maxAmount,
    depositAmount,
    startDate,
    endDate,
    depositSourceUniqueId,
    accountUniqueId,
    depositURL,
    depositURLMatch,
    depositURLCaseSensitive,
    userDepositUniqueId,
    userDepositId,
    createdStart,
    createdEnd,
    search,
    page = 1,
    limit = 10,
    sortBy = "depositTime",
    sortOrder = "DESC"
  } = filters;
  const whereConditions = ["dd.userDepositDeletedAt IS NULL", "dd.userDepositDeletedBy IS NULL"];
  const params = [];
  if (driverUniqueId) {
    whereConditions.push("dd.driverUniqueId = ?");
    params.push(driverUniqueId);
  }
  if (userDepositUniqueId) {
    whereConditions.push("dd.userDepositUniqueId = ?");
    params.push(userDepositUniqueId);
  }
  if (userDepositId) {
    whereConditions.push("dd.userDepositId = ?");
    params.push(Number(userDepositId));
  }
  if (depositStatus || includeNullStatus) {
    const statusArray = Array.isArray(depositStatus) ? depositStatus : String(depositStatus || "").split(",").filter(Boolean);
    const hasStatuses = statusArray.length > 0;
    if (includeNullStatus && hasStatuses) {
      const placeholders = statusArray.map(() => "?").join(",");
      whereConditions.push(`(dd.depositStatus IN (${placeholders}) OR dd.depositStatus IS NULL)`);
      params.push(...statusArray);
    } else if (includeNullStatus && !hasStatuses) {
      whereConditions.push(`dd.depositStatus IS NULL`);
    } else if (hasStatuses) {
      const placeholders = statusArray.map(() => "?").join(",");
      whereConditions.push(`dd.depositStatus IN (${placeholders})`);
      params.push(...statusArray);
    }
  }
  if (minAmount) {
    whereConditions.push("dd.depositAmount >= ?");
    params.push(parseFloat(minAmount));
  }
  if (maxAmount) {
    whereConditions.push("dd.depositAmount <= ?");
    params.push(parseFloat(maxAmount));
  }
  if (depositAmount) {
    whereConditions.push("dd.depositAmount = ?");
    params.push(parseFloat(depositAmount));
  }
  if (startDate) {
    whereConditions.push("dd.depositTime >= ?");
    params.push(startDate);
  }
  if (endDate) {
    whereConditions.push("dd.depositTime <= ?");
    params.push(endDate);
  }
  if (createdStart) {
    whereConditions.push("dd.userDepositCreatedAt >= ?");
    params.push(createdStart);
  }
  if (createdEnd) {
    whereConditions.push("dd.userDepositCreatedAt <= ?");
    params.push(createdEnd);
  }
  if (depositSourceUniqueId) {
    whereConditions.push("dd.depositSourceUniqueId = ?");
    params.push(depositSourceUniqueId);
  }
  if (accountUniqueId) {
    whereConditions.push("dd.accountUniqueId = ?");
    params.push(accountUniqueId);
  }
  if (depositURL) {
    const mode = String(depositURLMatch || "contains").toLowerCase();
    const caseSensitive = depositURLCaseSensitive === true || String(depositURLCaseSensitive).toLowerCase() === "true";
    let pattern = `%${depositURL}%`;
    if (mode === "exact") {
      pattern = `${depositURL}`;
    }
    if (mode === "startswith") {
      pattern = `${depositURL}%`;
    }
    if (mode === "endswith") {
      pattern = `%${depositURL}`;
    }
    if (mode === "exact") {
      whereConditions.push(caseSensitive ? "dd.depositURL COLLATE utf8mb4_bin = ?" : "dd.depositURL = ?");
    } else {
      whereConditions.push(caseSensitive ? "dd.depositURL COLLATE utf8mb4_bin LIKE ?" : "dd.depositURL LIKE ?");
    }
    params.push(pattern);
  }
  if (search) {
    const searchTerm = `%${search}%`;
    whereConditions.push(`
      (u.phoneNumber LIKE ? OR u.email LIKE ? OR u.fullName LIKE ?)
    `);
    params.push(searchTerm, searchTerm, searchTerm);
  }
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Math.min(Number(limit) || PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE));
  const offset = (numPage - 1) * numLimit;
  const sortableMap = {
    depositTime: "dd.depositTime",
    depositAmount: "dd.depositAmount",
    depositStatus: "dd.depositStatus",
    acceptRejectReason: "dd.acceptRejectReason",
    createdAt: "dd.userDepositCreatedAt",
    userDepositId: "dd.userDepositId",
    userDepositUniqueId: "dd.userDepositUniqueId",
    fullName: "u.fullName",
    phoneNumber: "u.phoneNumber",
    email: "u.email"
  };
  const safeSortBy = sortableMap[sortBy] || sortableMap["depositTime"];
  const safeSortOrder = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const sql = `
    SELECT 
      dd.*, 
      u.fullName,
      u.phoneNumber,
      u.email,
      ds.sourceLabel as depositSourceLabel,
      fia.institutionName,
      fia.accountNumber
    FROM UserDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    LEFT JOIN DepositSource ds ON dd.depositSourceUniqueId = ds.depositSourceUniqueId
    LEFT JOIN FinancialInstitutionAccounts fia ON dd.accountUniqueId = fia.accountUniqueId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total 
    FROM UserDeposit dd
    LEFT JOIN Users u ON dd.driverUniqueId = u.userUniqueId
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || pool;
  const [data] = await executor.query(sql, [...params, Number(numLimit), Number(offset)]);
  const [countResult] = await executor.query(countSql, params);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / numLimit);
  return {
    message: "Deposits fetched successfully",
    data,
    pagination: {
      currentPage: Number(numPage),
      totalPages,
      totalItems: total,
      limit: Number(numLimit),
    },
    filters: {
      search: search || null,
      driverUniqueId: driverUniqueId || null,
      depositStatus: depositStatus || null
    }
  };
};
// Removed extra getters (with account info, by ID, etc.) to keep a single GET service

/**
 * Dynamically updates only the fields provided in the data object.
 * Excludes userDepositUniqueId and userDepositId from updates.
 * If depositStatus is being changed to 'approved', adds balance to user account.
 * @param {string} userDepositUniqueId - The unique ID of the deposit to update
 * @param {Object} data - Key-value pairs of columns to update
 * @returns {Object} Success or error message
 */

module.exports = {
  getUserDeposit
};
