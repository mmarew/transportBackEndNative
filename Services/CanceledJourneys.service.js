// const {
//   performJoinSelect,
//   getCancellationDetails,
// } = require("../CRUD/Read/ReadData");
// const { pool } = require("../Middleware/Database.config");
// const { getUserByFilterDetailed } = require("./User.service");
// const { v4: uuidv4 } = require("uuid");

// // Helper function for database queries
// const query = async (sql, values = []) => {
//   const [result] = await pool.query(sql, values);
//   return result;
// };

// // Helper function to get journey data by context type
// const getJourneyDataByContextType = async ({ contextType, contextId }) => {
//   const dataHandlers = {
//     JourneyDecisions: async () => {
//       const [passengerData, driverData] = await Promise.all([
//         getPassengerDataByJourneyDecision(contextId),
//         getDriverDataByJourneyDecision(contextId),
//       ]);
//       return { driver: driverData, passenger: passengerData };
//     },
//     Journey: async () => {
//       const [passengerData, driverData] = await Promise.all([
//         getPassengerDataByJourney(contextId),
//         getDriverDataByJourney(contextId),
//       ]);
//       return { driver: driverData, passenger: passengerData };
//     },
//     DriverRequest: async () => {
//       const driverData = await getDriverRequest(contextId);
//       return { driver: driverData, passenger: null };
//     },
//     PassengerRequest: async () => {
//       const passengerData = await getPassengerRequest(contextId);
//       return { driver: null, passenger: passengerData };
//     },
//   };

//   const handler = dataHandlers[contextType];
//   if (!handler) {
//     throw new Error(`Unsupported context type: ${contextType}`);
//   }

//   const data = await handler();
//   return { ...data, contextType };
// };

// // Create a new canceled journey
// const createCanceledJourney = async (data) => {
//   const {
//     contextId,
//     contextType,
//     canceledBy,
//     cancellationReasonsTypeId,
//     canceledTime,
//     roleId,
//     driverUserUniqueId,
//     passengerUserUniqueId,
//   } = data;

//   const canceledJourneyUniqueId = uuidv4();
//   const sql = `
//     INSERT INTO CanceledJourneys (
//       canceledJourneyUniqueId, contextId, contextType, canceledBy,
//       cancellationReasonsTypeId, canceledTime, roleId,
//       driverUserUniqueId, passengerUserUniqueId
//     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `;

//   const values = [
//     canceledJourneyUniqueId,
//     contextId,
//     contextType,
//     canceledBy,
//     cancellationReasonsTypeId,
//     canceledTime || new Date(),
//     roleId,
//     driverUserUniqueId,
//     passengerUserUniqueId,
//   ];

//   await query(sql, values);
//   const cancellationDetails = await getCancellationDetails(contextId);

//   return {
//     message: "success",
//     data: "Canceled journey created successfully",
//     canceledJourneyId: canceledJourneyUniqueId,
//     cancellationDetails,
//   };
// };

// // Get filtered canceled journeys

// // Get canceled journeys

// // Search canceled journey by user data

// // Get a canceled journey by canceledJourneyUniqueId
// const getCanceledJourneyById = async (canceledJourneyUniqueId) => {
//   const sql =
//     "SELECT * FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
//   const result = await query(sql, [canceledJourneyUniqueId]);

//   return result.length > 0
//     ? { message: "success", data: result[0] }
//     : { message: "error", error: "Canceled journey not found" };
// };

// // Update a canceled journey
// const updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
//   const sql = `
//     UPDATE CanceledJourneys
//     SET contextId = ?, contextType = ?, canceledBy = ?,
//         cancellationReasonsTypeId = ?, canceledTime = ?
//     WHERE canceledJourneyUniqueId = ?
//   `;

//   const values = [
//     data.contextId,
//     data.contextType,
//     data.canceledBy,
//     data.cancellationReasonsTypeId,
//     data.canceledTime || new Date(),
//     canceledJourneyUniqueId,
//   ];

//   const result = await query(sql, values);

