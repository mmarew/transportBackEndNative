"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  getData
} = require("../../../CRUD/Read/ReadData");




const AppError = require("../../../Utils/AppError");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const { PAGINATION } = require("../../../Utils/Constants");








const getUserByUserUniqueId = async userUniqueId => {
  const user = await getData({
    tableName: "Users",
    conditions: {
      userUniqueId: userUniqueId,
      isDeleted: 0
    }
  });
  if (!user || user.length === 0) {
    throw new AppError("User not found", AppError.NOT_FOUND);
  }
  return {
    message: "Users list fetched",
    data: user[0]
  };
};

const getUsersByRoleUniqueId = async (roleUniqueId, page = 1, limit = 10, search = "", connection = null) => {
  const offset = (page - 1) * limit;
  const wildcardQuery = `%${search}%`;

  // Count query
  const countSql = `
    SELECT COUNT(*) AS total
    FROM Users u
    INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Statuses s ON ursc.statusId = s.statusId
    WHERE r.roleUniqueId = ? 
    AND (u.isDeleted = 0 OR u.isDeleted IS NULL)
    ${search ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)" : ""}
  `;
  const executor = transactionStorage.getStore() || connection || pool;
  const [countRows] = await executor.query(countSql, search ? [roleUniqueId, wildcardQuery, wildcardQuery, wildcardQuery] : [roleUniqueId]);
  const total = countRows[0].total;

  // Data query
  const sql = `
    SELECT 
      u.userUniqueId,
      u.fullName,
      u.email,
      u.phoneNumber,
      r.roleName,
      ursc.statusId,
      s.statusName,
      ur.userRoleId,
      ur.userRoleCreatedAt
    FROM Users u
    INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Statuses s ON ursc.statusId = s.statusId
    WHERE r.roleUniqueId = ?
    AND (u.isDeleted = 0 OR u.isDeleted IS NULL)
    ${search ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)" : ""}
    ORDER BY u.userCreatedAt DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await executor.query(sql, search ? [roleUniqueId, wildcardQuery, wildcardQuery, wildcardQuery, limit, offset] : [roleUniqueId, limit, offset]);
  return {
    message: "Users list fetched",
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit)
    },
    data: rows || []
  };
};

const getUserByFilterDetailed = async (filters = {}, page = 1, limit = 10, connection = null) => {
  // Normalize pagination
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(PAGINATION.MAX_PAGE_SIZE, parseInt(limit) || PAGINATION.DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const whereParts = [];
  const params = [];
  const exactMatch = filters.exactMatch === true;

  // User-level filters
  if (filters.userUniqueId) {
    whereParts.push(`Users.userUniqueId = ?`);
    params.push(filters.userUniqueId);
  }
  if (filters.phoneNumber) {
    if (exactMatch) {
      whereParts.push(`Users.phoneNumber = ?`);
      params.push(filters.phoneNumber);
    } else {
      whereParts.push(`Users.phoneNumber LIKE ?`);
      params.push(`%${filters.phoneNumber}%`);
    }
  }
  if (filters.email) {
    if (exactMatch) {
      whereParts.push(`Users.email = ?`);
      params.push(filters.email);
    } else {
      whereParts.push(`Users.email LIKE ?`);
      params.push(`%${filters.email}%`);
    }
  }
  if (filters.fullName) {
    whereParts.push(`Users.fullName LIKE ?`);
    params.push(`%${filters.fullName}%`);
  }
  if (filters.search) {
    whereParts.push(`(Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ?)`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.createdAt) {
    if (filters.createdAt.start && filters.createdAt.end) {
      whereParts.push(`Users.userCreatedAt BETWEEN ? AND ?`);
      params.push(filters.createdAt.start, filters.createdAt.end);
    } else {
      whereParts.push(`DATE(Users.userCreatedAt) = ?`);
      params.push(filters.createdAt);
    }
  }

  // Role/status filters
  if (filters.roleId) {
    whereParts.push(`UserRole.roleId = ?`);
    params.push(filters.roleId);
  }
  if (filters.roleUniqueId) {
    whereParts.push(`Roles.roleUniqueId = ?`);
    params.push(filters.roleUniqueId);
  }
  if (filters.statusId) {
    whereParts.push(`UserRoleStatusCurrent.statusId = ?`);
    params.push(filters.statusId);
  }

  // Exclude deleted users unless explicitly requested (e.g. admin listing deleted)
  const includeDeleted = filters.includeDeleted === true || filters.includeDeleted === "true";
  if (!includeDeleted) {
    whereParts.push(`(Users.isDeleted = 0 OR Users.isDeleted IS NULL)`);
  }
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
  const sql = `
  SELECT DISTINCT Users.*, 
    UserRole.userRoleId, UserRole.userRoleUniqueId, UserRole.roleId,
    UserRole.userRoleCreatedBy, UserRole.userRoleCreatedAt,
    
    Roles.roleUniqueId, Roles.roleName, Roles.roleDescription,
    
    UserRoleStatusCurrent.userRoleStatusId, UserRoleStatusCurrent.userRoleStatusUniqueId,
    UserRoleStatusCurrent.statusId, UserRoleStatusCurrent.userRoleStatusDescription,
    UserRoleStatusCurrent.userRoleStatusCreatedAt, UserRoleStatusCurrent.userRoleStatusCurrentVersion,
    UserRoleStatusCurrent.userRoleStatusCreatedBy,
    
    Statuses.statusName, Statuses.statusDescription,
    
    BannedUsers.banUniqueId,
    BannedUsers.isActive as banIsActive
    
  FROM Users
  LEFT JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL
  LEFT JOIN Roles ON UserRole.roleId = Roles.roleId
  LEFT JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
  LEFT JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    LEFT JOIN BannedUsers ON Users.userUniqueId = BannedUsers.userUniqueId AND BannedUsers.roleId = UserRole.roleId AND BannedUsers.isActive = 1
    ${whereClause}
    ORDER BY Users.userCreatedAt DESC
    LIMIT ? OFFSET ?
  `;
  //  count SQL
  const countSql = `
    SELECT COUNT(DISTINCT Users.userUniqueId) AS totalCount
    FROM Users
    LEFT JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL
    LEFT JOIN Roles ON UserRole.roleId = Roles.roleId
    LEFT JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
    LEFT JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    LEFT JOIN BannedUsers ON Users.userUniqueId = BannedUsers.userUniqueId AND BannedUsers.roleId = UserRole.roleId AND BannedUsers.isActive = 1
    ${whereClause}
  `;
  const executor = connection || pool;
  const [rowsResult, countResult] = await Promise.all([executor.query(sql, [...params, limit, offset]), executor.query(countSql, params)]);
  const [rows] = rowsResult;
  const [countRows] = countResult;
  const usersMap = new Map();
  rows.forEach(row => {
    const userUniqueId = row.userUniqueId;
    if (!usersMap.has(userUniqueId)) {
      // Initialize user with the structure you want
      usersMap.set(userUniqueId, {
        user: {
          userId: row.userId,
          userUniqueId: row.userUniqueId,
          fullName: row.fullName,
          phoneNumber: row.phoneNumber,
          email: row.email,
          userCreatedAt: row.userCreatedAt,
          userCreatedBy: row.userCreatedBy,
          userDeletedAt: row.userDeletedAt,
          isDeleted: row.isDeleted,
          userDeletedBy: row.userDeletedBy,
          isPhoneVerified: row.isPhoneVerified,
          isEmailVerified: row.isEmailVerified
        },
        rolesAndStatuses: [],
        banUniqueId: null // Will be set if any role has a ban
      });
    }
    const userEntry = usersMap.get(userUniqueId);

    // Add role and status information
    if (row.userRoleId) {
      userEntry.rolesAndStatuses.push({
        userRoles: {
          userRoleId: row.userRoleId,
          userRoleUniqueId: row.userRoleUniqueId,
          roleId: row.roleId,
          roleName: row.roleName,
          banUniqueId: row.banUniqueId // Add banUniqueId to userRoles
        },
        userRoleStatuses: row.userRoleStatusId ? {
          statusId: row.statusId,
          statusName: row.statusName,
          userRoleStatusUniqueId: row.userRoleStatusUniqueId
        } : null
      });

      // Set the overall banUniqueId for the user if any role is banned
      if (row.banUniqueId && !userEntry.banUniqueId) {
        userEntry.banUniqueId = row.banUniqueId;
      }
    }
  });

  // Convert map to array
  const transformedData = Array.from(usersMap.values());
  const totalCount = countRows[0].totalCount || 0;
  const totalPages = Math.ceil(totalCount / limit);
  const paginationInfo = {
    currentPage: page,
    limit: limit,
    totalItems: totalCount,
    totalPages,
  };
  return {
    message: transformedData.length > 0 ? "success" : "No users found",
    data: transformedData,
    pagination: paginationInfo
  };
};

module.exports = {
  getUserByUserUniqueId,
  getUsersByRoleUniqueId,
  getUserByFilterDetailed
};
