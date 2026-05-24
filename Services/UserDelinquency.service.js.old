const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const logger = require("../Utils/logger");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const query = async (sql, values = []) => {
  const [result] = await (transactionStorage.getStore() || pool).query(
    sql,
    values,
  );
  return result;
};
const createUserDelinquency = async (data) => {
  /**
   * createUserDelinquency
   * 1) Destructure request payload (user IDs, type IDs, description, severity/points overrides, creator, journey link, role, duplicate-skip flag).
   * 2) Generate userDelinquencyUniqueId for this record.
   * 3) Load delinquency type (must be active) to fetch defaults (severity/points, duplicate window, etc.). Return error if invalid.
   * 4) Unless skipDuplicateCheck=true, build duplicateFilters with ids/role and a 24h (or type-configured) window using currentDate() for time-zone consistency. Optionally scope by journeyDecisionUniqueId. Query existing delinquencies; if found, return a duplicate error with time-ago info.
   * 5) Build INSERT columns/placeholders/values, applying defaults when overrides are absent, and include journeyDecisionUniqueId if provided.
   * 6) Execute insert; then call checkAndApplyAutomaticBan to enforce point-based bans. Return success with record id and any automatic action.
   * 7) On errors: log; if MySQL duplicate key, fetch the existing record for context; otherwise return generic failure with details.
   */
  const {
    userUniqueId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencySeverity,
    delinquencyPoints,
    delinquencyCreatedBy,
    journeyDecisionUniqueId,
    roleId,
    skipDuplicateCheck = false,
  } = data;

  const userDelinquencyUniqueId = uuidv4();

  // Validate that userUniqueId exists in Users table
  const userCheckQuery = `
    SELECT userUniqueId, fullName 
    FROM Users 
    WHERE userUniqueId = ?
  `;
  const [userResult] = await (transactionStorage.getStore() || pool).query(userCheckQuery, [userUniqueId]);

  if (userResult.length === 0) {
    throw new AppError(
      `Invalid userUniqueId: ${userUniqueId} does not exist in Users table`,
      400,
    );
  }

  // Get default values from delinquency type if not provided
  const typeQuery = `
    SELECT * 
    FROM DelinquencyTypes 
    WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE
  `;
  const [typeResult] = await (transactionStorage.getStore() || pool).query(typeQuery, [delinquencyTypeUniqueId]);
  if (typeResult.length === 0) {
    throw new AppError("Invalid delinquency type", 404);
  }

  const defaultType = typeResult[0];

  // Only perform duplicate check if not explicitly skipped
  if (!skipDuplicateCheck) {
    // Check for duplicates using existing getUserDelinquencies method
    const duplicateFilters = {
      userUniqueId,
      delinquencyTypeUniqueId,
      roleId,
      limit: 1, // We only need to check if any exist
      summary: false,
      stat: false,
    };

    // Calculate time window for duplicate check
    const duplicateWindowHours = defaultType?.duplicateCheckWindowHours || 24;
    // Use standard date helper, but convert to Date for arithmetic
    const nowStr = currentDate();
    const now = new Date(nowStr);
    const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
    const startDate = new Date(
      safeNow.getTime() - duplicateWindowHours * 60 * 60 * 1000,
    );

    duplicateFilters.startDate =
      startDate.toISOString().split("T")[0] + " 00:00:00";
    duplicateFilters.endDate =
      safeNow.toISOString().split("T")[0] + " 23:59:59";

    // If journey decision is provided, add it to filters
    if (journeyDecisionUniqueId) {
      duplicateFilters.journeyDecisionUniqueId = journeyDecisionUniqueId;
    }

    logger.debug("@duplicateFilters", duplicateFilters);

    // Use Promise.all to check for duplicates and get delinquency type
    const [duplicateCheckResult] = await Promise.all([
      getUserDelinquencies(duplicateFilters),
      (transactionStorage.getStore() || pool).query(typeQuery, [delinquencyTypeUniqueId]),
    ]);

    if (
      duplicateCheckResult.message === "success" &&
      duplicateCheckResult.data &&
      duplicateCheckResult.data.length > 0
    ) {
      const duplicate = duplicateCheckResult.data[0];
      const timeAgo = Math.round(
        (now - new Date(duplicate.delinquencyCreatedAt)) / (1000 * 60 * 60),
      );

      const error = new AppError(
        `Duplicate delinquency detected. A similar delinquency was registered ${timeAgo} hours ago.`,
        400,
      );
      error.duplicateId = duplicate.userDelinquencyUniqueId;
      error.timeSinceDuplicate = `${timeAgo} hours`;
      error.duplicateDetails = {
        description: duplicate.delinquencyDescription,
        createdAt: duplicate.delinquencyCreatedAt,
        createdBy: duplicate.createdByName,
      };
      throw error;
    }
  }

  // Start building SQL and values
  let columns = `userDelinquencyUniqueId, userUniqueId, roleId, delinquencyTypeUniqueId, 
    delinquencyDescription, delinquencySeverity, delinquencyPoints, delinquencyCreatedBy`;

  let values = [
    userDelinquencyUniqueId,
    userUniqueId,
    roleId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencySeverity || defaultType.defaultSeverity,
    delinquencyPoints || defaultType.defaultPoints,
    delinquencyCreatedBy,
  ];

  let placeholders = `?, ?, ?, ?, ?, ?, ?, ?`;

  // Add journeyDecisionUniqueId if provided
  if (journeyDecisionUniqueId) {
    // Validate that journeyDecisionUniqueId exists in JourneyDecisions table
    const journeyCheckQuery = `
      SELECT journeyDecisionUniqueId 
      FROM JourneyDecisions 
      WHERE journeyDecisionUniqueId = ?
    `;
    const [journeyResult] = await (transactionStorage.getStore() || pool).query(journeyCheckQuery, [
      journeyDecisionUniqueId,
    ]);

    if (journeyResult.length === 0) {
      throw new AppError(
        `Invalid journeyDecisionUniqueId: ${journeyDecisionUniqueId} does not exist in JourneyDecisions table`,
        400,
      );
    }

    columns += `, journeyDecisionUniqueId`;
    placeholders += `, ?`;
    values.push(journeyDecisionUniqueId);
  }

  const sql = `
    INSERT INTO UserDelinquency (${columns}) 
    VALUES (${placeholders})
  `;

  try {
    await query(sql, values);

    // Check for automatic ban
    const banResult = await checkAndApplyAutomaticBan(
      userUniqueId,
      roleId,
    );

    return {
      message: "success",
      data: "User delinquency record created successfully",
      userDelinquencyUniqueId,
      automaticAction: banResult,
    };
  } catch (error) {
    // Check for MySQL duplicate entry error
    if (error.code === "ER_DUP_ENTRY") {
      // Use existing method to find the duplicate
      const duplicateFilters = {
        userUniqueId,
        delinquencyTypeUniqueId,
        roleId,
        limit: 1,
      };

      if (journeyDecisionUniqueId) {
        duplicateFilters.journeyDecisionUniqueId = journeyDecisionUniqueId;
      }

      const duplicateCheckResult = await getUserDelinquencies(duplicateFilters);

      const appError = new AppError(
        "Duplicate entry detected. A similar delinquency already exists.",
        400,
      );
      appError.duplicateId =
        duplicateCheckResult.data?.[0]?.userDelinquencyUniqueId;
      appError.details = error.message;
      throw appError;
    }

    throw new AppError(
      error.message || "Failed to create user delinquency record",
      error.statusCode || 500,
    );
  }
};
const checkAndApplyAutomaticBan = async (
  userUniqueId,
  roleId,
) => {
  // Calculate total points for this user with specific role (last 30 days)
  const pointsQuery = `
    SELECT SUM(delinquencyPoints) as totalPoints 
    FROM UserDelinquency 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND delinquencyCreatedAt >= DATE_SUB(?, INTERVAL 30 DAY)
    AND delinquencyDeletedAt IS NULL
  `;
  const [pointsResult] = await (transactionStorage.getStore() || pool).query(pointsQuery, [
    userUniqueId,
    roleId,
    currentDate(),
  ]);
  const totalPoints = pointsResult[0].totalPoints || 0;

  // Get user info
  const userQuery = `
    SELECT u.*, r.roleName 
    FROM Users u
    INNER JOIN Roles r ON r.roleId = ?
    WHERE u.userUniqueId = ?
  `;
  const [userInfo] = await (transactionStorage.getStore() || pool).query(userQuery, [roleId, userUniqueId]);

  if (userInfo.length === 0) {
    return { action: "none", reason: "User not found" };
  }

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

  // Check if already banned for this user-role combination
  const activeBanQuery = `
    SELECT b.banUniqueId FROM BannedUsers b
    WHERE b.userUniqueId = ?
    AND b.roleId = ?
    AND b.isActive = TRUE
    LIMIT 1
  `;
  const [activeBans] = await (transactionStorage.getStore() || pool).query(activeBanQuery, [userUniqueId, roleId]);

  if (activeBans.length > 0) {
    return {
      action: "none",
      reason: "User already banned for this role",
      totalPoints,
    };
  }

  // Apply automatic ban
  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + applicableRule.duration * 24 * 60 * 60 * 1000,
  );

  const banSql = `
    INSERT INTO BannedUsers (
      banUniqueId, userUniqueId, roleId,
      bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive
    ) VALUES (?, ?, ?, 'system', ?, ?, ?, ?, TRUE)
  `;

  const banValues = [
    banUniqueId,
    userUniqueId,
    roleId,
    `Automatic ban: ${totalPoints} points reached ${applicableRule.severity} threshold`,
    applicableRule.duration,
    banAt,
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
    userUniqueId,
    userDelinquencyUniqueId,
    delinquencyTypeUniqueId,
    delinquencySeverity,
    roleId,
    journeyDecisionUniqueId, // Added this filter
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
    const [countResult] = await (transactionStorage.getStore() || pool).query(countQuery, queryParams);
    return {
      message: "success",
      data: { totalUserDelinquencies: countResult[0].total },
    };
  }

  if (summary) {
    if (!userUniqueId || !roleId) {
      throw new AppError(
        "userUniqueId and roleId are required for summary",
        400,
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
      ud.isDeliquencySeenByAdmin,
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
      message: "success",
      data: results,
    };
  } else {
    const [results] = await (transactionStorage.getStore() || pool).query(dataQuery, dataQueryParams);

    const countQuery = `SELECT COUNT(*) as total ${joins} WHERE ${whereClause}`;
    const [countResult] = await (transactionStorage.getStore() || pool).query(countQuery, queryParams);
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
  }
};

