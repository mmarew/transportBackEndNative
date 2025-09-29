const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Helper function for database queries
const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

// Ban a user
const banUser = async (data) => {
  const { userUniqueId, userDelinquencyUniqueId, bannedBy, banAt } = data;

  // Check if user is already banned
  const checkSql = "SELECT * FROM BannedUsers WHERE userUniqueId = ?";
  const [existingBan] = await pool.query(checkSql, [userUniqueId]);

  if (existingBan.length > 0) {
    return {
      message: "error",
      error: "User is already banned",
    };
  }

  const banUniqueId = uuidv4();
  const sql = `
    INSERT INTO BannedUsers (
      banUniqueId, userUniqueId, bannedBy, userDelinquencyUniqueId, banAt
    ) VALUES (?, ?, ?, ?, ?)
  `;

  const values = [
    banUniqueId,
    userUniqueId,
    bannedBy,
    userDelinquencyUniqueId,
    banAt || new Date(),
  ];

  await query(sql, values);

  return {
    message: "success",
    data: "User banned successfully",
    banUniqueId,
  };
};

// Get banned users with pagination and filtering
const getBannedUsers = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userUniqueId,
    bannedBy,
    startDate,
    endDate,
    sortBy = "banAt",
    sortOrder = "DESC",
  } = filters;

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // Build WHERE clause
  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (userUniqueId) {
    whereConditions.push("bu.userUniqueId = ?");
    queryParams.push(userUniqueId);
  }

  if (bannedBy) {
    whereConditions.push("bu.bannedBy = ?");
    queryParams.push(bannedBy);
  }

  if (startDate) {
    whereConditions.push("bu.banAt >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("bu.banAt <= ?");
    queryParams.push(endDate);
  }

  // Build main query
  const baseQuery = `
    SELECT SQL_CALC_FOUND_ROWS 
      bu.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      ub.fullName as bannedByName,
      ud.delinquencyType,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN Users u ON bu.userUniqueId = u.userUniqueId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    WHERE ${whereConditions.join(" AND ")}
  `;

  // Count query
  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;

  // Data query with sorting and pagination
  const dataQuery = `
    ${baseQuery}
    ORDER BY bu.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
    LIMIT ? OFFSET ?
  `;

  // Add pagination parameters
  queryParams.push(parseInt(limit), offset);

  // Execute queries
  const [countResult] = await pool.query(countQuery, queryParams.slice(0, -2));
  const [results] = await pool.query(dataQuery, queryParams);

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
    filters: {
      userUniqueId,
      bannedBy,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    },
  };
};

// Get banned user by ID
const getBannedUserById = async (banUniqueId) => {
  const sql = `
    SELECT 
      bu.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      ub.fullName as bannedByName,
      ud.delinquencyType,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN Users u ON bu.userUniqueId = u.userUniqueId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    WHERE bu.banUniqueId = ?
  `;

  const result = await query(sql, [banUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Banned user record not found" };
};

// Update banned user record
const updateBannedUser = async (banUniqueId, data) => {
  const { userDelinquencyUniqueId, banAt } = data;

  const sql = `
    UPDATE BannedUsers 
    SET userDelinquencyUniqueId = ?, banAt = ?
    WHERE banUniqueId = ?
  `;

  const values = [userDelinquencyUniqueId, banAt, banUniqueId];
  const result = await query(sql, values);

  return result.affectedRows > 0
    ? { message: "success", data: "Banned user record updated successfully" }
    : { message: "error", error: "Failed to update banned user record" };
};

// Unban a user (delete banned record)
const unbanUser = async (banUniqueId) => {
  const sql = "DELETE FROM BannedUsers WHERE banUniqueId = ?";
  const result = await query(sql, [banUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "User unbanned successfully" }
    : { message: "error", error: "Failed to unban user" };
};

// Get banned user by user ID
const getBannedUserByUserId = async (userUniqueId) => {
  const sql = `
    SELECT 
      bu.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      ub.fullName as bannedByName,
      ud.delinquencyType,
      ud.delinquencyDescription
    FROM BannedUsers bu
    INNER JOIN Users u ON bu.userUniqueId = u.userUniqueId
    INNER JOIN Users ub ON bu.bannedBy = ub.userUniqueId
    INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
    WHERE bu.userUniqueId = ?
  `;

  const result = await query(sql, [userUniqueId]);

  return {
    message: "success",
    data: result.length > 0 ? result[0] : null,
    isBanned: result.length > 0,
  };
};

// Check if a user is currently banned
const checkIfUserIsBanned = async (userUniqueId) => {
  const sql = "SELECT * FROM BannedUsers WHERE userUniqueId = ?";
  const result = await query(sql, [userUniqueId]);

  return {
    message: "success",
    data: {
      isBanned: result.length > 0,
      banRecord: result.length > 0 ? result[0] : null,
    },
  };
};

// Get banned users statistics
const getBannedUsersStats = async () => {
  const statsQueries = [
    // Total banned users
    "SELECT COUNT(*) as totalBannedUsers FROM BannedUsers",

    // Recently banned users (last 30 days)
    "SELECT COUNT(*) as recentlyBanned FROM BannedUsers WHERE banAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)",

    // Bans by delinquency type
    `SELECT ud.delinquencyType, COUNT(*) as count 
     FROM BannedUsers bu 
     INNER JOIN UserDelinquency ud ON bu.userDelinquencyUniqueId = ud.userDelinquencyUniqueId 
     GROUP BY ud.delinquencyType`,
  ];

  const [totalResult, recentResult, typeResult] = await Promise.all(
    statsQueries.map((sql) => query(sql))
  );

  return {
    message: "success",
    data: {
      totalBannedUsers: totalResult[0].totalBannedUsers,
      recentlyBanned: recentResult[0].recentlyBanned,
      bansByDelinquencyType: typeResult,
    },
  };
};

module.exports = {
  banUser,
  getBannedUsers,
  getBannedUserById,
  updateBannedUser,
  unbanUser,
  getBannedUserByUserId,
  checkIfUserIsBanned,
  getBannedUsersStats,
};
