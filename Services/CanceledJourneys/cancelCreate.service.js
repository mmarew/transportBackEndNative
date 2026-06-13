"use strict";

const {
  
  getCancellationDetails
} = require("../../CRUD/Read/ReadData");
const {
  pool
} = require("../../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");
const {
  currentDate
} = require("../../Utils/CurrentDate");



// Helper function for database queries

const { query} = require("./cancelHelper");

// Create a new canceled journey
const createCanceledJourney = async data => {
  const {
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime,
    roleId,
    driverUserUniqueId,
    shipperUserUniqueId
  } = data;
  const canceledJourneyUniqueId = uuidv4();
  // cancellationReasonsTypeId is NOT NULL in DB — default to seeded reason 1 if omitted
  const reasonId = cancellationReasonsTypeId || 1;
  const sql = `
    INSERT INTO CanceledJourneys (
      canceledJourneyUniqueId, contextId, contextType, canceledBy, 
      cancellationReasonsTypeId, canceledTime, roleId, 
      driverUserUniqueId, shipperUserUniqueId,
      canceledJourneyCreatedBy, canceledJourneyCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [canceledJourneyUniqueId, contextId, contextType, canceledBy, reasonId, canceledTime || currentDate(), roleId, driverUserUniqueId, shipperUserUniqueId, canceledBy, currentDate()];
  await query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);
  return {
    message: "success",
    data: {
      canceledJourneyId: canceledJourneyUniqueId,
      cancellationDetails
    }
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

module.exports = {
  createCanceledJourney
};