//   return result.affectedRows > 0
//     ? { message: "success", data: "Canceled journey updated successfully" }
//     : { message: "error", error: "Failed to update canceled journey" };
// };

// // Delete a canceled journey
// const deleteCanceledJourney = async (canceledJourneyUniqueId) => {
//   const sql = "DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
//   const result = await query(sql, [canceledJourneyUniqueId]);

//   return result.affectedRows > 0
//     ? { message: "success", data: "Canceled journey deleted successfully" }
//     : { message: "error", error: "Failed to delete canceled journey" };
// };

// // Get canceled journeys by user unique ID with pagination
// const getSingleCanceledJourneysByUserUniqueIdAndRoleId = async (
//   userUniqueId,
//   roleId,
//   page = 1,
//   limit = 10
// ) => {
//   const safePage = Math.max(1, parseInt(page) || 1);
//   const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
//   const offset = (safePage - 1) * safeLimit;
//   const dataSql = `
//     SELECT * FROM CanceledJourneys
//     WHERE canceledBy = ? AND roleId = ?
//     ORDER BY canceledTime DESC
//     LIMIT ? OFFSET ?
//   `;
//   const [result] = await pool.query(dataSql, [
//     userUniqueId,
//     roleId,
//     safeLimit,
//     offset,
//   ]);

//   // Get total count for pagination using COUNT(*)
//   const countSql = `SELECT COUNT(*) as total FROM CanceledJourneys WHERE canceledBy = ? AND roleId = ?`;
//   const [countRows] = await pool.query(countSql, [userUniqueId, roleId]);
//   const totalCount = countRows[0]?.total || 0;
//   const totalPages = Math.ceil(totalCount / safeLimit);

//   const canceledData = await Promise.all(
//     result.map(async (item) => {
//       const journeyData = await getJourneyDataByContextType({
//         contextType: item.contextType,
//         contextId: item.contextId,
//       });
//       const cancellationDetails = await getCancellationDetails(item.contextId);
//       return { ...journeyData, cancellationDetails };
//     })
//   );

//   return {
//     message: "success",
//     data: canceledData,
//     pagination: {
//       currentPage: parseInt(safePage),
//       totalPages,
//       totalCount,
//       hasNext: safePage < totalPages,
//       hasPrev: safePage > 1,
//       limit: parseInt(safeLimit),
//     },
//   };
// };

// // Update seen by admin status
// const updateSeenByAdmin = async (canceledJourneyUniqueId) => {
//   const sql =
//     "UPDATE CanceledJourneys SET isSeenByAdmin = ? WHERE canceledJourneyUniqueId = ?";
//   const result = await query(sql, [1, canceledJourneyUniqueId]);

//   return result.affectedRows > 0
//     ? { message: "success", data: "Data seen" }
//     : { message: "error", error: "Data not found" };
// };

// // Get unseen canceled journeys

// // Helper functions for data retrieval
// const getPassengerDataByJourneyDecision = (journeyDecisionId) =>
//   performJoinSelect({
//     baseTable: "JourneyDecisions",
//     joins: [
//       {
//         table: "PassengerRequest",
//         on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
//       },
//       {
//         table: "Users",
//         on: "PassengerRequest.userUniqueId = Users.userUniqueId",
//       },
//     ],
//     conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
//   });

// const getDriverDataByJourneyDecision = (journeyDecisionId) =>
//   performJoinSelect({
//     baseTable: "JourneyDecisions",
//     joins: [
//       {
//         table: "DriverRequest",
//         on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
//       },
//       {
//         table: "Users",
//         on: "DriverRequest.userUniqueId = Users.userUniqueId",
//       },
//     ],
//     conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
//   });

// const getPassengerDataByJourney = (journeyId) =>
//   performJoinSelect({
//     baseTable: "Journey",
//     joins: [
//       {
//         table: "JourneyDecisions",
//         on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
//       },
//       {
//         table: "PassengerRequest",
//         on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
//       },
//       {
//         table: "Users",
//         on: "PassengerRequest.userUniqueId = Users.userUniqueId",
//       },
//     ],
//     conditions: { "Journey.journeyId": journeyId },
//   });

