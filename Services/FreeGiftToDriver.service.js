// // const { pool } = require("../Middleware/Database.config");
// // const { v4: uuidv4 } = require("uuid");
// // const { currentDate} = require("../Utils/CurrentDate");
// // const {
// //   getActiveSubscriptionPlanningPrice,
// // } = require("./SubscriptionPlanPricing.service");
// // const modifyDateTime = require("../Utils/adjustDateTime");
// // const {
// //   prepareAndCreateNewBalance,
// // } = require("./DriverBalance.service/DriverBalance.post.service");

// // // Create Free Gift
// // const createFreeGiftToDriver = async ({
// //   driverUniqueId,
// //   subscriptionPlanUniqueId,
// //   giftStartDate,
// // }) => {
// //   const freeGiftUniqueId = uuidv4();
// //   let giftEndDate = null;

// //   if (!driverUniqueId || !subscriptionPlanUniqueId || !giftStartDate) {
// //     return {
// //       message: "error",
// //       error: "Missing required fields to create free gift",
// //     };
// //   }
// //   if (giftStartDate < new Date().toISOString().slice(0, 10)) {
// //     return { message: "error", error: "Gift start date cannot be in the past" };
// //   }
// //   // get plan and its price
// //   const today = currentDate();
// //   // there are old and outdated pricing data so we need active one only
// //   const activePricing = await getActiveSubscriptionPlanningPrice({
// //     subscriptionPlanUniqueId,
// //     today,
// //   });
// //   const activePricingData = activePricing?.data?.[0];
// //   console.log("@activePricingData", activePricingData);
// //   // if there is no active pricing and planning return error
// //   if (!activePricingData)
// //     return {
// //       message: "error",
// //       error: "You can't create free gift using this plan.",
// //     };
// //   // check if the user has this gift already
// //   const existingGift = await getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId(
// //     {
// //       subscriptionPlanUniqueId,
// //       driverUniqueId,
// //     }
// //   );
// //   console.log("@existingGift", existingGift);
// //   const giftData = existingGift?.data?.[0];
// //   if (giftData) {
// //     return {
// //       message: "error",
// //       error: "You already have a free gift for this plan.",
// //       data: giftData,
// //     };
// //   }
// //   // prepare giftEndDate based on plan duration
// //   if (activePricingData?.durationInDays) {
// //     giftEndDate = modifyDateTime(
// //       giftStartDate,
// //       activePricingData?.durationInDays
// //     );
// //   }
// //   if (giftEndDate && giftEndDate < new Date().toISOString().slice(0, 10))
// //     return { message: "error", error: "Gift end date cannot be in the past" };
// //   if (giftEndDate && !giftStartDate)
// //     return { message: "error", error: "Gift start date is required" };
// //   if (!giftEndDate && giftStartDate)
// //     return { message: "error", error: "Gift end date is required" };

// //   if (giftEndDate && giftEndDate < giftStartDate) {
// //     return {
// //       message: "error",
// //       error: "Gift end date cannot be before start date",
// //     };
// //   }
// //   const sql = `
// //     INSERT INTO FreeGiftToDriver
// //     (freeGiftUniqueId, driverUniqueId, subscriptionPlanUniqueId, giftStartDate, giftEndDate)
// //     VALUES (?, ?, ?, ?, ?)
// //   `;
// //   const values = [
// //     freeGiftUniqueId,
// //     driverUniqueId,
// //     subscriptionPlanUniqueId,
// //     giftStartDate,
// //     giftEndDate,
// //   ];

// //   const [result] = await pool.query(sql, values);
// //   // If there is free gifts balance must increase
// //   const price = activePricingData?.price;
// //   const newBalance = await prepareAndCreateNewBalance({
// //     addOrDeduct: "add",
// //     amount: price,
// //     driverUniqueId,
// //     transactionUniqueId: freeGiftUniqueId,
// //     transactionType: "freeGift",
// //   });

// //   return result.affectedRows > 0
// //     ? {
// //         message: "success",
// //         data: {
// //           freeGiftUniqueId,
// //           driverUniqueId,
// //           subscriptionPlanUniqueId,
// //           giftStartDate,
// //           giftEndDate,
// //         },
// //       }
// //     : { message: "error", error: "Failed to save free gift record" };
// // };

