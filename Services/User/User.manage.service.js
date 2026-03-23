"use strict";

const { pool } = require("../../Middleware/Database.config");
const { getData } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { currentDate } = require("../../Utils/CurrentDate");
const { deleteFile } = require("../../Utils/FileUtils");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { USER_STATUS, statusList } = require("../../Utils/ListOfSeedData");
const createJWT = require("../../Utils/CreateJWT");
const { isPlaceholderEmail } = require("../../Utils/GetPlaceholderEmail");

const getUserByUserUniqueId = async (userUniqueId) => {
  const user = await getData({
    tableName: "Users",
    conditions: { userUniqueId: userUniqueId, isDeleted: 0 },
  });
  if (!user || user.length === 0) {
    throw new AppError("User not found", 404);
  }
  return { message: "success", data: user[0] };
};

const getUsersByRoleUniqueId = async (
  roleUniqueId,
  page = 1,
  limit = 10,
  search = "",
  connection = null,
) => {
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
    ${
  search
    ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)"
    : ""
}
  `;

  const executor = transactionStorage.getStore() || connection || pool;
  const [countRows] = await executor.query(
    countSql,
    search
      ? [roleUniqueId, wildcardQuery, wildcardQuery, wildcardQuery]
      : [roleUniqueId],
  );
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
    ${
  search
    ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)"
    : ""
}
    ORDER BY u.userCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await executor.query(
    sql,
    search
      ? [
        roleUniqueId,
        wildcardQuery,
        wildcardQuery,
        wildcardQuery,
        limit,
        offset,
      ]
      : [roleUniqueId, limit, offset],
  );

  return {
    message: "success",
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: rows || [],
  };
};

const getUserByFilterDetailed = async (
  filters = {},
  page = 1,
  limit = 10,
  connection = null,
) => {
  // Normalize pagination
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(100, parseInt(limit) || 10));
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const whereParts = [];
  const params = [];

  // User-level filters
  if (filters.userUniqueId) {
    whereParts.push(`Users.userUniqueId = ?`);
    params.push(filters.userUniqueId);
  }

  if (filters.phoneNumber) {
    whereParts.push(`Users.phoneNumber LIKE ?`);
    params.push(`%${filters.phoneNumber}%`);
  }
  if (filters.email) {
    whereParts.push(`Users.email LIKE ?`);
    params.push(`%${filters.email}%`);
  }
  if (filters.fullName) {
    whereParts.push(`Users.fullName LIKE ?`);
    params.push(`%${filters.fullName}%`);
  }
  if (filters.search) {
    whereParts.push(
      `(Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ?)`,
    );
    params.push(
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
    );
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
  const includeDeleted =
    filters.includeDeleted === true || filters.includeDeleted === "true";
  if (!includeDeleted) {
    whereParts.push(`(Users.isDeleted = 0 OR Users.isDeleted IS NULL)`);
  }

  const whereClause =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

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
    LEFT JOIN UserDelinquency ON Users.userUniqueId = UserDelinquency.userUniqueId AND UserDelinquency.roleId = UserRole.roleId
    LEFT JOIN BannedUsers ON UserDelinquency.userDelinquencyUniqueId = BannedUsers.userDelinquencyUniqueId AND BannedUsers.isActive = 1
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
    LEFT JOIN UserDelinquency ON Users.userUniqueId = UserDelinquency.userUniqueId AND UserDelinquency.roleId = UserRole.roleId
    LEFT JOIN BannedUsers ON UserDelinquency.userDelinquencyUniqueId = BannedUsers.userDelinquencyUniqueId AND BannedUsers.isActive = 1
    ${whereClause}
  `;
  const executor = connection || pool;
  const [rowsResult, countResult] = await Promise.all([
    executor.query(sql, [...params, limit, offset]),
    executor.query(countSql, params),
  ]);

  const [rows] = rowsResult;
  const [countRows] = countResult;

  const usersMap = new Map();

  rows.forEach((row) => {
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
          isEmailVerified: row.isEmailVerified,
        },
        rolesAndStatuses: [],
        banUniqueId: null, // Will be set if any role has a ban
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
          banUniqueId: row.banUniqueId, // Add banUniqueId to userRoles
        },
        userRoleStatuses: row.userRoleStatusId
          ? {
            statusId: row.statusId,
            statusName: row.statusName,
            userRoleStatusUniqueId: row.userRoleStatusUniqueId,
          }
          : null,
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
    itemsPerPage: limit,
    totalItems: totalCount,
    totalPages,
    offset,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
    startItem: totalCount > 0 ? offset + 1 : 0,
    endItem: Math.min(offset + limit, totalCount),
  };

  return {
    message: transformedData.length > 0 ? "success" : "No users found",
    data: transformedData,
    pagination: paginationInfo,
  };
};

