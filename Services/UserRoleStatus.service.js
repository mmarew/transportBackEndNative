const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendSocketIONotificationToDriver,
  sendNotificationToAdmin,
} = require("../Utils/Notifications");
const { insertData } = require("../CRUD/Create/CreateData");
const { pool } = require("../Middleware/Database.config");
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
    return { message: "error", data: "Active UserRoleStatus already exists" };
  }

  // Insert new UserRoleStatus into the current table
  const userRoleStatusUniqueId = uuidv4();
  const newUserRoleStatus = {
    userRoleStatusUniqueId,
    statusId,
    userRoleId,
    userRoleStatusDescription,
    userRoleStatusCreatedAt: new Date(),
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

// Get UserRoleStatus by unique ID
const getUserRoleStatus = async (body) => {
  const { phoneNumber, roleId } = body;
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        // userUniqueId=c36b8be2-64c8-49bf-82f8-27ec7e2313a6
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        // userRoleId=2
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
  return userData;
};

// Update UserRoleStatus and move old status to history
const updateUserRoleStatus = async (updateDataValues) => {
  try {
    console.log("@updateUserRoleStatus updateDataValues", updateDataValues);
    const { user, roleId, newStatusId, phoneNumber, userUniqueId } =
      updateDataValues;
    const updaterUserUniqueId = user?.userUniqueId;

    if (!newStatusId || !phoneNumber || !roleId) {
      return { message: "error", data: "Missing required fields" };
    }
    const sql = `SELECT UserRoleStatusCurrent.* FROM UserRoleStatusCurrent,Statuses, UserRole,Users WHERE  UserRoleStatusCurrent.statusId = Statuses.statusId AND UserRole.userRoleId = UserRoleStatusCurrent.userRoleId AND Users.userUniqueId  = UserRole.userUniqueId AND Users.phoneNumber = ?  AND UserRole.roleId = ?`;

    const [existingUserRoleStatus] = await pool.query(sql, [
      phoneNumber,
      roleId,
    ]);
    console.log("@existingUserRoleStatus", existingUserRoleStatus);
    // return;

    if (existingUserRoleStatus.length === 0) {
      return { message: "error", data: "Active user role status not found" };
    }
    const userRoleStatusUniqueId = await existingUserRoleStatus[0]
      .userRoleStatusUniqueId;

    // Move current status to history
    await insertData({
      tableName: "UserRoleStatusHistory",
      colAndVal: {
        ...existingUserRoleStatus[0],
        userRoleStatusUpdatedBy: updaterUserUniqueId,
        userRoleStatusUpdatedAt: new Date(),
      },
    });

    // Deactivate the current status in UserRoleStatusCurrent
    // const resultOfDeletedUserRoleStatus = await deleteData({
    //   tableName: "UserRoleStatusCurrent",
    //   conditions: { userRoleStatusUniqueId },
    // });
    // console.log("resultOfDeletedUserRoleStatus", resultOfDeletedUserRoleStatus);
    // Insert a new UserRoleStatus entry with the new status in current

    const resultOfUpdatedUserRoleStatus = await updateData({
      tableName: "UserRoleStatusCurrent",
      conditions: { userRoleStatusUniqueId },
      updateValues: {
        statusId: newStatusId,
      },
    });
    console.log("resultOfUpdatedUserRoleStatus", resultOfUpdatedUserRoleStatus);
    // const newUserRoleStatusResult = await insertData({
    //   tableName: "UserRoleStatusCurrent",
    //   colAndVal: newUserRoleStatus,
    // });
    // console.log("newUserRoleStatusResult", newUserRoleStatusResult);
    // Handle the responses after the new status is created
    return await handleUpdateResponces({
      roleId,
      statusId: newStatusId,
      phoneNumber,
    });
  } catch (error) {
    console.log("Error in updateUserRoleStatus:", error);
    return {
      message: "error",
      error: "An error occurred while updating UserRoleStatus",
    };
  }
};

// Handle responses when updating user role status
const handleUpdateResponces = async ({ roleId, statusId, phoneNumber }) => {
  try {
    // if user is driver(roleId == 2 ) and not attached docs and vehicle (statusId ==3)
    if (roleId == 2 && statusId == 3) {
      const driver = await getUserRoleStatus({ roleId, phoneNumber });
      await sendNotificationToAdmin({
        message: {
          message: "success",
          request: "approve or reject driver's document",
          driver,
        },
        phoneNumber,
      });
    } else if (roleId == 3) {
      if (statusId == 1) {
        await sendSocketIONotificationToDriver({
          message: "success",
          request: "User document approved by admin",
          phoneNumber,
        });
      } else if (statusId == 4) {
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
  } catch (error) {
    console.log("Error in handleUpdateResponces:", error);
    return {
      message: "error",
      error: "An error occurred while handling responses",
    };
  }
};

// Delete UserRoleStatus (soft delete by moving to history)
const deleteUserRoleStatus = async (userRoleStatusUniqueId) => {
  // Check if the UserRoleStatus exists in current
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
  });

  if (existingUserRoleStatus.length === 0) {
    return { message: "error", data: "UserRoleStatus not found" };
  }

  // Move current status to history before deletion
  await insertData({
    tableName: "UserRoleStatusHistory",
    colAndVal: {
      ...existingUserRoleStatus[0],
      userRoleStatusDeletedAt: new Date(),
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
      isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  return userData;
};
const getUserRoleStatusCurrent = async ({ data }) => {
  try {
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
    } = data;

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Build WHERE clause based on filters
    let whereConditions = ["1 = 1"];
    let queryParams = [];

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
    const [countResult] = await pool.query(
      countQuery,
      queryParams.slice(0, -2)
    );
    const [results] = await pool.query(dataQuery, queryParams);

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
  } catch (error) {
    console.error("Error fetching user role status current:", error);
    return {
      message: "error",
      error: "error on fetching user role status current",
    };
  }
};
module.exports = {
  getUserRoleStatusCurrent,
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};

// // Additional method to get user role status by user UUID
// const getUserRoleStatusByUser = async (req, res) => {
//   try {
//     const { userUniqueId } = req.params;
//     const { roleId, statusId, includeHistory = false } = req.query;

//     let whereConditions = ['ur.userUniqueId = ?'];
//     let queryParams = [userUniqueId];

//     if (roleId) {
//       whereConditions.push('ur.roleId = ?');
//       queryParams.push(roleId);
//     }

//     if (statusId) {
//       whereConditions.push('ursc.statusId = ?');
//       queryParams.push(statusId);
//     }

//     const query = `
//       SELECT
//         ursc.*,
//         ur.userUniqueId,
//         ur.roleId,
//         u.fullName as userName,
//         u.phoneNumber as userPhone,
//         u.email as userEmail,
//         r.roleName,
//         r.roleDescription,
//         s.statusName,
//         s.statusDescription,
//         uc.fullName as createdByName
//       FROM UserRoleStatusCurrent ursc
//       INNER JOIN UserRole ur ON ursc.userRoleId = ur.userRoleId
//       INNER JOIN Users u ON ur.userUniqueId = u.userUniqueId
//       INNER JOIN Roles r ON ur.roleId = r.roleId
//       INNER JOIN Statuses s ON ursc.statusId = s.statusId
//       LEFT JOIN Users uc ON ursc.userRoleStatusCreatedBy = uc.userUniqueId
//       WHERE ${whereConditions.join(' AND ')}
//       ORDER BY ursc.userRoleStatusCreatedAt DESC
//     `;

//     const [results] = await db.execute(query, queryParams);

//     let responseData = { currentStatus: results };

//     // Include history if requested
//     if (includeHistory === 'true' && results.length > 0) {
//       const userRoleIds = results.map(item => item.userRoleId);
//       const placeholders = userRoleIds.map(() => '?').join(',');

//       const historyQuery = `
//         SELECT
//           ursh.*,
//           s.statusName,
//           s.statusDescription,
//           uc.fullName as createdByName,
//           uu.fullName as updatedByName,
//           ud.fullName as deletedByName
//         FROM UserRoleStatusHistory ursh
//         INNER JOIN Statuses s ON ursh.statusId = s.statusId
//         LEFT JOIN Users uc ON ursh.userRoleStatusCreatedBy = uc.userUniqueId
//         LEFT JOIN Users uu ON ursh.userRoleStatusUpdatedBy = uu.userUniqueId
//         LEFT JOIN Users ud ON ursh.userRoleStatusDeletedBy = ud.userUniqueId
//         WHERE ursh.userRoleId IN (${placeholders})
//         ORDER BY ursh.userRoleStatusCreatedAt DESC
//       `;

//       const [historyResults] = await db.execute(historyQuery, userRoleIds);
//       responseData.history = historyResults;
//     }

//     res.json({
//       success: true,
//       data: responseData
//     });

//   } catch (error) {
//     console.error('Error fetching user role status by user:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//   }
// };

// // Method to get user role status statistics
// const getUserRoleStatusStats = async (req, res) => {
//   try {
//     const { roleId, statusId } = req.query;

//     let whereConditions = ['1 = 1'];
//     let queryParams = [];

//     if (roleId) {
//       whereConditions.push('ur.roleId = ?');
//       queryParams.push(roleId);
//     }

//     if (statusId) {
//       whereConditions.push('ursc.statusId = ?');
//       queryParams.push(statusId);
//     }

//     const statsQuery = `
//       SELECT
//         r.roleName,
//         s.statusName,
//         COUNT(*) as count
//       FROM UserRoleStatusCurrent ursc
//       INNER JOIN UserRole ur ON ursc.userRoleId = ur.userRoleId
//       INNER JOIN Roles r ON ur.roleId = r.roleId
//       INNER JOIN Statuses s ON ursc.statusId = s.statusId
//       WHERE ${whereConditions.join(' AND ')}
//       GROUP BY r.roleName, s.statusName
//       ORDER BY r.roleName, s.statusName
//     `;

//     const [results] = await db.execute(statsQuery, queryParams);

//     // Transform to more usable format
//     const stats = results.reduce((acc, row) => {
//       if (!acc[row.roleName]) {
//         acc[row.roleName] = {};
//       }
//       acc[row.roleName][row.statusName] = row.count;
//       return acc;
//     }, {});

//     res.json({
//       success: true,
//       data: stats,
//       total: results.reduce((sum, row) => sum + parseInt(row.count), 0)
//     });

//   } catch (error) {
//     console.error('Error fetching user role status stats:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//   }
// };

// module.exports = {
//   getUserRoleStatusCurrent,
//   getUserRoleStatusByUser,
//   getUserRoleStatusStats
// };