// const getDriverDataByJourney = (journeyId) =>
//   performJoinSelect({
//     baseTable: "Journey",
//     joins: [
//       {
//         table: "JourneyDecisions",
//         on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
//       },
//       {
//         table: "DriverRequest",
//         on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
//       },
//       {
//         table: "Users",
//         on: "DriverRequest.userUniqueId = Users.userUniqueId",
//       },
//     ],
//     conditions: { "Journey.journeyId": journeyId },
//   });

// const getPassengerRequest = (passengerRequestId) =>
//   query(
//     `SELECT * FROM PassengerRequest
//      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId
//      WHERE passengerRequestId = ?`,
//     [passengerRequestId]
//   );

// const getDriverRequest = (driverRequestId) =>
//   query(
//     `SELECT * FROM DriverRequest
//      JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId
//      WHERE driverRequestId = ?`,
//     [driverRequestId]
//   );

// // Add these pagination functions to your service

// /**
//  * Get paginated canceled journeys with filters
//  */
// const getAllCancelledJourneyByRole = async (filters) => {
//   const {
//     canceledByRoleId,
//     startDate,
//     endDate,
//     page = 1,
//     limit = 10,
//     sortBy = "canceledJourneyId",
//     sortOrder = "DESC",
//   } = filters;

//   // Safety: sanitize pagination and sorting
//   const safePage = Math.max(1, parseInt(page) || 1);
//   const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
//   const allowedSortBy = ["canceledJourneyId", "canceledTime", "roleId"]; // columns on CanceledJourneys
//   const safeSortBy = allowedSortBy.includes(sortBy)
//     ? sortBy
//     : "canceledJourneyId";
//   const safeSortOrder =
//     String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

//   // Calculate offset for pagination
//   const offset = (safePage - 1) * safeLimit;

//   // Base where and join clauses
//   let whereClauses = ["1=1"];
//   const whereValues = [];
//   const joins = `
//     FROM CanceledJourneys
//     JOIN CancellationReasonsType ON CancellationReasonsType.cancellationReasonsTypeId = CanceledJourneys.cancellationReasonsTypeId
//     JOIN Roles ON Roles.roleId = CancellationReasonsType.roleId
//   `;

//   if (canceledByRoleId) {
//     whereClauses.push(`Roles.roleId = ?`);
//     whereValues.push(canceledByRoleId);
//   }

//   if (startDate && endDate) {
//     whereClauses.push(`CanceledJourneys.canceledTime BETWEEN ? AND ?`);
//     whereValues.push(startDate, endDate);
//   }

//   // Build data query
//   const dataSql = `
//     SELECT CanceledJourneys.*, CancellationReasonsType.*, Roles.*
//     ${joins}
//     WHERE ${whereClauses.join(" AND ")}
//     ORDER BY ${safeSortBy} ${safeSortOrder}
//     LIMIT ? OFFSET ?
//   `;
//   const dataValues = [...whereValues, safeLimit, offset];
//   const [result] = await pool.query(dataSql, dataValues);
//   console.log("@getCanceledJourneys result", result);

//   // Build count query
//   const countSql = `
//     SELECT COUNT(*) as total
//     ${joins}
//     WHERE ${whereClauses.join(" AND ")}
//   `;
//   const [countRows] = await pool.query(countSql, whereValues);
//   const totalCount = countRows[0]?.total || 0;
//   const totalPages = Math.ceil(totalCount / safeLimit);

//   const cancelledData = await Promise.all(
//     result.map(async (item) => {
//       const journeyData = await getJourneyDataByContextType({
//         contextType: item.contextType,
//         contextId: item.contextId,
//       });
//       const cancellationDetails = await getCancellationDetails(item.contextId);
//       return { ...journeyData, cancellationDetails };
//     })
//   );

//   return {
//     message: "success",
//     data: cancelledData,
//     pagination: {
//       currentPage: parseInt(safePage),
//       totalPages,
//       totalCount,
//       hasNext: safePage < totalPages,
//       hasPrev: safePage > 1,
//       limit: parseInt(safeLimit),
//     },
//   };
// };