const deleteUserDelinquency = async (userDelinquencyUniqueId) => {
  // Check if this delinquency is linked to any banned users
  const checkSql =
    "SELECT COUNT(*) as count FROM BannedUsers WHERE userDelinquencyUniqueId = ?";
  const [checkResult] = await (transactionStorage.getStore() || pool).query(checkSql, [userDelinquencyUniqueId]);

  if (checkResult[0].count > 0) {
    throw new AppError(
      "Cannot delete delinquency record as it is linked to banned users",
      400,
    );
  }

  const sql = "DELETE FROM UserDelinquency WHERE userDelinquencyUniqueId = ?";
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [userDelinquencyUniqueId]);
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "User delinquency record deleted successfully",
    };
  }
  throw new AppError("Failed to delete user delinquency record", 500);
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

  const [summary] = await (transactionStorage.getStore() || pool).query(summaryQuery, [userUniqueId, roleId]);

  // Get recent delinquencies
  const recentQuery = `
    SELECT ud.*, dt.delinquencyTypeName
    FROM UserDelinquency ud
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE ud.userUniqueId = ? AND ud.roleId = ?
    ORDER BY ud.delinquencyCreatedAt DESC 
    LIMIT 5
  `;
  const [recentDelinquencies] = await (transactionStorage.getStore() || pool).query(recentQuery, [
    userUniqueId,
    roleId,
  ]);

  // Check if banned for this user-role combination
  const banQuery = `
    SELECT * FROM BannedUsers 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND isActive = TRUE
  `;
  const [banStatus] = await (transactionStorage.getStore() || pool).query(banQuery, [userUniqueId, roleId]);

  return {
    message: "success",
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

const updateUserDelinquency = async (userDelinquencyUniqueId, data) => {
  // Don't allow updating certain fields - copy data and remove immutable fields
  const updateData = { ...data };

  // Add updated timestamp
  updateData.delinquencyUpdatedAt = currentDate();

  // Update the UserDelinquency record and get the result
  const [result] = await (transactionStorage.getStore() || pool).query(
    "UPDATE UserDelinquency SET ? WHERE userDelinquencyUniqueId = ?",
    [updateData, userDelinquencyUniqueId],
  );
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "User delinquency record updated successfully",
    };
  }
  throw new AppError("Failed to update user delinquency record", 500);
};