// // // Get All
// // const getAllFreeGiftToDrivers = async () => {
// //   const sql = `SELECT *
// // FROM FreeGiftToDriver
// // JOIN SubscriptionPlan
// //   ON FreeGiftToDriver.subscriptionPlanUniqueId = SubscriptionPlan.subscriptionPlanUniqueId
// // JOIN SubscriptionPlanPricing
// //   ON SubscriptionPlan.subscriptionPlanUniqueId = SubscriptionPlanPricing.subscriptionPlanUniqueId where isFreeGiftDeleted=?
// // ORDER BY FreeGiftToDriver.giftCreatedAt DESC;
// // `;
// //   const [result] = await pool.query(sql, false);
// //   return { message: "success", data: result };
// // };
// // const getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId = async ({
// //   subscriptionPlanUniqueId,
// //   driverUniqueId,
// // }) => {
// //   console.log(
// //     "@getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId subscriptionPlanUniqueId",
// //     subscriptionPlanUniqueId,
// //     "driverUniqueId",
// //     driverUniqueId
// //   );
// //   const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId WHERE FreeGiftToDriver.subscriptionPlanUniqueId = ? AND FreeGiftToDriver.driverUniqueId = ? `;
// //   const [result] = await pool.query(sql, [
// //     subscriptionPlanUniqueId,
// //     driverUniqueId,
// //   ]);
// //   return { data: result, message: "success" };
// // };

// // // Get by Unique ID
// // const getFreeGiftToDriverByUniqueId = async (freeGiftUniqueId) => {
// //   const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId join SubscriptionPlanPricing on SubscriptionPlanPricing.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId  WHERE freeGiftUniqueId = ? and isFreeGiftDeleted=?`;
// //   const [result] = await pool.query(sql, [freeGiftUniqueId, false]);
// //   return result.length > 0
// //     ? { message: "success", data: result[0] }
// //     : { message: "error", error: "Gift not found" };
// // };

// // // Get by Driver
// // const getFreeGiftToDriverByDriverId = async (driverUniqueId) => {
// //   const sql = `SELECT * FROM FreeGiftToDriver join SubscriptionPlan on FreeGiftToDriver.subscriptionPlanUniqueId=SubscriptionPlan.subscriptionPlanUniqueId  WHERE FreeGiftToDriver.driverUniqueId = ? and isFreeGiftDeleted=? ORDER BY giftCreatedAt DESC`;
// //   const [result] = await pool.query(sql, [driverUniqueId, false]);
// //   return { message: "success", data: result };
// // };

// // // Delete
// // const deleteFreeGiftToDriverByUniqueId = async ({
// //   freeGiftUniqueId,
// //   userUniqueId,
// // }) => {
// //   const today = currentDate();
// //   if (!freeGiftUniqueId) {
// //     return { message: "error", error: "Free gift unique ID is required" };
// //   }

// //   const sql = `update FreeGiftToDriver set isFreeGiftDeleted=?,freeGiftDeletedAt=?,freeGiftDeletedBy=?  WHERE freeGiftUniqueId = ?`;
// //   const [result] = await pool.query(sql, [
// //     true,
// //     today,
// //     userUniqueId,
// //     freeGiftUniqueId,
// //   ]);
// //   return result.affectedRows > 0
// //     ? {
// //         message: "success",
// //         data: `Gift deleted successfully`,
// //       }
// //     : { message: "error", error: "Failed to delete gift" };
// // };
// // const updateFreeGiftToDriverByUniqueId = async (body) => {
// //   const { freeGiftUniqueId, ...updateFields } = body;

// //   if (!freeGiftUniqueId || Object.keys(updateFields).length === 0) {
// //     return {
// //       message: "error",
// //       error: "Missing required fields to update free gift",
// //     };
// //   }

// //   const fields = [];
// //   const values = [];

// //   for (const [key, value] of Object.entries(updateFields)) {
// //     fields.push(`${key} = ?`);
// //     values.push(value);
// //   }

// //   // ✅ Push WHERE clause value
// //   values.push(freeGiftUniqueId);

// //   const sql = `UPDATE FreeGiftToDriver SET ${fields.join(
// //     ", "
// //   )} WHERE freeGiftUniqueId = ?`;