// /**
//  * Search canceled journey by user data with pagination
//  */
// const searchCanceledJourneyByUserData = async (
//   phoneOrEmail,
//   roleId,
//   page = 1,
//   limit = 10
// ) => {
//   const safePage = Math.max(1, parseInt(page) || 1);
//   const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
//   const filters = { search: phoneOrEmail };
//   const usersData = await getUserByFilterDetailed(filters);
//   console.log("@usersData", usersData);
//   const users = usersData?.data || [];

//   if (users.length === 0) {
//     return {
//       message: "success",
//       data: [],
//       pagination: {
//         currentPage: 1,
//         totalPages: 0,
//         totalCount: 0,
//         hasNext: false,
//         hasPrev: false,
//         limit: parseInt(limit),
//       },
//     };
//   }

//   // Get user IDs for the query
//   const userIds = users.map((user) => user?.userUniqueId);
//   console.log("@userIds", userIds);
//   const placeholders = userIds.map(() => "?").join(",");
//   const offset = (safePage - 1) * safeLimit;

//   const userUniqueIdField =
//     roleId == 2 ? "driverUserUniqueId" : "passengerUserUniqueId";
//   const dataSql = `
//     SELECT * FROM CanceledJourneys
//     WHERE ${userUniqueIdField} IN (${placeholders}) AND roleId = ?
//     ORDER BY canceledTime DESC
//     LIMIT ? OFFSET ?
//   `;

//   const dataValues = [...userIds, roleId, safeLimit, offset];
//   const [result] = await pool.query(dataSql, dataValues);

//   // Get total count with same filters
//   const countSql = `
//     SELECT COUNT(*) as total FROM CanceledJourneys
//     WHERE ${userUniqueIdField} IN (${placeholders}) AND roleId = ?
//   `;
//   const countValues = [...userIds, roleId];
//   const [countRows] = await pool.query(countSql, countValues);
//   const totalCount = countRows[0]?.total || 0;
//   const totalPages = Math.ceil(totalCount / safeLimit);

//   const data = await Promise.all(
//     result.map(async (item) => {
//       const journeyData = await getJourneyDataByContextType({
//         contextType: item.contextType,
//         contextId: item.contextId,
//       });
//       const cancellationDetails = await getCancellationDetails(item.contextId);
//       return { ...journeyData, cancellationDetails };
//     })
//   );

//   return {
//     message: "success",
//     data,
//     pagination: {
//       currentPage: parseInt(safePage),
//       totalPages,
//       totalCount,
//       hasNext: safePage < totalPages,
//       hasPrev: safePage > 1,
//       limit: parseInt(safeLimit),
//     },
//   };
// };

// /**
//  * Get paginated unseen canceled journeys
//  */
// const getUnseenCanceledJourney = async (page = 1, limit = 10) => {
//   const safePage = Math.max(1, parseInt(page) || 1);
//   const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
//   const offset = (safePage - 1) * safeLimit;
//   const dataSql = `
//     SELECT * FROM CanceledJourneys
//     WHERE isSeenByAdmin = ? AND roleId = ?
//     ORDER BY canceledTime DESC
//     LIMIT ? OFFSET ?
//   `;

//   const [result] = await pool.query(dataSql, [0, 2, safeLimit, offset]);

//   // Get total count
//   const countSql = `
//     SELECT COUNT(*) as total FROM CanceledJourneys
//     WHERE isSeenByAdmin = ? AND roleId = ?
//   `;
//   const [countRows] = await pool.query(countSql, [0, 2]);
//   const totalCount = countRows[0]?.total || 0;
//   const totalPages = Math.ceil(totalCount / safeLimit);

//   const data = await Promise.all(
//     result.map(async (item) => {
//       const contextId = item.contextId;
//       const contextType = item.contextType;

//       let driverData = null;
//       let passengerData = null;