const checkAutomaticBan = async (userUniqueId, roleId) => {
  const sql = `
    SELECT * FROM UserDelinquency 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND delinquencyCreatedAt >= DATE_SUB(?, INTERVAL 30 DAY)
  `;
  const [results] = await (transactionStorage.getStore() || pool).query(sql, [
    userUniqueId,
    roleId,
    currentDate(),
  ]);

  if (results.length === 0) {
    return {
      message: "success",
      data: "No delinquencies found for this user-role combination in the last 30 days",
    };
  }

  const totalPoints = results.reduce(
    (acc, delinquency) => acc + delinquency.delinquencyPoints,
    0,
  );

  return {
    message: "success",
    data: {
      totalPoints,
      delinquencies: results,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get pending user delinquencies (no admin decision yet)
// ─────────────────────────────────────────────────────────────────────────────
const getPendingUserDelinquencies = async (filters = {}) => {
  const { userUniqueId, roleId, page = 1, limit = 10 } = filters;

  if (!userUniqueId || !roleId) {
    throw new AppError("userUniqueId and roleId are required", 400);
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
     ORDER BY ud.delinquencyCreatedAt DESC
     LIMIT ? OFFSET ?`,
    [userUniqueId, roleId, parseInt(limit), offset],
  );

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  updateUserDelinquency,
  deleteUserDelinquency,
  checkAutomaticBan,
  getPendingUserDelinquencies,
};
