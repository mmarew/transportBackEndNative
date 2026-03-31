const {
  performJoinSelect,
  getCancellationDetails,
} = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Helper function for database queries
const query = async (sql, values = []) => {
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  return result;
};

// Helper function to get journey data by context type
const getJourneyDataByContextType = async ({ contextType, contextId }) => {
  const dataHandlers = {
    JourneyDecisions: async () => {
      const [passengerData, driverData] = await Promise.all([
        getPassengerDataByJourneyDecision(contextId),
        getDriverDataByJourneyDecision(contextId),
      ]);
      return { driver: driverData, passenger: passengerData };
    },
    Journey: async () => {
      const [passengerData, driverData] = await Promise.all([
        getPassengerDataByJourney(contextId),
        getDriverDataByJourney(contextId),
      ]);
      return { driver: driverData, passenger: passengerData };
    },
    DriverRequest: async () => {
      const driverData = await getDriverRequest(contextId);
      return { driver: driverData, passenger: null };
    },
    PassengerRequest: async () => {
      const passengerData = await getPassengerRequest(contextId);
      return { driver: null, passenger: passengerData };
    },
  };

  const handler = dataHandlers[contextType];
  if (!handler) {
    throw new Error(`Unsupported context type: ${contextType}`);
  }

  const data = await handler();
  return { ...data, contextType };
};

