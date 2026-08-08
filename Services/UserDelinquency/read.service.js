"use strict";

const { pool } = require("../../Middleware/Database.config");

const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");

const getUserDelinquencies = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userUniqueId,
    userDelinquencyUniqueId,
    delinquencyTypeUniqueId,
    delinquencySeverity,
    roleId,
    journeyDecisionUniqueId,
    // Added this filter
    startDate,
    endDate,
    sortBy: userSortBy = "delinquencyCreatedAt",
    sortOrder: userSortOrder = "DESC",
    summary = false,
    stat = false,
  } = filters;

  // Whitelist sortable columns and order to prevent SQL injection
  const allowedSortBy = [
    "delinquencyCreatedAt",
    "delinquencyPoints",
    "delinquencySeverity",
    "fullName",
    "roleName",
    "delinquencyTypeName",
    "delinquencyDescription",
  ];
  const sortBy = allowedSortBy.includes(userSortBy)
    ? userSortBy
    : "delinquencyCreatedAt";
  const sortOrder = ["ASC", "DESC"].includes(userSortOrder.toUpperCase())
    ? userSortOrder.toUpperCase()
    : "DESC";
  let whereConditions = ["1 = 1"];
  let queryParams = [];
  if (userUniqueId) {
    whereConditions.push("ud.userUniqueId = ?");
    queryParams.push(userUniqueId);
  }
  if (userDelinquencyUniqueId) {
    whereConditions.push("ud.userDelinquencyUniqueId = ?");
    queryParams.push(userDelinquencyUniqueId);
  }
  if (delinquencyTypeUniqueId) {
    whereConditions.push("ud.delinquencyTypeUniqueId = ?");
    queryParams.push(delinquencyTypeUniqueId);
  }
  if (delinquencySeverity) {
    whereConditions.push("ud.delinquencySeverity = ?");
    queryParams.push(delinquencySeverity);
  }
  if (roleId) {
    whereConditions.push("ud.roleId = ?");
    queryParams.push(roleId);
  }
  // Add journeyDecisionUniqueId filter
  if (journeyDecisionUniqueId !== undefined) {
    if (journeyDecisionUniqueId === null || journeyDecisionUniqueId === "") {
      whereConditions.push(
        "(ud.journeyDecisionUniqueId IS NULL OR ud.journeyDecisionUniqueId = '')",
      );
    } else {
      whereConditions.push("ud.journeyDecisionUniqueId = ?");
      queryParams.push(journeyDecisionUniqueId);
    }
  }
  if (startDate) {
    whereConditions.push("ud.delinquencyCreatedAt >= ?");
    queryParams.push(startDate);
  }
  if (endDate) {
    whereConditions.push("ud.delinquencyCreatedAt <= ?");
    queryParams.push(endDate);
  }
  const joins = `
    FROM UserDelinquency ud
    INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ud.roleId = r.roleId
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    LEFT JOIN Users uc ON ud.delinquencyCreatedBy = uc.userUniqueId
  `;
  const whereClause = whereConditions.join(" AND ");
  if (stat) {
    const countQuery = `SELECT COUNT(*) as total ${joins} WHERE ${whereClause}`;
    const [countResult] = await (transactionStorage.getStore() || pool).query(
      countQuery,
      queryParams,
    );
    return {
      message: "User delinquencies list fetched",
      data: {
        totalUserDelinquencies: countResult[0].total,
      },
    };
  }
  if (summary) {
    if (!userUniqueId || !roleId) {
      throw new AppError(
        "userUniqueId and roleId are required for summary",
        AppError.BAD_REQUEST,
      );
    }
    return await _getUserDelinquencySummary(userUniqueId, roleId);
  }
  const offset = (page - 1) * limit;
  const dataQuery = `
    SELECT 
      ud.userDelinquencyUniqueId,
      ud.userUniqueId,
      ud.roleId,
      ud.delinquencyTypeUniqueId,
      ud.delinquencyDescription,
      ud.delinquencySeverity,
      ud.delinquencyPoints,
      ud.delinquencyCreatedAt,
      ud.delinquencyCreatedBy,
      ud.journeyDecisionUniqueId,
      ud.isDelinquencySeenByAdmin,
      u.fullName,
      u.email,
      r.roleName,
      dt.delinquencyTypeName,
      dt.delinquencyTypeDescription AS typeDescription,
      uc.fullName AS createdByName
    ${joins}
    WHERE ${whereClause}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;
  const dataQueryParams = [...queryParams, parseInt(limit), offset];

  // If limit is not provided (for duplicate check), don't add limit/offset
  if (limit === undefined) {
    const [results] = await (transactionStorage.getStore() || pool).query(
      dataQuery.replace(/LIMIT \? OFFSET \?/, ""),
      queryParams,
    );
    return {
      message: "User delinquencies list fetched",
      data: results,
    };
  } else {
    const [results] = await (transactionStorage.getStore() || pool).query(
      dataQuery,
      dataQueryParams,
    );
    const countQuery = `SELECT COUNT(*) as total ${joins} WHERE ${whereClause}`;
    const [countResult] = await (transactionStorage.getStore() || pool).query(
      countQuery,
      queryParams,
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);
    return {
      message: "User delinquencies list fetched",
      data: results,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        limit: parseInt(limit),
      },
      filters,
    };
  }
};

const _getUserDelinquencySummary = async (userUniqueId, roleId) => {
  const summaryQuery = `
    SELECT 
      ud.userUniqueId,
      ud.roleId,
      u.fullName as userName,
      r.roleName,
      COUNT(ud.userDelinquencyId) as totalDelinquencies,
      SUM(ud.delinquencyPoints) as totalPoints,
      MAX(ud.delinquencyCreatedAt) as latestDelinquency
    FROM UserDelinquency ud
    INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ud.roleId = r.roleId
    WHERE ud.userUniqueId = ? AND ud.roleId = ?
    GROUP BY ud.userUniqueId, ud.roleId, u.fullName, r.roleName
  `;
  const [summary] = await (transactionStorage.getStore() || pool).query(
    summaryQuery,
    [userUniqueId, roleId],
  );

  // Get recent delinquencies
  const recentQuery = `
    SELECT ud.*, dt.delinquencyTypeName
    FROM UserDelinquency ud
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE ud.userUniqueId = ? AND ud.roleId = ?
    ORDER BY ud.userDelinquencyId DESC 
    LIMIT 5
  `;
  const [recentDelinquencies] = await (
    transactionStorage.getStore() || pool
  ).query(recentQuery, [userUniqueId, roleId]);

  // Check if banned for this user-role combination
  const banQuery = `
    SELECT * FROM BannedUsers 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND isActive = TRUE
  `;
  const [banStatus] = await (transactionStorage.getStore() || pool).query(
    banQuery,
    [userUniqueId, roleId],
  );
  return {
    message: "User delinquencies list fetched",
    data: {
      summary: summary[0] || {
        userUniqueId,
        roleId,
        userName: "",
        roleName: "",
        totalDelinquencies: 0,
        totalPoints: 0,
        latestDelinquency: null,
      },
      recentDelinquencies,
      isBanned: banStatus.length > 0,
      banInfo: banStatus[0] || null,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get pending user delinquencies (no admin decision yet)
// ─────────────────────────────────────────────────────────────────────────────
const getPendingUserDelinquencies = async (filters = {}) => {
  const { userUniqueId, roleId, page = 1, limit = 10 } = filters;
  if (!userUniqueId || !roleId) {
    throw new AppError("userUniqueId and roleId are required", AppError.BAD_REQUEST);
  }
  const offset = (page - 1) * limit;
  const whereClause = `
    ud.userUniqueId = ? AND ud.roleId = ?
    AND ud.delinquencyDeletedAt IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM AdminDecisionOnUserDelinquency ad
      WHERE ad.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
        AND ad.adminDecisionOnUserDelinquencyDeletedAt IS NULL
    )
  `;
  const [[{ total }]] = await (transactionStorage.getStore() || pool).query(
    `SELECT COUNT(*) AS total FROM UserDelinquency ud WHERE ${whereClause}`,
    [userUniqueId, roleId],
  );
  const [rows] = await (transactionStorage.getStore() || pool).query(
    `SELECT
       ud.userDelinquencyUniqueId,
       ud.delinquencyDescription,
       ud.delinquencySeverity,
       ud.delinquencyPoints,
       ud.delinquencyCreatedAt,
       ud.responseDeadline,
       CASE WHEN ud.responseDeadline < NOW() THEN TRUE ELSE FALSE END AS isOverdue,
       dt.delinquencyTypeName,
       dt.delinquencyTypeDescription,
       u.fullName AS accusedByName,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM UserDelinquencyResponse udr
           WHERE udr.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
             AND udr.userDelinquencyResponseDeletedAt IS NULL
         ) THEN 'RESPONDED'
         ELSE 'AWAITING_RESPONSE'
       END AS responseStatus
     FROM UserDelinquency ud
     INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
     LEFT JOIN Users u ON ud.delinquencyCreatedBy = u.userUniqueId
     WHERE ${whereClause}
     ORDER BY ud.userDelinquencyId DESC
     LIMIT ? OFFSET ?`,
    [userUniqueId, roleId, parseInt(limit), offset],
  );
  return {
    message: "User delinquencies list fetched",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit: parseInt(limit),
    },
  };
};

module.exports = {
  getUserDelinquencies,
  _getUserDelinquencySummary,
  getPendingUserDelinquencies,
};