const updateUser = async (body) => {
  const { userUniqueId, fullName, phoneNumber, email, roleId, statusId } = body;

  // Validate required field
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required", 400);
  }

  // Fetch current user details to compare contact info
  const [currentUser] = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  if (!currentUser) {
    throw new AppError("User not found", 404);
  }

  const updateValues = {};
  const errors = [];

  // Check if email is reserved by another user
  if (email) {
    // if email is placeholder email, skip the check
    const isEmailPlaceholder = isPlaceholderEmail(email);
    if (!isEmailPlaceholder) {
      const userDataByEmail = await getData({
        tableName: "Users",
        conditions: { email },
      });

      if (userDataByEmail?.length > 0) {
        const savedEmail = userDataByEmail?.[0].email;
        const isSavedEmailPlaceholder = isPlaceholderEmail(savedEmail);
        //if email is provided and previously savedEmail is placeholder but current email is not placeholder, then update the email
        if (isSavedEmailPlaceholder) {
          updateValues.email = email;
        }
        // Check if the found user is different from the current user
        if (userDataByEmail?.[0].userUniqueId !== userUniqueId) {
          errors.push("Email already exists");
        } else {
          // Same user, can update email
          updateValues.email = email;
        }
      } else {
        // Email doesn't exist in the system, can update
        updateValues.email = email;
      }
    }
  }

  // Check if phone number is reserved by another user
  if (phoneNumber) {
    const userDataByPhoneNumber = await getData({
      tableName: "Users",
      conditions: { phoneNumber },
    });

    if (userDataByPhoneNumber?.length > 0) {
      //check if email is placeHolder
      const savedEmail = userDataByPhoneNumber?.[0].email;
      const isEmailPlaceholder = isPlaceholderEmail(savedEmail);
      //if email is provided and previously savedEmail is placeholder but current email is not placeholder, then update the email
      if (email && isEmailPlaceholder && !isPlaceholderEmail(email)) {
        updateValues.email = email;
      }

      // Check if the found user is different from the current user
      if (userDataByPhoneNumber?.[0].userUniqueId !== userUniqueId) {
        errors.push("Phone number already exists");
      } else {
        // Same user, can update phone number
        updateValues.phoneNumber = phoneNumber;
      }
    } else {
      // Phone number doesn't exist in the system, can update
      updateValues.phoneNumber = phoneNumber;
    }
  }

  // Return errors if any
  if (errors.length > 0) {
    throw new AppError(errors.join(", "), 409);
  }

  // Optional fields for update
  if (fullName) {
    updateValues.fullName = fullName;
  }

  // Reset verification flags if contact info has changed
  if (updateValues.email && updateValues.email !== currentUser.email) {
    updateValues.isEmailVerified = 0;
  }
  if (
    updateValues.phoneNumber &&
    updateValues.phoneNumber !== currentUser.phoneNumber
  ) {
    updateValues.isPhoneVerified = 0;
  }

  // Update the user's information if there are any fields to update
  if (Object.keys(updateValues).length > 0) {
    const updateUserResult = await updateData({
      tableName: "Users",
      updateValues,
      conditions: { userUniqueId },
    });

    if (updateUserResult.affectedRows <= 0) {
      throw new AppError("Failed to update user details", 500);
    }
  }

  // Fetch the latest user info to get verification flags and mandatory fields for JWT
  const [updatedUser] = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  // Also catch the role from UserRole if not provided in body
  let effectiveRoleId = roleId;
  if (!effectiveRoleId) {
    const roles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId },
    });
    effectiveRoleId = roles?.[0]?.roleId;
  }

  // Create new token with updated information
  const tokenData = createJWT({
    userUniqueId,
    fullName: fullName || updatedUser?.fullName,
    phoneNumber: phoneNumber || updatedUser?.phoneNumber,
    email: email || updatedUser?.email,
    roleId: effectiveRoleId,
    statusId: statusId || updatedUser?.statusId,
    isPhoneVerified: !!updatedUser?.isPhoneVerified,
    isEmailVerified: !!updatedUser?.isEmailVerified,
  });

  if (tokenData.message === "error") {
    throw new AppError(tokenData.error || "Token creation failed", 500);
  }

  return {
    token: tokenData.token,
    message: "success",
    data: "User updated successfully",
  };
};