// Create a new canceled journey
const createCanceledJourney = async (data) => {
  const {
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime,
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
  } = data;

  const canceledJourneyUniqueId = uuidv4();
  const sql = `
    INSERT INTO CanceledJourneys (
      canceledJourneyUniqueId, contextId, contextType, canceledBy, 
      cancellationReasonsTypeId, canceledTime, roleId, 
      driverUserUniqueId, passengerUserUniqueId,
      canceledJourneyCreatedBy, canceledJourneyCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    canceledJourneyUniqueId,
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime || currentDate(),
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
    canceledBy,
    currentDate(),
  ];

  await query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);

  return {
    message: "success",
    data: {
      canceledJourneyId: canceledJourneyUniqueId,
      cancellationDetails,
    },
  };
};

// UNIFIED FILTER SERVICE - Handles all filtering scenarios
// const getCanceledJourneyByFilter = async (filters = {}) => {
//   try {
//     // Extract and sanitize parameters
//     const {
//       page = 1,
//       limit = 10,
//       contextType,
//       roleId,
//       cancellationReasonsTypeId,
//       canceledBy,
//       userUniqueId,
//       isSeenByAdmin,
//       startDate,
//       endDate,
//       search, // New search parameter
//       sortBy = "canceledTime",
//       sortOrder = "DESC",
//     } = filters;

//     // Sanitize inputs
//     const safePage = Math.max(1, parseInt(page));
//     const safeLimit = Math.min(Math.max(1, parseInt(limit)), 100);
//     const offset = (safePage - 1) * safeLimit;

//     // Allowed sort columns
//     const allowedSortBy = [
//       "canceledTime",
//       "canceledJourneyId",
//       "roleId",
//       "cancellationReasonsTypeId",
//     ];
//     const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : "canceledTime";
//     const finalSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
//       ? sortOrder.toUpperCase()
//       : "DESC";

//     // Build WHERE conditions
//     let whereConditions = ["1 = 1"];
//     let queryParams = [];

//     // Context filters
//     if (contextType) {
//       whereConditions.push("cj.contextType = ?");
//       queryParams.push(contextType);
//     }

//     if (roleId) {
//       whereConditions.push("cj.roleId = ?");
//       queryParams.push(roleId);
//     }

//     if (cancellationReasonsTypeId) {
//       whereConditions.push("cj.cancellationReasonsTypeId = ?");
//       queryParams.push(cancellationReasonsTypeId);
//     }

//     if (canceledBy) {
//       whereConditions.push("cj.canceledBy = ?");
//       queryParams.push(canceledBy);
//     }

//     // User-specific filters
//     if (userUniqueId) {
//       if (roleId ===2) {
//         whereConditions.push("cj.driverUserUniqueId = ?");
//       } else if (roleId ===1) {
//         whereConditions.push("cj.passengerUserUniqueId = ?");
//       } else {
//         // If no role specified, search in both fields
//         whereConditions.push(
//           "(cj.driverUserUniqueId = ? OR cj.passengerUserUniqueId = ?)"
//         );
//         queryParams.push(userUniqueId, userUniqueId);
//       }
//       queryParams.push(userUniqueId);
//     }

//     // Status filters
//     if (isSeenByAdmin!== undefined) {
//       whereConditions.push("cj.isSeenByAdmin = ?");
//       queryParams.push(isSeenByAdmin === "true" ? 1 : 0);
//     }

//     // Date range filters
//     if (startDate) {
//       whereConditions.push("DATE(cj.canceledTime) >= ?");
//       queryParams.push(startDate);
//     }

//     if (endDate) {
//       whereConditions.push("DATE(cj.canceledTime) <= ?");
//       queryParams.push(endDate);
//     }

//     // Search across user data (replaces searchCanceledJourneyByUserData)
//     if (search) {
//       whereConditions.push(`
//         (u_canceled.fullName LIKE ? OR u_canceled.email LIKE ? OR u_canceled.phoneNumber LIKE ?
//          OR u_driver.fullName LIKE ? OR u_driver.email LIKE ? OR u_driver.phoneNumber LIKE ?
//          OR u_passenger.fullName LIKE ? OR u_passenger.email LIKE ? OR u_passenger.phoneNumber LIKE ?)
//       `);
//       const searchTerm = `%${search}%`;
//       // Add 9 search terms for all user fields
//       for (let i = 0; i < 9; i++) {
//         queryParams.push(searchTerm);
//       }
//     }

//     // Build base query
//     const baseQuery = `
//       SELECT
//         cj.*,
//         crt.cancellationReason,
//         r.roleName,
//         u_canceled.fullName as canceledByName,
//         u_driver.fullName as driverName,
//         u_driver.phoneNumber as driverPhone,
//         u_driver.email as driverEmail,
//         u_passenger.fullName as passengerName,
//         u_passenger.phoneNumber as passengerPhone,
//         u_passenger.email as passengerEmail
//       FROM CanceledJourneys cj
//       LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
//       LEFT JOIN Roles r ON cj.roleId = r.roleId
//       LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
//       LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
//       LEFT JOIN Users u_passenger ON cj.passengerUserUniqueId = u_passenger.userUniqueId
//       WHERE ${whereConditions.join(" AND ")}
//     `;

//     // Count query
//     const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;
//     const [countResult] = await pool.query(countQuery, queryParams);
//     const totalCount = countResult[0]?.total || 0;

//     // Data query with pagination
//     const dataQuery = `
//       ${baseQuery}
//       ORDER BY cj.${safeSortBy} ${finalSortOrder}
//       LIMIT ? OFFSET ?
//     `;

//     // Add pagination parameters
//     const dataParams = [...queryParams, safeLimit, offset];
//     const [results] = await pool.query(dataQuery, dataParams);

//     // Enrich data with journey details
//     const enrichedData = await Promise.all(
//       results.map(async (item) => {
//         try {
//           const journeyData = await getJourneyDataByContextType({
//             contextType: item.contextType,
//             contextId: item.contextId,
//           });
//           const cancellationDetails = await getCancellationDetails(
//             item.contextId
//           );

//           return {
//             ...item,
//             journeyDetails: journeyData,
//             cancellationDetails,
//           };
//         } catch (error) {
//           } catch (error) {
//             return item; // Return basic data if enrichment fails
//             `Error enriching journey data for ${item.contextId}:`,
//             error
//           );
//           return item; // Return basic data if enrichment fails
//         }
//       })
//     );

//     // Calculate pagination info
//     const totalPages = Math.ceil(totalCount / safeLimit);

//     return {
//       success: true,
//       message:
//         totalCount > 0
//           ? "Canceled journeys retrieved successfully"
//           : "No canceled journeys found",
//       data: enrichedData,
//       pagination: {
//         currentPage: safePage,
//         totalPages,
//         totalItems: totalCount,
//         itemsPerPage: safeLimit,
//         hasNextPage: safePage < totalPages,
//         hasPrevPage: safePage > 1,
//       },
//       filters:
//         Object.keys(filters).length > 0
//           ? {
//               contextType,
//               roleId,
//               cancellationReasonsTypeId,
//               canceledBy,
//               userUniqueId,
//               isSeenByAdmin,
//               startDate,
//               endDate,
//               search,
//               sortBy: safeSortBy,
//               sortOrder: finalSortOrder,
//             }
//           : null,
//     };
//   } catch (error) {
//       },
//     };
//   } catch (error) {
//     return {
//     return {
//       success: false,
//       message: "Failed to retrieve canceled journeys",
//       error: error.message,
//       data: [],
//       pagination: {
//         currentPage: parseInt(filters.page) || 1,
//         totalPages: 0,
//         totalItems: 0,
//         itemsPerPage: parseInt(filters.limit) || 10,
//         hasNextPage: false,
//         hasPrevPage: false,
//       },
//     };
//   }
// };

// OPTIMIZED UNIFIED FILTER SERVICE - Returns only essential data
const getCanceledJourneyByFilter = async (filters = {}) => {
  try {
    // Extract and sanitize parameters
    const {
      page = 1,
      limit = 10,
      contextType,
      roleId,
      cancellationReasonsTypeId,
      canceledBy,
      userUniqueId,
      isSeenByAdmin,
      startDate,
      endDate,
      search,
      sortBy = "canceledTime",
      sortOrder = "DESC",
    } = filters;

    // Sanitize inputs
    const safePage = Math.max(1, parseInt(page));
    const safeLimit = Math.min(Math.max(1, parseInt(limit)), 100);
    const offset = (safePage - 1) * safeLimit;

    // Allowed sort columns
    const allowedSortBy = [
      "canceledTime",
      "canceledJourneyId",
      "roleId",
      "cancellationReasonsTypeId",
    ];
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : "canceledTime";
    const finalSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Build WHERE conditions
    let whereConditions = ["1 = 1"];
    let queryParams = [];

    // Context filters
    if (contextType) {
      whereConditions.push("cj.contextType = ?");
      queryParams.push(contextType);
    }

    if (roleId) {
      whereConditions.push("cj.roleId = ?");
      queryParams.push(roleId);
    }

    if (cancellationReasonsTypeId) {
      whereConditions.push("cj.cancellationReasonsTypeId = ?");
      queryParams.push(cancellationReasonsTypeId);
    }

    if (canceledBy) {
      whereConditions.push("cj.canceledBy = ?");
      queryParams.push(canceledBy);
    }

    // User-specific filters
    if (userUniqueId) {
      if (roleId === usersRolesList.driver.roleId) {
        whereConditions.push("cj.driverUserUniqueId = ?");
      } else if (roleId === usersRolesList.passenger.roleId) {
        whereConditions.push("cj.passengerUserUniqueId = ?");
      } else {
        // If no role specified, search in both fields
        whereConditions.push(
          "(cj.driverUserUniqueId = ? OR cj.passengerUserUniqueId = ?)",
        );
        queryParams.push(userUniqueId, userUniqueId);
      }
      queryParams.push(userUniqueId);
    }

    // Status filters
    if (isSeenByAdmin !== undefined) {
      whereConditions.push("cj.isSeenByAdmin = ?");
      // Joi validator converts "true"/"false" strings to boolean true/false
      queryParams.push(isSeenByAdmin === true || isSeenByAdmin === "true" ? 1 : 0);
    }

    // Date range filters
    if (startDate) {
      whereConditions.push("DATE(cj.canceledTime) >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(cj.canceledTime) <= ?");
      queryParams.push(endDate);
    }

    // Search across user data
    if (search) {
      whereConditions.push(`
        (u_canceled.fullName LIKE ? OR u_canceled.email LIKE ? OR u_canceled.phoneNumber LIKE ?
         OR u_driver.fullName LIKE ? OR u_driver.email LIKE ? OR u_driver.phoneNumber LIKE ?
         OR u_passenger.fullName LIKE ? OR u_passenger.email LIKE ? OR u_passenger.phoneNumber LIKE ?)
      `);
      const searchTerm = `%${search}%`;
      // Add 9 search terms for all user fields
      for (let i = 0; i < 9; i++) {
        queryParams.push(searchTerm);
      }
    }

    // Build MINIMAL base query - only what's needed for filtering and context
    const baseQuery = `
      SELECT 
        cj.canceledJourneyUniqueId,
        cj.contextId,
        cj.contextType,
        cj.roleId,
        cj.canceledBy,
        cj.cancellationReasonsTypeId,
        cj.canceledTime,
        cj.isSeenByAdmin,
        cj.canceledJourneySeenByAdminAt,
        crt.cancellationReason,
        crt.cancellationReasonTypeUniqueId
      FROM CanceledJourneys cj
      LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
      LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
      LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
      LEFT JOIN Users u_passenger ON cj.passengerUserUniqueId = u_passenger.userUniqueId
      WHERE ${whereConditions.join(" AND ")}
    `;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;
    const executor = transactionStorage.getStore() || pool;
    const [countResult] = await executor.query(countQuery, queryParams);
    const totalCount = countResult[0]?.total || 0;

    // Data query with pagination
    const dataQuery = `
      ${baseQuery}
      ORDER BY cj.${safeSortBy} ${finalSortOrder}
      LIMIT ? OFFSET ?
    `;

    // Add pagination parameters
    const dataParams = [...queryParams, safeLimit, offset];
    const [results] = await executor.query(dataQuery, dataParams);

    // Enrich data with ONLY journey details and cancellation details
    const enrichedData = await Promise.all(
      results.map(async (item) => {
        try {
          const journeyData = await getJourneyDataByContextType({
            contextType: item.contextType,
            contextId: item.contextId,
          });

          // Build cancellation details from minimal data + journey context
          const cancellationDetails = {
            canceledJourneyUniqueId: item.canceledJourneyUniqueId,
            contextId: item.contextId,
            roleId: item.roleId,
            contextType: item.contextType,
            canceledBy: item.canceledBy,
            cancellationReasonsTypeId: item.cancellationReasonsTypeId,
            canceledTime: item.canceledTime,
            isSeenByAdmin: item.isSeenByAdmin,
            canceledJourneySeenByAdminAt: item.canceledJourneySeenByAdminAt,
            cancellationReasonTypeUniqueId: item.cancellationReasonTypeUniqueId,
            cancellationReason: item.cancellationReason,
          };

          return {
            cancellationDetails,
            journeyDetails: journeyData,
          };
        } catch (error) {
          const logger = require("../Utils/logger");
          logger.error("Error loading canceled journey details", {
            error: error.message,
            stack: error.stack,
          });
          return {
            cancellationDetails: {
              canceledJourneyUniqueId: item.canceledJourneyUniqueId,
              contextId: item.contextId,
              contextType: item.contextType,
              error: "Failed to load details",
            },
            journeyDetails: null,
          };
        }
      }),
    );

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / safeLimit);

    return {
      message: totalCount > 0 ? "success" : "success",
      data: enrichedData,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: safeLimit,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      filters:
        Object.keys(filters).length > 0
          ? {
            contextType,
            roleId,
            cancellationReasonsTypeId,
            canceledBy,
            userUniqueId,
            isSeenByAdmin,
            startDate,
            endDate,
            search,
            sortBy: safeSortBy,
            sortOrder: finalSortOrder,
          }
          : null,
    };
  } catch {
    throw new AppError("Failed to retrieve canceled journeys", 500);
  }
};