//       if (contextType === "JourneyDecisions" || contextType === "Journey") {
//         const [passengerResult, driverResult] = await Promise.all([
//           contextType === "JourneyDecisions"
//             ? getPassengerDataByJourneyDecision(contextId)
//             : getPassengerDataByJourney(contextId),
//           contextType === "JourneyDecisions"
//             ? getDriverDataByJourneyDecision(contextId)
//             : getDriverDataByJourney(contextId),
//         ]);

//         passengerData = passengerResult[0];
//         driverData = driverResult[0];
//       }

//       const cancellationDetails = await getCancellationDetails(contextId);
//       return {
//         driver: driverData,
//         passenger: passengerData,
//         cancellationDetails,
//       };
//     })
//   );

//   return {
//     message: "success",
//     data,
//     pagination: {
//       currentPage: parseInt(safePage),
//       totalPages,
//       totalCount,
//       hasNext: safePage < totalPages,
//       hasPrev: safePage > 1,
//       limit: parseInt(safeLimit),
//     },
//   };
// };
// // CanceledJourneysController.js

// const getCanceledJourneyByFilter = async ({ data }) => {
//   try {
//     // Extract query parameters with default values
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
//       sortBy = "canceledTime",
//       sortOrder = "DESC",
//     } = data;

//     // Safety: sanitize pagination and sorting
//     const safePage = Math.max(1, parseInt(page) || 1);
//     const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
//     const allowedSortBy = [
//       "canceledTime",
//       "canceledJourneyId",
//       "roleId",
//       "cancellationReasonsTypeId",
//     ];
//     const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : "canceledTime";
//     // Calculate pagination
//     const offset = (safePage - 1) * safeLimit;

//     // Build WHERE clause based on filters
//     let whereConditions = ["1 = 1"]; // Always true to make building easier
//     let queryParams = [];

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

//     if (roleId == 2 && userUniqueId) {
//       whereConditions.push("cj.driverUserUniqueId = ?");
//       queryParams.push(userUniqueId);
//     }

//     if (roleId == 1 && userUniqueId) {
//       whereConditions.push("cj.passengerUserUniqueId = ?");
//       queryParams.push(userUniqueId);
//     }

//     if (isSeenByAdmin !== undefined) {
//       whereConditions.push("cj.isSeenByAdmin = ?");
//       queryParams.push(isSeenByAdmin === "true" ? 1 : 0);
//     }

//     if (startDate) {
//       whereConditions.push("cj.canceledTime >= ?");
//       queryParams.push(startDate);
//     }

//     if (endDate) {
//       whereConditions.push("cj.canceledTime <= ?");
//       queryParams.push(endDate);
//     }

//     // Validate sort order
//     const validSortOrders = ["ASC", "DESC"];
//     const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
//       ? sortOrder.toUpperCase()
//       : "DESC";

//     // Build the main query
//     const baseQuery = `
//       SELECT
//         cj.*,
//         crt.cancellationReason,
//         r.roleName,
//         u_canceled.fullName as canceledByName,
//         u_driver.fullName as driverName,
//         u_passenger.fullName as passengerName
//       FROM CanceledJourneys cj
//       LEFT JOIN CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
//       LEFT JOIN Roles r ON cj.roleId = r.roleId
//       LEFT JOIN Users u_canceled ON cj.canceledBy = u_canceled.userUniqueId
//       LEFT JOIN Users u_driver ON cj.driverUserUniqueId = u_driver.userUniqueId
//       LEFT JOIN Users u_passenger ON cj.passengerUserUniqueId = u_passenger.userUniqueId
//       WHERE ${whereConditions.join(" AND ")}
//     `;

//     // Count query for pagination
//     const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;

//     // Data query with pagination and sorting
//     const dataQuery = `
//       ${baseQuery}
//       ORDER BY cj.${safeSortBy} ${finalSortOrder}
//       LIMIT ? OFFSET ?
//     `;

//     // Add pagination parameters
//     queryParams.push(parseInt(safeLimit), offset);

//     // Execute queries
//     const [countResult] = await pool.query(
//       countQuery,
//       queryParams.slice(0, -2)
//     ); // Remove limit/offset for count
//     const [results] = await pool.query(dataQuery, queryParams);

