const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { updateUserRoleStatus } = require("./UserRoleStatus.service");
const { accountStatus } = require("./Account.service");

const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

const banUser = async (data) => {
  const { userDelinquencyUniqueId, bannedBy, banReason, banDurationDays } =
    data;
  console.log("@banUser data", data);

  // fetch user phone and role by userDelinquencyUniqueId and validate existence
  const [userInfoRows] = await pool.query(
    `SELECT u.phoneNumber, ur.roleId
     FROM UserDelinquency ud
     INNER JOIN UserRole ur ON ud.userRoleUniqueId = ur.userRoleUniqueId
     INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
     WHERE ud.userDelinquencyUniqueId = ?`,
    [userDelinquencyUniqueId]
  );

  if (userInfoRows.length === 0) {
    return { message: "error", error: "Invalid userDelinquencyUniqueId" };
  }
  const { phoneNumber, roleId } = userInfoRows[0];

  const [existingActiveBanRows] = await pool.query(
    `SELECT b.* FROM BannedUsers b 
     WHERE b.userDelinquencyUniqueId = ? 
       AND b.isActive = TRUE 
       AND (b.banExpiresAt IS NULL OR b.banExpiresAt > NOW()) 
     LIMIT 1`,
    [userDelinquencyUniqueId]
  );
  if (existingActiveBanRows.length > 0) {
    const existing = existingActiveBanRows[0];
    return {
      message: "error",
      error: "User already has an active ban",
      banUniqueId: existing.banUniqueId,
      banExpiresAt: existing.banExpiresAt,
    };
  }

  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + banDurationDays * 24 * 60 * 60 * 1000
  );

  const sql = `
    INSERT INTO BannedUsers (
      banUniqueId,   userDelinquencyUniqueId,
      bannedBy, banReason, banDurationDays, banExpiresAt
    ) VALUES (?, ?, ?, ?, ?,  ?)
  `;

  const values = [
    banUniqueId,

    userDelinquencyUniqueId,
    bannedBy,
    banReason,
    banDurationDays,
    banExpiresAt,
  ];

  await query(sql, values);
  // change user role status to banned which is 6
  await updateUserRoleStatus({
    user: { userUniqueId: bannedBy },
    roleId,
    newStatusId: 6,
    phoneNumber,
  });

  return {
    message: "success",
    data: "User role banned successfully",
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
    stats = false,
    check = false,
  } = filters;

  if (stats) {
    return await _getBannedUsersStats();
  }

  if (check) {
    return await _checkIfUserIsBanned(filters);
  }

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

  const baseQuery = `
    SELECT 
      bu.*,
       u.*,
      r.*,
      ub.fullName as bannedByName,
      ud.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    INNER JOIN UserRole ur ON ud.userRoleUniqueId = ur.userRoleUniqueId
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE ${whereConditions.join(" AND ")}
  `;

  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;
  const dataQuery = `
    ${baseQuery}
    ORDER BY bu.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
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

const updateBannedUser = async (banUniqueId, data) => {
  const { banReason, banDurationDays, banExpiresAt } = data;

  const sql = `
    UPDATE BannedUsers 
    SET banReason = ?, banDurationDays = ?, banExpiresAt = ?
    WHERE banUniqueId = ?
  `;

  const values = [banReason, banDurationDays, banExpiresAt, banUniqueId];
  const result = await query(sql, values);

  return result.affectedRows > 0
    ? { message: "success", data: "Banned user record updated successfully" }
    : { message: "error", error: "Failed to update banned user record" };
};

const unbanUser = async (query, user) => {
  try {
    const { banUniqueId, phoneNumber, roleId, newStatusId } = query;
    // validate all query
    if (!banUniqueId || !phoneNumber || !roleId || !newStatusId)
      return { message: "error", error: "all fields are required" };
    const sql = "DELETE FROM BannedUsers WHERE banUniqueId = ?";
    const result = await pool?.query(sql, [banUniqueId]);
    const { getUserByEmailOrNameOrPhoneNumber } = require("./User.service");

    const userData = await getUserByEmailOrNameOrPhoneNumber(phoneNumber);
    console.log("@unbanUser userData", userData?.data?.[0]?.userUniqueId);
    const ownerUserUniqueId = userData?.data?.[0]?.userUniqueId;
    const updateDataValues = {
      user,
      roleId,
      newStatusId,
      phoneNumber,
    };
    // const data = accountStatus({ ownerUserUniqueId, body: { roleId } });
    updateUserRoleStatus(updateDataValues);

    return result.affectedRows > 0
      ? { message: "success", data: "User unbanned successfully" }
      : { message: "error", error: "Failed to unBan user" };
  } catch (error) {
    console.log("@unbanUser error", error);
  }
};

const _checkIfUserIsBanned = async (identifiers) => {
  const { userRoleUniqueId, email, phoneNumber, roleId } = identifiers;
  console.log("@identifiers", identifiers);
  const whereClauses = [];
  const params = [];

  if (userRoleUniqueId) {
    whereClauses.push("ur.userRoleUniqueId = ?");
    params.push(userRoleUniqueId);
  }
  if (email) {
    whereClauses.push("u.email = ?");
    params.push(email);
  }
  if (phoneNumber) {
    whereClauses.push("u.phoneNumber = ?");
    params.push(phoneNumber);
  }
  if (roleId) {
    whereClauses.push("ur.roleId = ?");
    params.push(roleId);
  }

  if (whereClauses.length === 0) {
    return {
      message: "error",
      error: "At least one identifier must be provided",
    };
  }

  const sql = `
    SELECT b.*, ur.userRoleUniqueId, u.fullName, u.email, u.phoneNumber
    FROM BannedUsers b
    JOIN UserDelinquency ud ON b.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    JOIN UserRole ur ON ud.userRoleUniqueId = ur.userRoleUniqueId
    JOIN Users u ON ur.userUniqueId = u.userUniqueId
    WHERE b.isActive = TRUE
      AND (b.banExpiresAt IS NULL OR b.banExpiresAt > NOW())
      AND (${whereClauses.join(" OR ")})
    LIMIT 1;
  `;

  const [rows] = await pool.query(sql, params);

  if (rows.length > 0) {
    return {
      message: "success",
      data: { isBanned: true, banDetails: rows[0] },
    };
  } else {
    return { message: "success", data: { isBanned: false } };
  }
};

const deactivateBan = async (banUniqueId) => {
  const sql = "UPDATE BannedUsers SET isActive = FALSE WHERE banUniqueId = ?";
  const result = await query(sql, [banUniqueId]);
  return result.affectedRows > 0
    ? { message: "success", data: "Ban deactivated successfully" }
    : { message: "error", error: "Failed to deactivate ban" };
};

const _getBannedUsersStats = async () => {
  const statsQueries = [
    // Total active bans
    "SELECT COUNT(*) as totalActiveBans FROM BannedUsers WHERE isActive = TRUE",

    // Recently banned (last 30 days)
    "SELECT COUNT(*) as recentlyBanned FROM BannedUsers WHERE banAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)",

    // Bans by role
    `SELECT r.roleName, COUNT(*) as count 
     FROM BannedUsers bu 
     INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
     INNER JOIN UserRole ur ON ud.userRoleUniqueId = ur.userRoleUniqueId
     INNER JOIN Roles r ON ur.roleId = r.roleId
     WHERE bu.isActive = TRUE 
     GROUP BY r.roleName`,

    // Expiring soon (next 7 days)
    `SELECT COUNT(*) as expiringSoon 
     FROM BannedUsers 
     WHERE isActive = TRUE 
     AND banExpiresAt BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`,
  ];

  const [totalResult, recentResult, roleResult, expiringResult] =
    await Promise.all(statsQueries.map((sql) => query(sql)));

  return {
    message: "success",
    data: {
      totalActiveBans: totalResult[0].totalActiveBans,
      recentlyBanned: recentResult[0].recentlyBanned,
      bansByRole: roleResult,
      expiringSoon: expiringResult[0].expiringSoon,
    },
  };
};

module.exports = {
  banUser,
  getBannedUsers,
  updateBannedUser,
  unbanUser,
  deactivateBan,
};
