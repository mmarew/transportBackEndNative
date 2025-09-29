const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Helper function for database queries
const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

// Create a new user delinquency record
const createUserDelinquency = async (data) => {
  const {
    userUniqueId,
    delinquencyType,
    delinquencyDescription,
    delinquencyCreatedBy,
  } = data;

  const userDelinquencyUniqueId = uuidv4();
  const sql = `
    INSERT INTO UserDelinquency (
      userDelinquencyUniqueId, userUniqueId, delinquencyType, 
      delinquencyDescription, delinquencyCreatedBy
    ) VALUES (?, ?, ?, ?, ?)
  `;

  const values = [
    userDelinquencyUniqueId,
    userUniqueId,
    delinquencyType,
    delinquencyDescription,
    delinquencyCreatedBy,
  ];

  await query(sql, values);

  return {
    message: "success",
    data: "User delinquency record created successfully",
    userDelinquencyUniqueId,
  };
};

// Get user delinquencies with pagination and filtering
const getUserDelinquencies = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userUniqueId,
    delinquencyType,
    startDate,
    endDate,
    sortBy = "delinquencyCreatedAt",
    sortOrder = "DESC",
  } = filters;

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // Build WHERE clause
  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (userUniqueId) {
    whereConditions.push("ud.userUniqueId = ?");
    queryParams.push(userUniqueId);
  }

  if (delinquencyType) {
    whereConditions.push("ud.delinquencyType LIKE ?");
    queryParams.push(`%${delinquencyType}%`);
  }

  if (startDate) {
    whereConditions.push("ud.delinquencyCreatedAt >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("ud.delinquencyCreatedAt <= ?");
    queryParams.push(endDate);
  }

  // Build main query
  const baseQuery = `
    SELECT SQL_CALC_FOUND_ROWS 
      ud.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      uc.fullName as createdByName
    FROM UserDelinquency ud
    INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId
    LEFT JOIN Users uc ON ud.delinquencyCreatedBy = uc.userUniqueId
    WHERE ${whereConditions.join(" AND ")}
  `;

  // Count query
  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;

  // Data query with sorting and pagination
  const dataQuery = `
    ${baseQuery}
    ORDER BY ud.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
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
      delinquencyType,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    },
  };
};

// Get user delinquency by ID
const getUserDelinquencyById = async (userDelinquencyUniqueId) => {
  const sql = `
    SELECT 
      ud.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      uc.fullName as createdByName
    FROM UserDelinquency ud
    INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId
    LEFT JOIN Users uc ON ud.delinquencyCreatedBy = uc.userUniqueId
    WHERE ud.userDelinquencyUniqueId = ?
  `;

  const result = await query(sql, [userDelinquencyUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "User delinquency record not found" };
};

// Update user delinquency record
const updateUserDelinquency = async (userDelinquencyUniqueId, data) => {
  const { delinquencyType, delinquencyDescription } = data;

  const sql = `
    UPDATE UserDelinquency 
    SET delinquencyType = ?, delinquencyDescription = ?, delinquencyUpdatedAt = NOW()
    WHERE userDelinquencyUniqueId = ?
  `;

  const values = [
    delinquencyType,
    delinquencyDescription,
    userDelinquencyUniqueId,
  ];
  const result = await query(sql, values);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: "User delinquency record updated successfully",
      }
    : { message: "error", error: "Failed to update user delinquency record" };
};

// Delete user delinquency record
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

// Get delinquencies by specific user
const getUserDelinquenciesByUser = async (userUniqueId, pagination = {}) => {
  const { page = 1, limit = 10 } = pagination;
  const offset = (page - 1) * limit;

  const sql = `
    SELECT SQL_CALC_FOUND_ROWS 
      ud.*,
      u.fullName as userName,
      u.phoneNumber as userPhone,
      u.email as userEmail,
      uc.fullName as createdByName
    FROM UserDelinquency ud
    INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId
    LEFT JOIN Users uc ON ud.delinquencyCreatedBy = uc.userUniqueId
    WHERE ud.userUniqueId = ?
    ORDER BY ud.delinquencyCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const [results] = await pool.query(sql, [userUniqueId, limit, offset]);

  // Get total count
  const [totalCountResult] = await pool.query("SELECT FOUND_ROWS() as total");
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit: parseInt(limit),
    },
  };
};

// Get delinquency statistics
const getUserDelinquencyStats = async () => {
  const statsQueries = [
    // Total delinquencies
    "SELECT COUNT(*) as totalDelinquencies FROM UserDelinquency",

    // Delinquencies by type
    "SELECT delinquencyType, COUNT(*) as count FROM UserDelinquency GROUP BY delinquencyType",

    // Recent delinquencies (last 30 days)
    "SELECT COUNT(*) as recentDelinquencies FROM UserDelinquency WHERE delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)",

    // Top users with most delinquencies
    `SELECT u.userUniqueId, u.fullName, u.phoneNumber, COUNT(*) as delinquencyCount 
     FROM UserDelinquency ud 
     INNER JOIN Users u ON ud.userUniqueId = u.userUniqueId 
     GROUP BY u.userUniqueId, u.fullName, u.phoneNumber 
     ORDER BY delinquencyCount DESC 
     LIMIT 10`,
  ];

  const [totalResult, typeResult, recentResult, topUsersResult] =
    await Promise.all(statsQueries.map((sql) => query(sql)));

  return {
    message: "success",
    data: {
      totalDelinquencies: totalResult[0].totalDelinquencies,
      delinquenciesByType: typeResult,
      recentDelinquencies: recentResult[0].recentDelinquencies,
      topUsersWithDelinquencies: topUsersResult,
    },
  };
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  getUserDelinquencyById,
  updateUserDelinquency,
  deleteUserDelinquency,
  getUserDelinquenciesByUser,
  getUserDelinquencyStats,
};