//     const total = countResult[0].total;
//     const totalPages = Math.ceil(total / safeLimit);

//     // Prepare response
//     const response = {
//       success: true,
//       data: results,
//       pagination: {
//         currentPage: parseInt(safePage),
//         totalPages: totalPages,
//         totalItems: total,
//         itemsPerPage: parseInt(safeLimit),
//         hasNextPage: safePage < totalPages,
//         hasPrevPage: safePage > 1,
//       },
//       filters: {
//         contextType,
//         roleId,
//         cancellationReasonsTypeId,
//         canceledBy,
//         userUniqueId,
//         isSeenByAdmin,
//         startDate,
//         endDate,
//         sortBy,
//         sortOrder: finalSortOrder,
//       },
//     };

//     return { message: "success", data: response };
//   } catch (error) {
//     console.error("Error fetching canceled journeys:", error);
//     return {
//       message: "error",
//       error: error.message,
//     };
//   }
// };

// module.exports = {
//   getCanceledJourneyByFilter,
//   getUnseenCanceledJourney,
//   updateSeenByAdmin,
//   createCanceledJourney,
//   getAllCancelledJourneyByRole,
//   searchCanceledJourneyByUserData,
//   getSingleCanceledJourneysByUserUniqueIdAndRoleId,
//   deleteCanceledJourney,
//   updateCanceledJourney,
//   getCanceledJourneyById,
// };
const {
  performJoinSelect,
  getCancellationDetails,
} = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Helper function for database queries
const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
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
      console.log("@Journey contextId", contextId);
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
      driverUserUniqueId, passengerUserUniqueId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    canceledJourneyUniqueId,
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime || new Date(),
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
  ];

  await query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);

  return {
    success: true,
    message: "Canceled journey created successfully",
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
//       if (roleId == 2) {
//         whereConditions.push("cj.driverUserUniqueId = ?");
//       } else if (roleId == 1) {
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
//     if (isSeenByAdmin !== undefined) {
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
//           console.error(
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
//     console.error("Error in getCanceledJourneyByFilter:", error);
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
      if (roleId == 2) {
        whereConditions.push("cj.driverUserUniqueId = ?");
      } else if (roleId == 1) {
        whereConditions.push("cj.passengerUserUniqueId = ?");
      } else {
        // If no role specified, search in both fields
        whereConditions.push(
          "(cj.driverUserUniqueId = ? OR cj.passengerUserUniqueId = ?)"
        );
        queryParams.push(userUniqueId, userUniqueId);
      }
      queryParams.push(userUniqueId);
    }

    // Status filters
    if (isSeenByAdmin !== undefined) {
      whereConditions.push("cj.isSeenByAdmin = ?");
      queryParams.push(isSeenByAdmin === "true" ? 1 : 0);
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
    const [countResult] = await pool.query(countQuery, queryParams);
    const totalCount = countResult[0]?.total || 0;

    // Data query with pagination
    const dataQuery = `
      ${baseQuery}
      ORDER BY cj.${safeSortBy} ${finalSortOrder}
      LIMIT ? OFFSET ?
    `;

    // Add pagination parameters
    const dataParams = [...queryParams, safeLimit, offset];
    const [results] = await pool.query(dataQuery, dataParams);

    // Enrich data with ONLY journey details and cancellation details
    const enrichedData = await Promise.all(
      results.map(async (item) => {
        try {
          console.log("@enrichedData item", item);
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
            cancellationReasonTypeUniqueId: item.cancellationReasonTypeUniqueId,
            cancellationReason: item.cancellationReason,
          };

          return {
            cancellationDetails,
            journeyDetails: journeyData,
          };
        } catch (error) {
          console.error(
            `Error enriching journey data for ${item.contextId}:`,
            error
          );
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
      })
    );

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / safeLimit);

    return {
      success: true,
      message:
        totalCount > 0
          ? "Canceled journeys retrieved successfully"
          : "No canceled journeys found",
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
  } catch (error) {
    console.error("Error in getCanceledJourneyByFilter:", error);
    return {
      success: false,
      message: "Failed to retrieve canceled journeys",
      error: error.message,
      data: [],
      pagination: {
        currentPage: parseInt(filters.page) || 1,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: parseInt(filters.limit) || 10,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }
};

// Update seen by admin status
const updateSeenByAdmin = async (canceledJourneyUniqueId) => {
  try {
    const sql =
      "UPDATE CanceledJourneys SET isSeenByAdmin = 1, seenAt = NOW() WHERE canceledJourneyUniqueId = ?";
    const result = await query(sql, [canceledJourneyUniqueId]);

    return result.affectedRows > 0
      ? {
          success: true,
          message: "Marked as seen by admin",
          data: { updated: true },
        }
      : {
          success: false,
          message: "Canceled journey not found",
          data: { updated: false },
        };
  } catch (error) {
    console.error("Error in updateSeenByAdmin:", error);
    return {
      success: false,
      message: "Failed to update seen status",
      error: error.message,
    };
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
      return {
        success: false,
        message: "No valid fields to update",
      };
    }

    values.push(canceledJourneyUniqueId);

    const sql = `
      UPDATE CanceledJourneys 
      SET ${updates.join(", ")}, updatedAt = NOW()
      WHERE canceledJourneyUniqueId = ?
    `;

    const result = await query(sql, values);

    return result.affectedRows > 0
      ? {
          success: true,
          message: "Canceled journey updated successfully",
          data: { updated: true },
        }
      : {
          success: false,
          message: "Canceled journey not found or no changes made",
          data: { updated: false },
        };
  } catch (error) {
    console.error("Error in updateCanceledJourney:", error);
    return {
      success: false,
      message: "Failed to update canceled journey",
      error: error.message,
    };
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
          success: true,
          message: "Canceled journey deleted successfully",
          data: { deleted: true },
        }
      : {
          success: false,
          message: "Canceled journey not found",
          data: { deleted: false },
        };
  } catch (error) {
    console.error("Error in deleteCanceledJourney:", error);
    return {
      success: false,
      message: "Failed to delete canceled journey",
      error: error.message,
    };
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
  console.log("@ getPassengerDataByJourney", journeyId);
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
  console.log("@getPassengerDataByJourney record", record);
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
    [passengerRequestId]
  );