const deleteUser = async (
  { userUniqueId, deletedBy, retainFiles = true },
  connection = null,
) => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required to delete user", 400);
  }
  const userDeletedAt = currentDate();
  const isDeleted = true;
  const sql =
    "UPDATE Users SET userDeletedAt = ?, userDeletedBy = ?, isDeleted = ? WHERE userUniqueId = ?";
  const values = [userDeletedAt, deletedBy, isDeleted, userUniqueId];

  const executor = transactionStorage.getStore() || connection || pool;
  const [deleteResults] = await executor.query(sql, values);

  if (deleteResults.affectedRows === 0) {
    throw new AppError("User not found or already deleted", 404);
  }

  // Ensure status 8 (ACCOUNT_DELETED) exists for FK, then set all this user's role statuses to it
  const statusDeleted = statusList.find(
    (s) => s.statusId === USER_STATUS.ACCOUNT_DELETED,
  );
  if (statusDeleted) {
    const {
      statusId: sid,
      statusUniqueId,
      statusName,
      statusDescription,
    } = statusDeleted;
    await executor.query(
      `INSERT INTO Statuses (statusId, statusUniqueId, statusName, statusDescription, statusCreatedBy, statusCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE statusName = VALUES(statusName), statusDescription = VALUES(statusDescription)`,
      [
        sid,
        statusUniqueId,
        statusName,
        statusDescription,
        deletedBy,
        currentDate(),
      ],
    );
    await executor.query(
      `UPDATE UserRoleStatusCurrent SET statusId = ? WHERE userRoleId IN (SELECT userRoleId FROM UserRole WHERE userUniqueId = ?)`,
      [USER_STATUS.ACCOUNT_DELETED, userUniqueId],
    );
  }

  if (retainFiles === false) {
    const documents = await getData({
      tableName: "AttachedDocuments",
      conditions: { userUniqueId },
      connection: executor,
    });
    for (const doc of documents || []) {
      if (doc.attachedDocumentName) {
        try {
          deleteFile(doc.attachedDocumentName);
        } catch (err) {
          logger.warn("deleteUser: failed to delete file", {
            attachedDocumentUniqueId: doc.attachedDocumentUniqueId,
            error: err?.message,
          });
        }
      }
      const {
        deleteData: deleteDataFunc,
      } = require("../../CRUD/Delete/DeleteData"); // Safer import
      await deleteDataFunc({
        tableName: "AttachedDocuments",
        conditions: { attachedDocumentUniqueId: doc.attachedDocumentUniqueId },
      });
    }
  }

  return {
    message: "success",
    data: "user deleted successfully",
  };
};

module.exports = {
  getUserByUserUniqueId,
  getUsersByRoleUniqueId,
  getUserByFilterDetailed,
  updateUser,
  deleteUser,
};