// Update seen by admin status
const updateSeenByAdmin = async (canceledJourneyUniqueId) => {
  try {
    const sql =
      "UPDATE CanceledJourneys SET isSeenByAdmin = 1, canceledJourneySeenByAdminAt = ? WHERE canceledJourneyUniqueId = ?";
    const result = await query(sql, [currentDate(), canceledJourneyUniqueId]);

    return result.affectedRows > 0
      ? {
        message: "success",
        data: { updated: true },
      }
      : {
        message: "success",
        data: { updated: false },
      };
  } catch {
    throw new AppError("Failed to update seen status", 500);
  }
};

// Update a canceled journey
const updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
  try {
    const allowedFields = [
      "contextId",
      "contextType",
      "cancellationReasonsTypeId",
      "canceledTime",
    ];
    const updates = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    });

    if (updates.length === 0) {
      throw new AppError("No valid fields to update", 400);
    }

    values.push(currentDate());
    values.push(canceledJourneyUniqueId);

    const sql = `
      UPDATE CanceledJourneys 
      SET ${updates.join(", ")}, updatedAt = ?
      WHERE canceledJourneyUniqueId = ?
    `;

    const result = await query(sql, values);

    return result.affectedRows > 0
      ? {
        message: "success",
        data: { updated: true },
      }
      : {
        message: "success",
        data: { updated: false },
      };
  } catch {
    throw new AppError("Failed to update canceled journey", 500);
  }
};