// //   const [result] = await pool.query(sql, values);

// //   return result.affectedRows > 0
// //     ? { message: "success", data: "Gift updated successfully" }
// //     : { message: "error", error: "Failed to update gift" };
// // };

// // module.exports = {
// //   updateFreeGiftToDriverByUniqueId,
// //   getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId,
// //   createFreeGiftToDriver,
// //   getAllFreeGiftToDrivers,
// //   getFreeGiftToDriverByUniqueId,
// //   getFreeGiftToDriverByDriverId,
// //   deleteFreeGiftToDriverByUniqueId,
// // };
// const { pool } = require("../Middleware/Database.config");
// const { v4: uuidv4 } = require("uuid");
// const { currentDate } = require("../Utils/CurrentDate");

// const modifyDateTime = require("../Utils/adjustDateTime");
// const {
//   prepareAndCreateNewBalance,
// } = require("./DriverBalance.service/DriverBalance.post.service");
// const { getPricingWithFilters } = require("./SubscriptionPlanPricing.service");

// // Consolidated service method for filtering
// const getFreeGiftToDriversWithFilters = async (filters = {}) => {
//   const {
//     page = 1,
//     limit = 10,

//     // ID filters
//     freeGiftUniqueId,
//     driverUniqueId,
//     subscriptionPlanUniqueId,

//     // Status filters
//     isActive,
//     isExpired,
//     isUpcoming,
//     isFreeGiftDeleted = false,

//     // Date filters
//     giftStartDateBefore,
//     giftStartDateAfter,
//     giftEndDateBefore,
//     giftEndDateAfter,
//     giftCreatedAtStart,
//     giftCreatedAtEnd,

//     // Plan filters
//     planName,
//     isFree,

//     // Pricing filters
//     minPrice,
//     maxPrice,
//     durationInDays,

//     // User filters
//     createdBy,
//     updatedBy,
//     deletedBy,

//     // Sorting
//     sortBy = "giftCreatedAt",
//     sortOrder = "DESC",
//   } = filters;

//   const offset = (page - 1) * limit;

//   // Start building WHERE clause
//   let whereClauses = ["fg.isFreeGiftDeleted = ?"];
//   let queryParams = [isFreeGiftDeleted];
//   let countParams = [isFreeGiftDeleted];

//   // ID-based filters
//   if (freeGiftUniqueId) {
//     whereClauses.push("fg.freeGiftUniqueId = ?");
//     queryParams.push(freeGiftUniqueId);
//     countParams.push(freeGiftUniqueId);
//   }

//   if (driverUniqueId) {
//     whereClauses.push("fg.driverUniqueId = ?");
//     queryParams.push(driverUniqueId);
//     countParams.push(driverUniqueId);
//   }

//   if (subscriptionPlanUniqueId) {
//     whereClauses.push("fg.subscriptionPlanUniqueId = ?");
//     queryParams.push(subscriptionPlanUniqueId);
//     countParams.push(subscriptionPlanUniqueId);
//   }

//   // Status filters
//   const now = new Date().toISOString().slice(0, 19).replace("T", " ");

//   if (isActive !== undefined) {
//     if (isActive) {
//       whereClauses.push("? BETWEEN fg.giftStartDate AND fg.giftEndDate");
//       queryParams.push(now);
//       countParams.push(now);
//     } else {
//       whereClauses.push("(? < fg.giftStartDate OR ? > fg.giftEndDate)");
//       queryParams.push(now, now);
//       countParams.push(now, now);
//     }
//   }

//   if (isExpired) {
//     whereClauses.push("fg.giftEndDate < ?");
//     queryParams.push(now);
//     countParams.push(now);
//   }

//   if (isUpcoming) {
//     whereClauses.push("fg.giftStartDate > ?");
//     queryParams.push(now);
//     countParams.push(now);
//   }

//   // Date filters
//   if (giftStartDateBefore) {
//     whereClauses.push("fg.giftStartDate <= ?");
//     queryParams.push(giftStartDateBefore);
//     countParams.push(giftStartDateBefore);
//   }

