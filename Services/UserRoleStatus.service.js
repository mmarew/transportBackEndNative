const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToAdmin,
} = require("../Utils/Notifications");
const { insertData } = require("../CRUD/Create/CreateData");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { usersRoles, USER_STATUS } = require("../Utils/ListOfSeedData");
const { transactionStorage } = require("../Utils/TransactionContext");
const messageTypes = require("../Utils/MessageTypes");
// Create UserRoleStatus
const createUserRoleStatus = async (body) => {
  const { statusId, userRoleId, userRoleStatusDescription, createdByUserId } =
    body;

  // Check if UserRoleStatus already exists in current
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleId },
  });

  if (existingUserRoleStatus.length > 0) {
    throw new AppError("Active UserRoleStatus already exists", 400);
  }

  // Insert new UserRoleStatus into the current table
  const userRoleStatusUniqueId = uuidv4();
  const newUserRoleStatus = {
    userRoleStatusUniqueId,
    statusId,
    userRoleId,
    userRoleStatusDescription,
    userRoleStatusCreatedAt: currentDate(),
    userRoleStatusCreatedBy: createdByUserId,
    isUserRoleStatusActive: true,
  };

  const result = await insertData({
    tableName: "UserRoleStatusCurrent",
    colAndVal: newUserRoleStatus,
  });

  return {
    message: "success",
    data: "UserRoleStatus created successfully",
    result,
  };
};

// Update UserRoleStatus and move old status to history
const updateUserRoleStatus = async (updateDataValues) => {
  const { user, roleId, newStatusId, phoneNumber } = updateDataValues;
  const updaterUserUniqueId = user?.userUniqueId;

  if (!newStatusId || !phoneNumber || !roleId) {
    throw new AppError("Missing required fields", 400);
  }
  const sql = `SELECT UserRoleStatusCurrent.* FROM UserRoleStatusCurrent,Statuses, UserRole,Users WHERE  UserRoleStatusCurrent.statusId = Statuses.statusId AND UserRole.userRoleId = UserRoleStatusCurrent.userRoleId AND Users.userUniqueId  = UserRole.userUniqueId AND Users.phoneNumber = ?  AND UserRole.roleId = ?`;

  const executor = transactionStorage.getStore() || pool;
  const [existingUserRoleStatus] = await executor.query(sql, [phoneNumber, roleId]);

  if (existingUserRoleStatus.length === 0) {
    throw new AppError("Active user role status not found", 404);
  }
  const userRoleStatusUniqueId =
    existingUserRoleStatus[0].userRoleStatusUniqueId;

  // Move current status to history
  await insertData({
    tableName: "UserRoleStatusHistory",
    colAndVal: {
      ...existingUserRoleStatus[0],
      userRoleStatusUpdatedBy: updaterUserUniqueId,
      userRoleStatusUpdatedAt: currentDate(),
    },
  });

  // Deactivate the current status in UserRoleStatusCurrent
  // Insert a new UserRoleStatus entry with the new status in current

  await updateData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
    updateValues: {
      statusId: newStatusId,
    },
  });
  // Handle the responses after the new status is created
  return await handleUpdateResponses({
    roleId,
    statusId: newStatusId,
    phoneNumber,
  });
};

// Handle responses when updating user role status
const handleUpdateResponses = async ({ roleId, statusId, phoneNumber }) => {
  // if user is driver(roleId ===2 ) and not attached docs and vehicle (statusId ==3)
  if (
    roleId === usersRoles.driverRoleId &&
    statusId === USER_STATUS.INACTIVE_REQUIRED_DOCUMENTS_MISSING
  ) {
    const driver = await getUserRoleStatusCurrent({
      data: { roleId, search: phoneNumber },
    });
    await sendSocketIONotificationToAdmin({
      message: {
        message: "success",
        request: "approve or reject driver's document",
        messageType: messageTypes?.accept_reject_driver_document,
        driver: driver?.data,
      },
      phoneNumber,
    });
  } else if (roleId === usersRoles.adminRoleId) {
    if (statusId === USER_STATUS.ACTIVE) {
      await sendSocketIONotificationToDriver({
        message: "success",
        request: "User document approved by admin",
        phoneNumber,
      });
    } else if (statusId === USER_STATUS.INACTIVE_DOCUMENTS_REJECTED) {
      await sendSocketIONotificationToDriver({
        message: "success",
        request: "User document rejected by admin",
        phoneNumber,
      });
    }
  }
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
      {
        table: "Statuses",
        on: "UserRoleStatusCurrent.statusId = Statuses.statusId",
      },
    ],
    conditions: {
      "UserRole.roleId": roleId,
      phoneNumber,
    },
  });
  return { message: "success", userData: userData };
};

// Delete UserRoleStatus (soft delete by moving to history)
const deleteUserRoleStatus = async (userRoleStatusUniqueId) => {
  // Check if the UserRoleStatus exists in current
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
  });

  if (existingUserRoleStatus.length === 0) {
    throw new AppError("UserRoleStatus not found", 404);
  }

  // Move current status to history before deletion
  await insertData({
    tableName: "UserRoleStatusHistory",
    colAndVal: {
      ...existingUserRoleStatus[0],
      userRoleStatusDeletedAt: currentDate(),
    },
  });

  // Soft delete in current (deactivate status)
  const result = await updateData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
    updateValues: { isUserRoleStatusActive: false },
  });

  return {
    message: "success",
    data: "UserRoleStatus deleted successfully",
    result,
  };
};

