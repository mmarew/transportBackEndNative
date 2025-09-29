const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

const banUser = async (data) => {
  const {
    userRoleUniqueId,
    userDelinquencyUniqueId,
    bannedBy,
    banReason,
    banDurationDays,
  } = data;

  // Check if user role is already banned
  const checkSql = `
    SELECT * FROM BannedUsers 
    WHERE userRoleUniqueId = ? AND isActive = TRUE
  `;
  const [existingBan] = await pool.query(checkSql, [userRoleUniqueId]);

  if (existingBan.length > 0) {
    return {
      message: "error",
      error: "User role is already banned",
    };
  }

  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + banDurationDays * 24 * 60 * 60 * 1000
  );

  const sql = `
    INSERT INTO BannedUsers (
      banUniqueId, userRoleUniqueId, userDelinquencyUniqueId,
      bannedBy, banReason, banDurationDays, banExpiresAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    banUniqueId,
    userRoleUniqueId,
    userDelinquencyUniqueId,
    bannedBy,
    banReason,
    banDurationDays,
    banExpiresAt,
  ];

  await query(sql, values);

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
    bannedBy,
    isActive,
    startDate,
    endDate,
    sortBy = "banAt",
    sortOrder = "DESC",
  } = filters;

  const offset = (page - 1) * limit;

  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (userRoleUniqueId) {
    whereConditions.push("bu.userRoleUniqueId = ?");
    queryParams.push(userRoleUniqueId);
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

  const baseQuery = `
    SELECT 
      bu.*,
      ur.userUniqueId,
      u.fullName as userName,
      r.roleName,
      ub.fullName as bannedByName,
      ud.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN UserRole ur ON bu.userRoleUniqueId = ur.userRoleUniqueId
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
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

const getBannedUserById = async (banUniqueId) => {
  const sql = `
    SELECT 
      bu.*,
      ur.userUniqueId,
      u.fullName as userName,
      r.roleName,
      ub.fullName as bannedByName,
      ud.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN UserRole ur ON bu.userRoleUniqueId = ur.userRoleUniqueId
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE bu.banUniqueId = ?
  `;

  const result = await query(sql, [banUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Banned user record not found" };
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

const unbanUser = async (banUniqueId) => {
  const sql = "DELETE FROM BannedUsers WHERE banUniqueId = ?";
  const result = await query(sql, [banUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "User unbanned successfully" }
    : { message: "error", error: "Failed to unban user" };
};

const getBannedUserByUserRole = async (userRoleUniqueId) => {
  const sql = `
    SELECT 
      bu.*,
      ur.userUniqueId,
      u.fullName as userName,
      r.roleName,
      ub.fullName as bannedByName,
      ud.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN UserRole ur ON bu.userRoleUniqueId = ur.userRoleUniqueId
    INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    INNER JOIN DelinquencyTypes dt ON ud.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    WHERE bu.userRoleUniqueId = ? AND bu.isActive = TRUE
  `;

  const result = await query(sql, [userRoleUniqueId]);

  return {
    message: "success",
    data: result.length > 0 ? result[0] : null,
    isBanned: result.length > 0,
  };
};

const checkIfUserRoleIsBanned = async (userRoleUniqueId) => {
  const sql = `
    SELECT * FROM BannedUsers 
    WHERE userRoleUniqueId = ? AND isActive = TRUE
    AND (banExpiresAt IS NULL OR banExpiresAt > NOW())
  `;

  const result = await query(sql, [userRoleUniqueId]);

  return {
    message: "success",
    data: {
      isBanned: result.length > 0,
      banRecord: result.length > 0 ? result[0] : null,
    },
  };
};

const deactivateBan = async (banUniqueId) => {
  const sql = "UPDATE BannedUsers SET isActive = FALSE WHERE banUniqueId = ?";
  const result = await query(sql, [banUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "Ban deactivated successfully" }
    : { message: "error", error: "Failed to deactivate ban" };
};

const getBannedUsersStats = async () => {
  const statsQueries = [
    // Total active bans
    "SELECT COUNT(*) as totalActiveBans FROM BannedUsers WHERE isActive = TRUE",

    // Recently banned (last 30 days)
    "SELECT COUNT(*) as recentlyBanned FROM BannedUsers WHERE banAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)",

    // Bans by role
    `SELECT r.roleName, COUNT(*) as count 
     FROM BannedUsers bu 
     INNER JOIN UserRole ur ON bu.userRoleUniqueId = ur.userRoleUniqueId
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
  getBannedUserById,
  updateBannedUser,
  unbanUser,
  getBannedUserByUserRole,
  checkIfUserRoleIsBanned,
  deactivateBan,
  getBannedUsersStats,
};
