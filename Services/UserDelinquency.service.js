const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

const createUserDelinquency = async (data) => {
  const {
    userRoleUniqueId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencySeverity,
    delinquencyPoints,
    delinquencyCreatedBy,
  } = data;
  // const   userRoleUniqueId  "userRoleUniqueId": "31a23043-a3cf-413e-9df3-3955c7c48a0b",

  const userDelinquencyUniqueId = uuidv4();

  // Get default values from delinquency type if not provided
  const typeQuery = `
    SELECT defaultPoints, defaultSeverity 
    FROM DelinquencyTypes 
    WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE
  `;
  const [typeResult] = await pool.query(typeQuery, [delinquencyTypeUniqueId]);

  if (typeResult.length === 0) {
    return { message: "error", error: "Invalid delinquency type" };
  }

  const defaultType = typeResult[0];

  const sql = `
    INSERT INTO UserDelinquency (
      userDelinquencyUniqueId, userRoleUniqueId, delinquencyTypeUniqueId, 
      delinquencyDescription, delinquencySeverity, delinquencyPoints, delinquencyCreatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    userDelinquencyUniqueId,
    userRoleUniqueId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencySeverity || defaultType.defaultSeverity,
    delinquencyPoints || defaultType.defaultPoints,
    delinquencyCreatedBy,
  ];

  await query(sql, values);

  // Check for automatic ban
  const banResult = await checkAndApplyAutomaticBan(
    userRoleUniqueId,
    userDelinquencyUniqueId
  );

  return {
    message: "success",
    data: "User delinquency record created successfully",
    userDelinquencyUniqueId,
    automaticAction: banResult,
  };
};

const checkAndApplyAutomaticBan = async (
  userRoleUniqueId,
  triggeringDelinquencyId
) => {
  // Calculate total points for this user-role (last 30 days)
  const pointsQuery = `
    SELECT SUM(delinquencyPoints) as totalPoints 
    FROM UserDelinquency 
    WHERE userRoleUniqueId = ? 
    AND delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  `;
  const [pointsResult] = await pool.query(pointsQuery, [userRoleUniqueId]);
  const totalPoints = pointsResult[0].totalPoints || 0;

  // Get user role info
  const userRoleQuery = `
    SELECT ur.*, r.roleName 
    FROM UserRole ur 
    INNER JOIN Roles r ON ur.roleId = r.roleId 
    WHERE ur.userRoleUniqueId = ?
  `;
  const [userRoleInfo] = await pool.query(userRoleQuery, [userRoleUniqueId]);

  if (userRoleInfo.length === 0)
    return { action: "none", reason: "User role not found" };

  // Define ban rules based on points (you can make this configurable)
  const banRules = [
    { threshold: 50, duration: 30, severity: "CRITICAL" },
    { threshold: 35, duration: 7, severity: "HIGH" },
    { threshold: 20, duration: 3, severity: "MEDIUM" },
    { threshold: 10, duration: 1, severity: "LOW" },
  ];

  const applicableRule = banRules.find((rule) => totalPoints >= rule.threshold);

  if (!applicableRule) {
    return { action: "none", reason: "No ban threshold met", totalPoints };
  }

  // Check if already banned
  const activeBanQuery = `
    SELECT * FROM BannedUsers 
    WHERE userRoleUniqueId = ? AND isActive = TRUE
  `;
  const [activeBans] = await pool.query(activeBanQuery, [userRoleUniqueId]);

  if (activeBans.length > 0) {
    return { action: "none", reason: "User role already banned", totalPoints };
  }

  // Apply automatic ban
  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + applicableRule.duration * 24 * 60 * 60 * 1000
  );

  const banSql = `
    INSERT INTO BannedUsers (
      banUniqueId, userRoleUniqueId, userDelinquencyUniqueId,
      bannedBy, banReason, banDurationDays, banExpiresAt
    ) VALUES (?, ?, ?, 'system', ?, ?, ?)
  `;

  const banValues = [
    banUniqueId,
    userRoleUniqueId,
    triggeringDelinquencyId,
    `Automatic ban: ${totalPoints} points reached ${applicableRule.severity} threshold`,
    applicableRule.duration,
    banExpiresAt,
  ];

  await query(banSql, banValues);

  return {
    action: "banned",
    banDuration: applicableRule.duration,
    totalPoints,
    severityLevel: applicableRule.severity,
    banExpiresAt,
    banUniqueId,
  };
};

const getUserDelinquencies = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userRoleUniqueId,
    userDelinquencyUniqueId,
    delinquencyTypeUniqueId,
    delinquencySeverity,
    startDate,
    endDate,
    sortBy = "delinquencyCreatedAt",
    sortOrder = "DESC",
    summary = false,
  } = filters;

  if (summary) {
    if (!userRoleUniqueId) {
      return {
        message: "error",
        error: "userRoleUniqueId is required for summary",
      };
    }
    return await _getUserDelinquencySummary(userRoleUniqueId);
  }

  const offset = (page - 1) * limit;

  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (userRoleUniqueId) {
    whereConditions.push("ud.userRoleUniqueId = ?");
    queryParams.push(userRoleUniqueId);
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

  if (startDate) {
    whereConditions.push("ud.delinquencyCreatedAt >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("ud.delinquencyCreatedAt <= ?");
    queryParams.push(endDate);
  }

  const baseQuery = `
    SELECT 
      ud.*,
      u.fullName AS fullName,
      u.email AS email,
      r.roleName,
      dt.delinquencyTypeName,
      dt.delinquencyTypeDescription,
      uc.fullName AS createdByName
    FROM UserDelinquency ud
    INNER JOIN UserRole ur ON ud.userRoleUniqueId = ur.userRoleUniqueId
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    LEFT JOIN Users uc ON ud.delinquencyCreatedBy = uc.userUniqueId
    WHERE ${whereConditions.join(" AND ")}
  `;

  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;
  const dataQuery = `
    ${baseQuery}
    ORDER BY ud.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
    LIMIT ? OFFSET ?
  `;

  const dataQueryParams = [...queryParams, parseInt(limit), offset];

  const [countResult] = await pool.query(countQuery, queryParams);
  const [results] = await pool.query(dataQuery, dataQueryParams);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  return {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    filters,
  };
};

const deleteUserDelinquency = async (userDelinquencyUniqueId) => {
  // Check if this delinquency is linked to any banned users
  const checkSql =
    "SELECT COUNT(*) as count FROM BannedUsers WHERE userDelinquencyUniqueId = ?";
  const [checkResult] = await pool.query(checkSql, [userDelinquencyUniqueId]);

  if (checkResult[0].count > 0) {
    return {
      message: "error",
      error: "Cannot delete delinquency record as it is linked to banned users",
    };
  }

  const sql = "DELETE FROM UserDelinquency WHERE userDelinquencyUniqueId = ?";
  const result = await query(sql, [userDelinquencyUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: "User delinquency record deleted successfully",
      }
    : { message: "error", error: "Failed to delete user delinquency record" };
};

const _getUserDelinquencySummary = async (userRoleUniqueId) => {
  const summaryQuery = `
    SELECT 
      ur.userRoleUniqueId,
      u.fullName as userName,
      r.roleName,
      COUNT(ud.userDelinquencyId) as totalDelinquencies,
      SUM(ud.delinquencyPoints) as totalPoints,
      MAX(ud.delinquencyCreatedAt) as latestDelinquency
    FROM UserRole ur
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN UserDelinquency ud ON ur.userRoleUniqueId = ud.userRoleUniqueId
    WHERE ur.userRoleUniqueId = ?
    GROUP BY ur.userRoleUniqueId, u.fullName, r.roleName
  `;

  const [summary] = await pool.query(summaryQuery, [userRoleUniqueId]);

  // Get recent delinquencies
  const recentQuery = `
    SELECT ud.*, dt.delinquencyTypeName
    FROM UserDelinquency ud
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE ud.userRoleUniqueId = ? 
    ORDER BY ud.delinquencyCreatedAt DESC 
    LIMIT 5
  `;
  const [recentDelinquencies] = await pool.query(recentQuery, [
    userRoleUniqueId,
  ]);

  // Check if banned
  const banQuery = `
    SELECT * FROM BannedUsers 
    WHERE userRoleUniqueId = ? AND isActive = TRUE
  `;
  const [banStatus] = await pool.query(banQuery, [userRoleUniqueId]);

  return {
    message: "success",
    data: {
      summary: summary[0] || {},
      recentDelinquencies,
      isBanned: banStatus.length > 0,
      banInfo: banStatus[0] || null,
    },
  };
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  // updateUserDelinquency,
  deleteUserDelinquency,
  // checkAutomaticBan,
};