//   if (giftStartDateAfter) {
//     whereClauses.push("fg.giftStartDate >= ?");
//     queryParams.push(giftStartDateAfter);
//     countParams.push(giftStartDateAfter);
//   }

//   if (giftEndDateBefore) {
//     whereClauses.push("fg.giftEndDate <= ?");
//     queryParams.push(giftEndDateBefore);
//     countParams.push(giftEndDateBefore);
//   }

//   if (giftEndDateAfter) {
//     whereClauses.push("fg.giftEndDate >= ?");
//     queryParams.push(giftEndDateAfter);
//     countParams.push(giftEndDateAfter);
//   }

//   if (giftCreatedAtStart) {
//     whereClauses.push("fg.giftCreatedAt >= ?");
//     queryParams.push(giftCreatedAtStart);
//     countParams.push(giftCreatedAtStart);
//   }

//   if (giftCreatedAtEnd) {
//     whereClauses.push("fg.giftCreatedAt <= ?");
//     queryParams.push(giftCreatedAtEnd);
//     countParams.push(giftCreatedAtEnd);
//   }

//   // Plan filters
//   if (planName) {
//     whereClauses.push("LOWER(sp.planName) LIKE LOWER(?)");
//     queryParams.push(`%${planName}%`);
//     countParams.push(`%${planName}%`);
//   }

//   if (isFree !== undefined) {
//     whereClauses.push("sp.isFree = ?");
//     queryParams.push(isFree);
//     countParams.push(isFree);
//   }

//   // Pricing filters
//   if (minPrice !== undefined) {
//     whereClauses.push("spp.price >= ?");
//     queryParams.push(minPrice);
//     countParams.push(minPrice);
//   }

//   if (maxPrice !== undefined) {
//     whereClauses.push("spp.price <= ?");
//     queryParams.push(maxPrice);
//     countParams.push(maxPrice);
//   }

//   if (durationInDays) {
//     whereClauses.push("spp.durationInDays = ?");
//     queryParams.push(durationInDays);
//     countParams.push(durationInDays);
//   }

//   // User filters
//   if (createdBy) {
//     whereClauses.push("fg.giftCreatedBy = ?");
//     queryParams.push(createdBy);
//     countParams.push(createdBy);
//   }

//   if (updatedBy) {
//     whereClauses.push("fg.freeGiftUpdatedBy = ?");
//     queryParams.push(updatedBy);
//     countParams.push(updatedBy);
//   }

//   if (deletedBy) {
//     whereClauses.push("fg.freeGiftDeletedBy = ?");
//     queryParams.push(deletedBy);
//     countParams.push(deletedBy);
//   }

//   // Build WHERE clause
//   const whereClause =
//     whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

//   // Validate and map sort column
//   const sortColumnMap = {
//     freeGiftId: "fg.freeGiftId",
//     giftCreatedAt: "fg.giftCreatedAt",
//     giftStartDate: "fg.giftStartDate",
//     giftEndDate: "fg.giftEndDate",
//     planName: "sp.planName",
//     price: "spp.price",
//     durationInDays: "spp.durationInDays",
//   };

//   const validSortOrder = ["ASC", "DESC"];
//   const orderDirection = validSortOrder.includes(sortOrder.toUpperCase())
//     ? sortOrder.toUpperCase()
//     : "DESC";

//   const orderColumn = sortColumnMap[sortBy] || "fg.giftCreatedAt";

//   // Main query
//   const sql = `
//     SELECT
//       fg.*,
//       sp.planName,
//       sp.description as planDescription,
//       sp.isFree,
//       spp.price,
//       spp.durationInDays,
//       u.fullName as driverName,
//       u.phoneNumber as driverPhone,
//       CASE
//         WHEN NOW() BETWEEN fg.giftStartDate AND fg.giftEndDate THEN 'active'
//         WHEN NOW() < fg.giftStartDate THEN 'upcoming'
//         WHEN NOW() > fg.giftEndDate THEN 'expired'
//       END as giftStatus,
//       DATEDIFF(fg.giftEndDate, NOW()) as daysUntilExpiry,
//       DATEDIFF(fg.giftEndDate, fg.giftStartDate) as totalGiftDays
//     FROM FreeGiftToDriver fg
//     LEFT JOIN SubscriptionPlan sp
//       ON fg.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
//     LEFT JOIN SubscriptionPlanPricing spp
//       ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
//       AND NOW() BETWEEN spp.effectiveFrom AND COALESCE(spp.effectiveTo, '9999-12-31')
//     LEFT JOIN Users u
//       ON fg.driverUniqueId = u.userUniqueId
//     ${whereClause}
//     ORDER BY ${orderColumn} ${orderDirection}
//     LIMIT ? OFFSET ?
//   `;