// Delete a canceled journey
const deleteCanceledJourney = async (canceledJourneyUniqueId) => {
  try {
    const sql =
      "DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
    const result = await query(sql, [canceledJourneyUniqueId]);

    return result.affectedRows > 0
      ? {
        message: "success",
        data: { deleted: true },
      }
      : {
        message: "success",
        data: { deleted: false },
      };
  } catch {
    throw new AppError("Failed to delete canceled journey", 500);
  }
};

// Helper functions for data retrieval (keep existing ones)
const getPassengerDataByJourneyDecision = (journeyDecisionId) =>
  performJoinSelect({
    baseTable: "JourneyDecisions",
    joins: [
      {
        table: "PassengerRequest",
        on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
      },
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
  });

const getDriverDataByJourneyDecision = (journeyDecisionId) =>
  performJoinSelect({
    baseTable: "JourneyDecisions",
    joins: [
      {
        table: "DriverRequest",
        on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
      },
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
  });

const getPassengerDataByJourney = async (journeyId) => {
  const record = await performJoinSelect({
    baseTable: "Journey",
    joins: [
      {
        table: "JourneyDecisions",
        on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
      },
      {
        table: "PassengerRequest",
        on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
      },
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "Journey.journeyId": journeyId },
  });
  return record;
};

const getDriverDataByJourney = async (journeyId) =>
  await performJoinSelect({
    baseTable: "Journey",
    joins: [
      {
        table: "JourneyDecisions",
        on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
      },
      {
        table: "DriverRequest",
        on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
      },
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "Journey.journeyId": journeyId },
  });

const getPassengerRequest = (passengerRequestId) =>
  query(
    `SELECT * FROM PassengerRequest 
     JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId 
     WHERE passengerRequestId = ?`,
    [passengerRequestId],
  );

const getDriverRequest = (driverRequestId) =>
  query(
    `SELECT * FROM DriverRequest 
     JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
     WHERE driverRequestId = ?`,
    [driverRequestId],
  );
const getCanceledJourneyCountsByDate = async (filters = {}) => {
  try {
    const { ownerUserUniqueId, toDate, fromDate, userFilters = {} } = filters;

    const { fullName, phone, email, search } = userFilters;

    // Build query conditions - use canceledTime for canceled journeys
    const queryWhereParts = ["1 = 1"]; // Always true to make building easier
    const queryParams = [];

    // Owner filter - check both passenger and driver
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`
        (cj.driverUserUniqueId = ? OR cj.passengerUserUniqueId = ?)
      `);
      queryParams.push(ownerUserUniqueId, ownerUserUniqueId);
    }

    // Date range filter - use canceledTime
    if (fromDate && toDate) {
      queryWhereParts.push(`cj.canceledTime BETWEEN ? AND ?`);
      queryParams.push(`${fromDate} 00:00:00`, `${toDate} 23:59:59`);
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(
        `(u_driver.fullName LIKE ? OR u_passenger.fullName LIKE ? OR u_canceled.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(u_driver.phoneNumber LIKE ? OR u_passenger.phoneNumber LIKE ? OR u_canceled.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(u_driver.email LIKE ? OR u_passenger.email LIKE ? OR u_canceled.email LIKE ?)`,
      );
      queryParams.push(`%${email}%`, `%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        u_driver.fullName LIKE ? OR 
        u_driver.phoneNumber LIKE ? OR 
        u_driver.email LIKE ? OR
        u_passenger.fullName LIKE ? OR
        u_passenger.phoneNumber LIKE ? OR 
        u_passenger.email LIKE ? OR
        u_canceled.fullName LIKE ? OR
        u_canceled.phoneNumber LIKE ? OR 
        u_canceled.email LIKE ? OR
        crt.cancellationReason LIKE ?
      )`);
      for (let i = 0; i < 10; i++) {
        queryParams.push(`%${search}%`);
      }
    }

    const whereClause =
      queryWhereParts.length > 0
        ? ` WHERE ${queryWhereParts.join(" AND ")}`
        : "";

    // Use DATE_FORMAT with canceledTime
    const countSql = `
      SELECT 
        DATE_FORMAT(cj.canceledTime, '%Y-%m-%d') as canceledDate,
        COUNT(*) as totalCount
      FROM CanceledJourneys cj
      LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
      LEFT JOIN Users u_passenger ON cj.passengerUserUniqueId = u_passenger.userUniqueId
      LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
      LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
      ${whereClause}
      GROUP BY DATE_FORMAT(cj.canceledTime, '%Y-%m-%d')
      ORDER BY canceledDate
    `;

    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, queryParams);

    // Transform results into the desired format { date: count, ... }
    const dateCounts = {};
    countRows.forEach((row) => {
      dateCounts[row.canceledDate] = row.totalCount;
    });

    return {
      message: "success",
      data: dateCounts,
      totalDates: countRows.length,
      dateRange: { fromDate, toDate },
    };
  } catch {
    throw new AppError("Failed to retrieve canceled journey counts", 500);
  }
};
const getCanceledJourneyCountsByReason = async (filters = {}) => {
  try {
    const {
      startDate,
      endDate,
      roleId,
      contextType,
      groupBy = "reason", // reason, role, or contextType
      includeEmptyReasons = false,
    } = filters;

    // Build WHERE conditions
    const whereConditions = ["1 = 1"];
    const queryParams = [];

    // Date range filter
    if (startDate && endDate) {
      whereConditions.push("cj.canceledTime BETWEEN ? AND ?");
      queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    // Role filter
    if (roleId) {
      whereConditions.push("cj.roleId = ?");
      queryParams.push(roleId);
    }

    // Context type filter
    if (contextType) {
      whereConditions.push("cj.contextType = ?");
      queryParams.push(contextType);
    }

    const whereClause = whereConditions.join(" AND ");

    // Determine grouping based on groupBy parameter
    let groupByClause, selectFields;

    switch (groupBy) {
    case "role":
      selectFields = `
          crt.cancellationReason,
          r.roleName as groupName,
          COUNT(*) as count
        `;
      groupByClause = "crt.cancellationReason, r.roleName";
      break;

    case "contextType":
      selectFields = `
          crt.cancellationReason,
          cj.contextType as groupName,
          COUNT(*) as count
        `;
      groupByClause = "crt.cancellationReason, cj.contextType";
      break;

    case "reason":
    default:
      selectFields = `
          crt.cancellationReason as reason,
          COUNT(*) as qty
        `;
      groupByClause = "crt.cancellationReason";
      break;
    }

    const sql = `
      SELECT 
        ${selectFields}
      FROM CanceledJourneys cj
      INNER JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
      LEFT JOIN Roles r ON cj.roleId = r.roleId
      WHERE ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${groupBy === "reason" ? "qty" : "count"} DESC
    `;

    const executor = transactionStorage.getStore() || pool;
    const [results] = await executor.query(sql, queryParams);

    // Transform results into array format
    let formattedData;
    let totalCanceled = 0;

    switch (groupBy) {
    case "role":
      // Group by role: array of { role: "Driver", reasons: [{reason: "...", qty: 10}, ...] }
      const rolesMap = {};
      results.forEach((row) => {
        totalCanceled += row.count;
        if (!rolesMap[row.groupName]) {
          rolesMap[row.groupName] = {
            role: row.groupName,
            reasons: [],
          };
        }
        rolesMap[row.groupName].reasons.push({
          reason: row.cancellationReason,
          qty: row.count,
        });
      });
      formattedData = Object.values(rolesMap);
      break;

    case "contextType":
      // Group by context type: array of { contextType: "JourneyDecisions", reasons: [{reason: "...", qty: 10}, ...] }
      const contextMap = {};
      results.forEach((row) => {
        totalCanceled += row.count;
        if (!contextMap[row.groupName]) {
          contextMap[row.groupName] = {
            contextType: row.groupName,
            reasons: [],
          };
        }
        contextMap[row.groupName].reasons.push({
          reason: row.cancellationReason,
          qty: row.count,
        });
      });
      formattedData = Object.values(contextMap);
      break;

    case "reason":
    default:
      // Simple array of { reason: "...", qty: 10 }
      formattedData = results.map((row) => {
        totalCanceled += row.qty;
        return {
          reason: row.reason,
          qty: row.qty,
        };
      });
      break;
    }

    // If includeEmptyReasons is true, get all reasons and include zeros
    if (includeEmptyReasons && groupBy === "reason") {
      const allReasonsSql = `
        SELECT cancellationReason 
        FROM CancellationReasonsType 
        WHERE roleId = ? OR ? IS NULL
      `;
      const [allReasons] = await executor.query(allReasonsSql, [roleId, roleId]);

      const existingReasons = new Set(formattedData.map((item) => item.reason));

      allReasons.forEach((reasonRow) => {
        const reason = reasonRow.cancellationReason;
        if (!existingReasons.has(reason)) {
          formattedData.push({
            reason: reason,
            qty: 0,
          });
        }
      });

      // Re-sort after adding zero-count reasons
      formattedData.sort((a, b) => b.qty - a.qty);
    }

    return {
      message: "success",
      data: formattedData,
      summary: {
        totalCanceled,
        totalReasons: formattedData.length,
        dateRange: { startDate, endDate },
      },
      grouping: groupBy,
      filters: {
        startDate,
        endDate,
        roleId,
        contextType,
      },
    };
  } catch {
    throw new AppError(
      "Failed to retrieve canceled journey counts by reason",
      500,
    );
  }
};
module.exports = {
  getCanceledJourneyCountsByReason,
  getCanceledJourneyCountsByDate,
  getCanceledJourneyByFilter,
  updateSeenByAdmin,
  createCanceledJourney,
  deleteCanceledJourney,
  updateCanceledJourney,
};
