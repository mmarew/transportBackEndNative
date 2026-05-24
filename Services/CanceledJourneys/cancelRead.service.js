"use strict";


const {
  pool
} = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Helper function for database queries

const {  getJourneyDataByContextType} = require("./cancelHelper");

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
//         whereConditions.push("cj.shipperUserUniqueId = ?");
//       } else {
//         // If no role specified, search in both fields
//         whereConditions.push(
//           "(cj.driverUserUniqueId = ? OR cj.shipperUserUniqueId = ?)"
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
//          OR u_shipper.fullName LIKE ? OR u_shipper.email LIKE ? OR u_shipper.phoneNumber LIKE ?)
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
//         u_shipper.fullName as shipperName,
//         u_shipper.phoneNumber as shipperPhone,
//         u_shipper.email as shipperEmail
//       FROM CanceledJourneys cj
//       LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
//       LEFT JOIN Roles r ON cj.roleId = r.roleId
//       LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
//       LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
//       LEFT JOIN Users u_shipper ON cj.shipperUserUniqueId = u_shipper.userUniqueId
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
      sortOrder = "DESC"
    } = filters;

    // Sanitize inputs
    const safePage = Math.max(1, parseInt(page));
    const safeLimit = Math.min(Math.max(1, parseInt(limit)), 100);
    const offset = (safePage - 1) * safeLimit;

    // Allowed sort columns
    const allowedSortBy = ["canceledTime", "canceledJourneyId", "roleId", "cancellationReasonsTypeId"];
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : "canceledTime";
    const finalSortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "DESC";

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
      } else if (roleId === usersRolesList.shipper.roleId) {
        whereConditions.push("cj.shipperUserUniqueId = ?");
      } else {
        // If no role specified, search in both fields
        whereConditions.push("(cj.driverUserUniqueId = ? OR cj.shipperUserUniqueId = ?)");
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
         OR u_shipper.fullName LIKE ? OR u_shipper.email LIKE ? OR u_shipper.phoneNumber LIKE ?)
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
      LEFT JOIN Users u_shipper ON cj.shipperUserUniqueId = u_shipper.userUniqueId
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
    const enrichedData = await Promise.all(results.map(async item => {
      try {
        const journeyData = await getJourneyDataByContextType({
          contextType: item.contextType,
          contextId: item.contextId
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
          cancellationReason: item.cancellationReason
        };
        return {
          cancellationDetails,
          journeyDetails: journeyData
        };
      } catch (error) {
        const logger = require("../../Utils/logger");
        logger.error("Error loading canceled journey details", {
          error: error.message,
          stack: error.stack
        });
        return {
          cancellationDetails: {
            canceledJourneyUniqueId: item.canceledJourneyUniqueId,
            contextId: item.contextId,
            contextType: item.contextType,
            error: "Failed to load details"
          },
          journeyDetails: null
        };
      }
    }));

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
        hasPrevPage: safePage > 1
      },
      filters: Object.keys(filters).length > 0 ? {
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
        sortOrder: finalSortOrder
      } : null
    };
  } catch {
    throw new AppError("Failed to retrieve canceled journeys", 500);
  }
};

// Update seen by admin status

module.exports = {
  getCanceledJourneyByFilter
};