//   // Count query
//   const countSql = `
//     SELECT COUNT(*) as total
//     FROM FreeGiftToDriver fg
//     LEFT JOIN SubscriptionPlan sp
//       ON fg.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
//     LEFT JOIN SubscriptionPlanPricing spp
//       ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
//       AND NOW() BETWEEN spp.effectiveFrom AND COALESCE(spp.effectiveTo, '9999-12-31')
//     ${whereClause}
//   `;

//   // Add pagination to query params
//   const mainQueryParams = [...queryParams, parseInt(limit), offset];

//   try {
//     const [rows] = await pool.query(sql, mainQueryParams);
//     const [countRes] = await pool.query(countSql, countParams);
//     const total = countRes[0]?.total || 0;

//     return {
//       message: "success",
//       data: rows,
//       pagination: {
//         currentPage: parseInt(page),
//         itemsPerPage: parseInt(limit),
//         totalItems: total,
//         totalPages: Math.ceil(total / limit),
//         hasNext: page < Math.ceil(total / limit),
//         hasPrev: page > 1,
//       },
//       filters: Object.keys(filters).length > 0 ? filters : undefined,
//     };
//   } catch (error) {
//     console.error("Error in getFreeGiftToDriversWithFilters:", error);
//     return {
//       message: "error",
//       error: "Failed to fetch free gifts",
//       details: error.message,
//     };
//   }
// };

// // Get count only
// const getFreeGiftToDriversCount = async (filters = {}) => {
//   // Reuse the same WHERE logic but only return count
//   const result = await getFreeGiftToDriversWithFilters({
//     ...filters,
//     page: 1,
//     limit: 1,
//   });

//   return {
//     message: "success",
//     data: {
//       totalCount: result.pagination?.totalItems || 0,
//     },
//     filters,
//   };
// };

// // Get by Unique ID (for single record lookup)
// const getFreeGiftToDriverByUniqueId = async (freeGiftUniqueId) => {
//   const sql = `SELECT * FROM FreeGiftToDriver fg
//     JOIN SubscriptionPlan sp ON fg.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
//     JOIN SubscriptionPlanPricing spp ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
//     WHERE fg.freeGiftUniqueId = ? AND fg.isFreeGiftDeleted = ?`;

//   const [result] = await pool.query(sql, [freeGiftUniqueId, false]);

//   return result.length > 0
//     ? { message: "success", data: result[0] }
//     : { message: "error", error: "Gift not found" };
// };

// // Keep other service methods
// const createFreeGiftToDriver = async ({
//   driverUniqueId,
//   subscriptionPlanUniqueId,
//   giftStartDate,
// }) => {
//   const freeGiftUniqueId = uuidv4();
//   let giftEndDate = null;

//   if (!driverUniqueId || !subscriptionPlanUniqueId || !giftStartDate) {
//     return {
//       message: "error",
//       error: "Missing required fields to create free gift",
//     };
//   }

//   if (giftStartDate < new Date().toISOString().slice(0, 10)) {
//     return { message: "error", error: "Gift start date cannot be in the past" };
//   }

//   // get plan and its price
//   const today = currentDate();
//   // const activePricing = await getActiveSubscriptionPlanningPrice({
//   //   subscriptionPlanUniqueId,
//   //   today,
//   // });
//   const activePricing = await getPricingWithFilters({
//     subscriptionPlanUniqueId,
//     today,
//   });

//   const activePricingData = activePricing?.data?.[0];

//   if (!activePricingData) {
//     return {
//       message: "error",
//       error: "You can't create free gift using this plan.",
//     };
//   }

//   // check if the user has this gift already
//   const existingGiftResult = await getFreeGiftToDriversWithFilters({
//     driverUniqueId,
//     subscriptionPlanUniqueId,
//     isFreeGiftDeleted: false,
//     limit: 1,
//   });