const getDriverRequest = (driverRequestId) =>
  query(
    `SELECT * FROM DriverRequest 
     JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
     WHERE driverRequestId = ?`,
    [driverRequestId]
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
        `(u_driver.fullName LIKE ? OR u_passenger.fullName LIKE ? OR u_canceled.fullName LIKE ?)`
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(u_driver.phoneNumber LIKE ? OR u_passenger.phoneNumber LIKE ? OR u_canceled.phoneNumber LIKE ?)`
      );
      queryParams.push(`%${phone}%`, `%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(u_driver.email LIKE ? OR u_passenger.email LIKE ? OR u_canceled.email LIKE ?)`
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

    console.log("DEBUG - Canceled Journeys SQL:", countSql);
    console.log("DEBUG - Canceled Journeys Query params:", queryParams);

    const [countRows] = await pool.query(countSql, queryParams);

    console.log("DEBUG - Canceled Journeys Raw results:", countRows);

    // Transform results into the desired format { date: count, ... }
    const dateCounts = {};
    countRows.forEach((row) => {
      dateCounts[row.canceledDate] = row.totalCount;
    });

    return {
      success: true,
      message: "Canceled journey counts retrieved successfully",
      data: dateCounts,
      totalDates: countRows.length,
      dateRange: { fromDate, toDate },
    };
  } catch (error) {
    console.error("Error fetching canceled journey counts by date:", error);
    return {
      success: false,
      message: "Failed to retrieve canceled journey counts",
      error: error.message,
    };
  }
};
module.exports = {
  getCanceledJourneyCountsByDate,
  getCanceledJourneyByFilter,
  updateSeenByAdmin,
  createCanceledJourney,
  deleteCanceledJourney,
  updateCanceledJourney,
};