const userRoleStatusByPhone = async (phoneNumber) => {
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
    ],
    conditions: {
      // isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  return userData;
};
const getUserRoleStatusCurrent = async ({ data }) => {
  // Extract query parameters with default values
  const {
    page = 1,
    limit = 10,
    userRoleId,
    statusId,
    userRoleStatusCreatedBy,
    userRoleStatusCurrentVersion,
    userUniqueId,
    roleId,
    roleName,
    statusName,
    startDate,
    endDate,
    sortBy = "userRoleStatusCreatedAt",
    sortOrder = "DESC",
    search,
  } = data;

  // Calculate pagination
  const offset = (page - 1) * limit;

  // Build WHERE clause based on filters
  let whereConditions = ["1 = 1"];
  let queryParams = [];

  // SEARCH BLOCK - Search across multiple user and role fields
  if (search) {
    whereConditions.push(`(
    u.fullName LIKE ? OR 
    u.phoneNumber LIKE ? OR 
    u.email LIKE ? OR
    r.roleName LIKE ? OR
    s.statusName LIKE ? OR
    uc.fullName LIKE ? OR
    ursc.userRoleStatusDescription LIKE ?
  )`);

    const searchPattern = `%${search}%`;
    // Add the same pattern for all 7 search conditions
    queryParams.push(
      searchPattern, // u.fullName
      searchPattern, // u.phoneNumber
      searchPattern, // u.email
      searchPattern, // r.roleName
      searchPattern, // s.statusName
      searchPattern, // uc.fullName (created by user name)
      searchPattern, // ursc.userRoleStatusDescription
    );
  }

  if (userRoleId) {
    whereConditions.push("ursc.userRoleId = ?");
    queryParams.push(userRoleId);
  }

  if (statusId) {
    whereConditions.push("ursc.statusId = ?");
    queryParams.push(statusId);
  }

  if (userRoleStatusCreatedBy) {
    whereConditions.push("ursc.userRoleStatusCreatedBy = ?");
    queryParams.push(userRoleStatusCreatedBy);
  }

  if (userRoleStatusCurrentVersion) {
    whereConditions.push("ursc.userRoleStatusCurrentVersion = ?");
    queryParams.push(userRoleStatusCurrentVersion);
  }

  if (userUniqueId) {
    whereConditions.push("ur.userUniqueId = ?");
    queryParams.push(userUniqueId);
  }

  if (roleId) {
    whereConditions.push("ur.roleId = ?");
    queryParams.push(roleId);
  }

  if (roleName) {
    whereConditions.push("r.roleName LIKE ?");
    queryParams.push(`%${roleName}%`);
  }

  if (statusName) {
    whereConditions.push("s.statusName LIKE ?");
    queryParams.push(`%${statusName}%`);
  }

  if (startDate) {
    whereConditions.push("ursc.userRoleStatusCreatedAt >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("ursc.userRoleStatusCreatedAt <= ?");
    queryParams.push(endDate);
  }

  // Validate sort order
  const validSortOrders = ["ASC", "DESC"];
  const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
    ? sortOrder.toUpperCase()
    : "DESC";

  // Build the main query with joins to get related data
  const baseQuery = `
      SELECT 
        ursc.*,
        ur.userUniqueId,
        ur.roleId,
        ur.userRoleUniqueId,
        u.fullName  ,
        u.phoneNumber  ,
        u.email,
        r.roleName,
        r.roleDescription,
        s.statusName,
        s.statusDescription,
        uc.fullName as createdByName
      FROM UserRoleStatusCurrent ursc
      INNER JOIN UserRole ur ON ursc.userRoleId = ur.userRoleId
      INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
      INNER JOIN Roles r ON ur.roleId = r.roleId
      INNER JOIN Statuses s ON ursc.statusId = s.statusId
      LEFT JOIN Users uc ON ursc.userRoleStatusCreatedBy = uc.userUniqueId
      WHERE ${whereConditions.join(" AND ")}
    `;

  // Count query for pagination
  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;

  // Data query with pagination and sorting
  const dataQuery = `
      ${baseQuery}
      ORDER BY ursc.${sortBy} ${finalSortOrder}
      LIMIT ? OFFSET ?
    `;

  // Add pagination parameters
  queryParams.push(parseInt(limit), offset);

  // Execute queries
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countQuery, queryParams.slice(0, -2));
  const [results] = await executor.query(dataQuery, queryParams);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  // Prepare response
  const response = {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages: totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    filters: {
      userRoleId,
      statusId,
      userRoleStatusCreatedBy,
      userRoleStatusCurrentVersion,
      userUniqueId,
      roleId,
      roleName,
      statusName,
      startDate,
      endDate,
      sortBy,
      sortOrder: finalSortOrder,
    },
  };

  return response;
};

module.exports = {
  getUserRoleStatusCurrent,
  userRoleStatusByPhone,
  createUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