//   if (existingGiftResult.data && existingGiftResult.data.length > 0) {
//     return {
//       message: "error",
//       error: "You already have a free gift for this plan.",
//       data: existingGiftResult.data[0],
//     };
//   }

//   // prepare giftEndDate based on plan duration
//   if (activePricingData?.durationInDays) {
//     giftEndDate = modifyDateTime(giftStartDate, {
//       days: activePricingData.durationInDays,
//     });
//   }

//   if (!giftEndDate) {
//     return { message: "error", error: "Could not calculate gift end date" };
//   }

//   if (giftEndDate < giftStartDate) {
//     return {
//       message: "error",
//       error: "Gift end date cannot be before start date",
//     };
//   }

//   const sql = `
//     INSERT INTO FreeGiftToDriver
//     (freeGiftUniqueId, driverUniqueId, subscriptionPlanUniqueId, giftStartDate, giftEndDate)
//     VALUES (?, ?, ?, ?, ?)
//   `;

//   const values = [
//     freeGiftUniqueId,
//     driverUniqueId,
//     subscriptionPlanUniqueId,
//     giftStartDate,
//     giftEndDate,
//   ];

//   const [result] = await pool.query(sql, values);

//   // If there is free gifts balance must increase
//   if (result.affectedRows > 0) {
//     const price = activePricingData?.price;
//     await prepareAndCreateNewBalance({
//       addOrDeduct: "add",
//       amount: price,
//       driverUniqueId,
//       transactionUniqueId: freeGiftUniqueId,
//       transactionType: "freeGift",
//     });

//     return {
//       message: "success",
//       data: {
//         freeGiftUniqueId,
//         driverUniqueId,
//         subscriptionPlanUniqueId,
//         giftStartDate,
//         giftEndDate,
//       },
//     };
//   }

//   return { message: "error", error: "Failed to save free gift record" };
// };

// const deleteFreeGiftToDriverByUniqueId = async ({
//   freeGiftUniqueId,
//   userUniqueId,
// }) => {
//   const today = currentDate();
//   if (!freeGiftUniqueId) {
//     return { message: "error", error: "Free gift unique ID is required" };
//   }

//   const sql = `UPDATE FreeGiftToDriver
//     SET isFreeGiftDeleted = ?, freeGiftDeletedAt = ?, freeGiftDeletedBy = ?
//     WHERE freeGiftUniqueId = ?`;

//   const [result] = await pool.query(sql, [
//     true,
//     today,
//     userUniqueId,
//     freeGiftUniqueId,
//   ]);

//   return result.affectedRows > 0
//     ? {
//         message: "success",
//         data: `Gift deleted successfully`,
//       }
//     : { message: "error", error: "Failed to delete gift" };
// };

// const updateFreeGiftToDriverByUniqueId = async (body) => {
//   const { freeGiftUniqueId, ...updateFields } = body;

//   if (!freeGiftUniqueId || Object.keys(updateFields).length === 0) {
//     return {
//       message: "error",
//       error: "Missing required fields to update free gift",
//     };
//   }

//   const fields = [];
//   const values = [];

//   for (const [key, value] of Object.entries(updateFields)) {
//     fields.push(`${key} = ?`);
//     values.push(value);
//   }

//   // Add updated timestamp
//   fields.push("freeGiftUpdatedAt = ?");
//   values.push(new Date().toISOString().slice(0, 19).replace("T", " "));

//   // Push WHERE clause value
//   values.push(freeGiftUniqueId);

//   const sql = `UPDATE FreeGiftToDriver SET ${fields.join(
//     ", "
//   )} WHERE freeGiftUniqueId = ?`;

//   const [result] = await pool.query(sql, values);

//   return result.affectedRows > 0
//     ? { message: "success", data: "Gift updated successfully" }
//     : { message: "error", error: "Failed to update gift" };
// };

// module.exports = {
//   getFreeGiftToDriversWithFilters,
//   getFreeGiftToDriversCount,
//   getFreeGiftToDriverByUniqueId,
//   createFreeGiftToDriver,
//   deleteFreeGiftToDriverByUniqueId,
//   updateFreeGiftToDriverByUniqueId,
// };
