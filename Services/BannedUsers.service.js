const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { updateUserRoleStatus } = require("./UserRoleStatus.service");
const { accountStatus } = require("./Account");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const query = async (sql, values = []) => {
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  return result;
};

const banUser = async (data) => {
  const { userUniqueId, roleId, bannedBy, banReason, banDurationDays, userRoleUniqueId, reason, banDuration } =
    data;

  const executor = transactionStorage.getStore() || pool;

  // Handle different parameter formats (API sends userRoleUniqueId, reason, banDuration)
  let targetUserUniqueId = userUniqueId;
  let targetRoleId = roleId;
  let finalBanReason = banReason || reason;
  let finalBanDuration = banDurationDays || banDuration;

  // If userRoleUniqueId is provided, look up userUniqueId and roleId
  if (userRoleUniqueId && (!targetUserUniqueId || !targetRoleId)) {
    const [userRoleRows] = await executor.query(
      `SELECT userUniqueId, roleId 
       FROM UserRole 
       WHERE userRoleUniqueId = ?`,
      [userRoleUniqueId],
    );
    
    if (userRoleRows.length === 0) {
      throw new AppError("Invalid userRoleUniqueId - user role not found", 400);
    }
    
    targetUserUniqueId = userRoleRows[0].userUniqueId;
    targetRoleId = userRoleRows[0].roleId;
  }

  // Validate we have required fields
  if (!targetUserUniqueId) {
    throw new AppError("userUniqueId or userRoleUniqueId is required", 400);
  }
  if (!targetRoleId) {
    throw new AppError("roleId is required or must be derived from userRoleUniqueId", 400);
  }
  if (!finalBanReason) {
    throw new AppError("banReason or reason is required", 400);
  }
  if (!finalBanDuration) {
    throw new AppError("banDurationDays or banDuration is required", 400);
  }

  // Validate user exists
  const [userInfoRows] = await executor.query(
    `SELECT u.phoneNumber
     FROM Users u
     WHERE u.userUniqueId = ?`,
    [targetUserUniqueId],
  );
  if (userInfoRows.length === 0) {
    throw new AppError("Invalid userUniqueId", 400);
  }
  const { phoneNumber } = userInfoRows[0];

  const [existingActiveBanRows] = await executor.query(
    `SELECT b.* FROM BannedUsers b 
     WHERE b.userUniqueId = ? 
       AND b.roleId = ?
       AND b.isActive = TRUE 
       AND (b.banExpiresAt IS NULL OR b.banExpiresAt > ?) 
     LIMIT 1`,
    [targetUserUniqueId, targetRoleId, currentDate()],
  );
  if (existingActiveBanRows.length > 0) {
    return {
      message: "success",
      data: null,
      banUniqueId: existingActiveBanRows[0].banUniqueId,
    };
  }

  const banUniqueId = uuidv4();
  const banAtDate = currentDate(); // Get timezone-aware date string
  const banAtTimestamp = new Date(banAtDate); // Convert to Date for calculation
  const banExpiresAt = new Date(
    banAtTimestamp.getTime() + finalBanDuration * 24 * 60 * 60 * 1000,
  );

  const sql = `
    INSERT INTO BannedUsers (
      banUniqueId, userUniqueId, roleId,
      bannedBy, banReason, banDurationDays, banExpiresAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    banUniqueId,
    targetUserUniqueId,
    targetRoleId,
    bannedBy,
    finalBanReason,
    finalBanDuration,
    banExpiresAt,
  ];

  await query(sql, values);
  // change user role status to banned which is 6
  await updateUserRoleStatus({
    user: { userUniqueId: bannedBy },
    roleId: targetRoleId,
    newStatusId: 6,
    phoneNumber,
  });

  return {
    message: "success",
    data: null,
    banUniqueId,
    banExpiresAt,
  };
};

const getBannedUsers = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userRoleUniqueId,
    banUniqueId,
    bannedBy,
    isActive,
    startDate,
    endDate,
    sortBy = "banAt",
    sortOrder = "DESC",
    roleId,
    search, // Added search parameter
  } = filters;

  const offset = (page - 1) * limit;

  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (userRoleUniqueId) {
    whereConditions.push("ur.userRoleUniqueId = ?");
    queryParams.push(userRoleUniqueId);
  }

  if (banUniqueId) {
    whereConditions.push("bu.banUniqueId = ?");
    queryParams.push(banUniqueId);
  }

  if (bannedBy) {
    whereConditions.push("bu.bannedBy = ?");
    queryParams.push(bannedBy);
  }

  if (isActive !== undefined) {
    whereConditions.push("bu.isActive = ?");
    queryParams.push(isActive === "true" ? 1 : 0);
  }

  if (startDate) {
    whereConditions.push("bu.banAt >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("bu.banAt <= ?");
    queryParams.push(endDate);
  }

  if (roleId) {
    let roleIds = roleId;
    if (typeof roleIds === "string" && roleIds.includes(",")) {
      roleIds = roleIds.split(",").map((id) => id.trim());
    }

    if (Array.isArray(roleIds)) {
      const placeholders = roleIds.map(() => "?").join(",");
      whereConditions.push(`ur.roleId IN (${placeholders})`);
      queryParams.push(...roleIds);
    } else {
      whereConditions.push("ur.roleId = ?");
      queryParams.push(roleIds);
    }
  }

  // SEARCH BLOCK - Search across multiple fields
  if (search) {
    whereConditions.push(`(
      u.fullName LIKE ? OR 
      u.phoneNumber LIKE ? OR 
      u.email LIKE ? OR
      ub.fullName LIKE ? OR
      r.roleName LIKE ? OR
      dt.delinquencyTypeName LIKE ? OR
      ud.delinquencyDescription LIKE ? OR
      bu.banReason LIKE ?
    )`);

    const searchPattern = `%${search}%`;
    // Add the same pattern for all 8 search conditions
    queryParams.push(
      searchPattern, // u.fullName
      searchPattern, // u.phoneNumber
      searchPattern, // u.email
      searchPattern, // ub.fullName (banned by user name)
      searchPattern, // r.roleName
      searchPattern, // dt.delinquencyTypeName
      searchPattern, // ud.delinquencyDescription
      searchPattern, // bu.banReason
    );
  }

  const baseFromClause = `
    FROM BannedUsers bu
    INNER JOIN Users u ON bu.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON bu.roleId = r.roleId
    INNER JOIN UserRole ur ON bu.userUniqueId = ur.userUniqueId AND bu.roleId = ur.roleId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    LEFT JOIN BannedUserDelinquency bud ON bu.banUniqueId = bud.banUniqueId
    LEFT JOIN UserDelinquency ud ON bud.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    LEFT JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    LEFT JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId
    LEFT JOIN Statuses s ON ursc.statusId = s.statusId
    WHERE ${whereConditions.join(" AND ")}
  `;

  const baseQuery = `
    SELECT 
      bu.*, 
      u.fullName, u.phoneNumber, u.email, u.isPhoneVerified, u.isEmailVerified, 
      r.roleName, r.roleDescription,
      ub.fullName as bannedByName,
      ud.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      ud.delinquencyDescription,
      -- UserRoleStatusCurrent fields
      ursc.userRoleStatusId,
      ursc.userRoleStatusUniqueId,
      ursc.statusId as currentStatusId,
      ursc.userRoleStatusDescription,
      ursc.userRoleStatusCreatedBy,
      ursc.userRoleStatusCreatedAt,
      ursc.userRoleStatusCurrentVersion,
      -- Status fields for current status
      s.statusName as currentStatusName,
      s.statusDescription as currentStatusDescription
    ${baseFromClause}
  `;

  const countQuery = `SELECT COUNT(*) as total ${baseFromClause}`;
  const dataQuery = `
    ${baseQuery}
    ORDER BY bu.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
    LIMIT ? OFFSET ?
  `;

  const dataQueryParams = [...queryParams, parseInt(limit), offset];

  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countQuery, queryParams);
  const [results] = await executor.query(dataQuery, dataQueryParams);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  return {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      limit: parseInt(limit),
    },
    filters,
  };
};

const updateBannedUser = async (banUniqueId, data) => {
  const { banReason, reason, banDurationDays, banExpiresAt } = data;

  // Build dynamic SET clause based on provided fields
  const setFields = [];
  const values = [];

  // Handle both 'reason' (from API) and 'banReason' (internal)
  const finalReason = banReason || reason;
  if (finalReason !== undefined) {
    setFields.push("banReason = ?");
    values.push(finalReason);
  }
  if (banDurationDays !== undefined) {
    setFields.push("banDurationDays = ?");
    values.push(banDurationDays);
  }
  if (banExpiresAt !== undefined) {
    setFields.push("banExpiresAt = ?");
    values.push(banExpiresAt);
  }

  if (setFields.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Add banUniqueId at the end for WHERE clause
  values.push(banUniqueId);

  const sql = `
    UPDATE BannedUsers 
    SET ${setFields.join(", ")}
    WHERE banUniqueId = ?
  `;

  const result = await query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: null,
    };
  } else {
    throw new AppError("Failed to update banned user record", 500);
  }
};

const unbanUser = async (query) => {
  try {
    const { banUniqueId, phoneNumber, roleId, newStatusId } = query;
    // validate all query
    if (!banUniqueId || !phoneNumber || !roleId || !newStatusId) {
      throw new AppError("all fields are required", 400);
    }
    const sql = "update   BannedUsers set isActive=? WHERE banUniqueId = ?";
    const executor = transactionStorage.getStore() || pool;
    const [updatedBanResult] = await executor.query(sql, [false, banUniqueId]);

    const { getUserByFilterDetailed } = require("./User.service");
    const filters = { phoneNumber };
    const userData = await getUserByFilterDetailed(filters);
    const ownerUserUniqueId = userData?.data?.[0]?.user?.userUniqueId;

    await accountStatus({ ownerUserUniqueId, body: { roleId } });

    if (updatedBanResult.affectedRows > 0) {
      return { message: "success", data: null };
    } else {
      throw new AppError("Failed to unBan user", 500);
    }
  } catch (error) {
    const logger = require("../Utils/logger");
    logger.error("Error unbanning user", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Failed to unBan user", 500);
  }
};

const deactivateBan = async (banUniqueId) => {
  const sql = "UPDATE BannedUsers SET isActive = FALSE WHERE banUniqueId = ?";
  const result = await query(sql, [banUniqueId]);
  if (result.affectedRows > 0) {
    return { message: "success", data: null };
  } else {
    throw new AppError("Failed to deactivate ban", 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Graduated auto-ban: sum user delinquency points (30-day window) and ban
// if threshold met. Mirrors CompanyBan.service → checkAndApplyAutomaticCompanyBan
// ─────────────────────────────────────────────────────────────────────────────
const USER_BAN_RULES = [
  { threshold: 90, duration: 365, severity: "PERMANENT" },
  { threshold: 60, duration: 90,  severity: "CRITICAL" },
  { threshold: 30, duration: 7,   severity: "HIGH" },
  { threshold: 15, duration: 3,   severity: "MEDIUM" },
];

const checkAndApplyAutomaticUserBan = async ({
  userUniqueId,
  roleId,
  bannedBy,
}) => {
  const logger = require("../Utils/logger");
  const executor = transactionStorage.getStore() || pool;

  // Fetch all active delinquencies in the 30-day window
  const [delinquencies] = await executor.query(
    `SELECT userDelinquencyUniqueId, delinquencyPoints
     FROM UserDelinquency
     WHERE userUniqueId = ? AND roleId = ?
       AND delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       AND delinquencyDeletedAt IS NULL`,
    [userUniqueId, roleId],
  );
  const totalPoints = delinquencies.reduce(
    (sum, d) => sum + d.delinquencyPoints,
    0,
  );

  // Already banned?
  const [activeBanRows] = await executor.query(
    `SELECT banId FROM BannedUsers
     WHERE userUniqueId = ? AND roleId = ? AND isActive = TRUE AND banExpiresAt > NOW()
     LIMIT 1`,
    [userUniqueId, roleId],
  );
  if (activeBanRows.length > 0) {
    return { action: "none", reason: "User already under active ban", totalPoints };
  }

  const rule = USER_BAN_RULES.find((r) => totalPoints >= r.threshold);
  if (!rule) {
    return { action: "none", reason: "No ban threshold met", totalPoints };
  }

  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + rule.duration * 24 * 60 * 60 * 1000,
  );
  const banReason = `Auto-ban: ${totalPoints} pts — ${rule.severity} threshold reached`;

  await executor.query(
    `INSERT INTO BannedUsers
       (banUniqueId, userUniqueId, roleId,
        bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [banUniqueId, userUniqueId, roleId, bannedBy, banReason, rule.duration, banAt, banExpiresAt],
  );

  // Link ALL contributing delinquencies to this ban
  if (delinquencies.length > 0) {
    const junctionRows = delinquencies.map((d) => [
      uuidv4(),
      banUniqueId,
      d.userDelinquencyUniqueId,
      d.delinquencyPoints,
    ]);
    await executor.query(
      `INSERT INTO BannedUserDelinquency
         (bannedUserDelinquencyUniqueId, banUniqueId, userDelinquencyUniqueId, pointsAtTime)
       VALUES ?`,
      [junctionRows],
    );
  }

  logger.info("User auto-banned", {
    userUniqueId,
    roleId,
    rule,
    totalPoints,
    banExpiresAt,
  });

  return {
    action: "suspended",
    banDurationDays: rule.duration,
    severity: rule.severity,
    totalPoints,
    banExpiresAt,
    banUniqueId,
  };
};

module.exports = {
  banUser,
  getBannedUsers,
  updateBannedUser,
  unbanUser,
  deactivateBan,
  checkAndApplyAutomaticUserBan,
};
