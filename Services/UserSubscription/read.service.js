"use strict";

const {
  pool
} = require("../../Middleware/Database.config");




const AppError = require("../../Utils/AppError");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Consolidated service method for filtering
const getUserSubscriptionsWithFilters = async (filters = {}, connection) => {
  const {
    page = 1,
    limit = 10,
    // ID filters
    userSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
    // Status filters
    isActive,
    isFree,
    // Date filters
    startDateBefore,
    startDateAfter,
    endDateBefore,
    endDateAfter,
    createdAtStart,
    createdAtEnd,
    // Plan filters
    planName,
    planDescription,
    // Pricing filters
    minPrice,
    maxPrice,
    // Special filters
    daily,
    monthly,
    upcomingExpiry,
    expired,
    // Sorting
    sortBy = "userSubscriptionId",
    sortOrder = "DESC"
  } = filters;
  const offset = (page - 1) * parseInt(limit);

  // Start building WHERE clause
  let whereClauses = [];
  let queryParams = [];

  // ID-based filters
  if (userSubscriptionUniqueId) {
    whereClauses.push("ds.userSubscriptionUniqueId = ?");
    queryParams.push(userSubscriptionUniqueId);
  }
  if (driverUniqueId) {
    whereClauses.push("ds.driverUniqueId = ?");
    queryParams.push(driverUniqueId);
  }
  if (subscriptionPlanPricingUniqueId) {
    whereClauses.push("spp.subscriptionPlanPricingUniqueId = ?");
    queryParams.push(subscriptionPlanPricingUniqueId);
  }

  // Status filters - FIXED: Use DATE() to compare only date parts
  if (isActive !== undefined) {
    if (isActive) {
      whereClauses.push("CURDATE() BETWEEN DATE(ds.startDate) AND DATE(ds.endDate)");
    } else {
      whereClauses.push("CURDATE() NOT BETWEEN DATE(ds.startDate) AND DATE(ds.endDate)");
    }
  }
  if (isFree !== undefined) {
    whereClauses.push("sp.isFree = ?");
    queryParams.push(isFree);
  }

  // Date filters - Handle with DATE() for consistency
  if (startDateBefore) {
    whereClauses.push("DATE(ds.startDate) <= DATE(?)");
    queryParams.push(startDateBefore);
  }
  if (startDateAfter) {
    whereClauses.push("DATE(ds.startDate) >= DATE(?)");
    queryParams.push(startDateAfter);
  }
  if (endDateBefore) {
    whereClauses.push("DATE(ds.endDate) <= DATE(?)");
    queryParams.push(endDateBefore);
  }
  if (endDateAfter) {
    whereClauses.push("DATE(ds.endDate) >= DATE(?)");
    queryParams.push(endDateAfter);
  }
  if (createdAtStart) {
    whereClauses.push("DATE(ds.userSubscriptionCreatedAt) >= DATE(?)");
    queryParams.push(createdAtStart);
  }
  if (createdAtEnd) {
    whereClauses.push("DATE(ds.userSubscriptionCreatedAt) <= DATE(?)");
    queryParams.push(createdAtEnd);
  }

  // Plan filters
  if (planName) {
    whereClauses.push("LOWER(sp.planName) LIKE LOWER(?)");
    queryParams.push(`%${planName}%`);
  }
  if (planDescription) {
    whereClauses.push("LOWER(sp.description) LIKE LOWER(?)");
    queryParams.push(`%${planDescription}%`);
  }

  // Pricing filters
  if (minPrice !== undefined) {
    whereClauses.push("spp.price >= ?");
    queryParams.push(minPrice);
  }
  if (maxPrice !== undefined) {
    whereClauses.push("spp.price <= ?");
    queryParams.push(maxPrice);
  }

  // Special filters - FIXED: Use CURDATE() directly
  if (daily) {
    whereClauses.push("DATE(ds.startDate) = CURDATE()");
  }
  if (monthly) {
    whereClauses.push("YEAR(ds.startDate) = YEAR(CURDATE()) AND MONTH(ds.startDate) = MONTH(CURDATE())");
  }
  if (upcomingExpiry) {
    whereClauses.push("DATE(ds.endDate) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)");
  }
  if (expired) {
    whereClauses.push("DATE(ds.endDate) < CURDATE()");
  }

  // Add soft delete filter - exclude deleted subscriptions
  whereClauses.push("ds.userSubscriptionDeletedAt IS NULL");

  // Build WHERE clause
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Validate and map sort column
  const sortColumnMap = {
    userSubscriptionId: "ds.userSubscriptionId",
    startDate: "ds.startDate",
    endDate: "ds.endDate",
    createdAt: "ds.userSubscriptionCreatedAt",
    planName: "sp.planName",
    price: "spp.price",
    subscriptionStatus: `CASE
      WHEN CURDATE() BETWEEN DATE(ds.startDate) AND DATE(ds.endDate) THEN 'active'
      WHEN CURDATE() < DATE(ds.startDate) THEN 'upcoming'
      WHEN CURDATE() > DATE(ds.endDate) THEN 'expired'
    END`,
    daysUntilExpiry: "DATEDIFF(ds.endDate, CURDATE())"
  };
  const validSortOrder = ["ASC", "DESC"];
  const orderDirection = validSortOrder.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "DESC";
  const orderColumn = sortColumnMap[sortBy] || "ds.userSubscriptionId";
  const sql = `
    SELECT
      ds.*,
      sp.planName,
      sp.description as planDescription,
      sp.isFree,
      spp.price,
      spp.effectiveFrom,
      spp.effectiveTo,
      spp.subscriptionPlanPricingUniqueId,
      CASE
        WHEN CURDATE() BETWEEN DATE(ds.startDate) AND DATE(ds.endDate) THEN 'active'
        WHEN CURDATE() < DATE(ds.startDate) THEN 'upcoming'
        WHEN CURDATE() > DATE(ds.endDate) THEN 'expired'
      END as subscriptionStatus,
      DATEDIFF(ds.endDate, CURDATE()) as daysUntilExpiry
    FROM UserSubscription ds
    LEFT JOIN SubscriptionPlanPricing spp
      ON ds.subscriptionPlanPricingUniqueId = spp.subscriptionPlanPricingUniqueId
    LEFT JOIN SubscriptionPlan sp
      ON spp.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    ${whereClause}
    ORDER BY ${orderColumn} ${orderDirection}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total
    FROM UserSubscription ds
    LEFT JOIN SubscriptionPlanPricing spp
      ON ds.subscriptionPlanPricingUniqueId = spp.subscriptionPlanPricingUniqueId
    LEFT JOIN SubscriptionPlan sp
      ON spp.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || connection || pool;
  const [rows] = await executor.query(sql, [...queryParams, parseInt(limit), offset]);
  const [countRes] = await executor.query(countSql, queryParams);
  const total = countRes[0]?.total || 0;
  return {
    message: "User subscriptions fetched successfully",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      limit: parseInt(limit),
      totalItems: total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
    filters: Object.keys(filters).length > 0 ? filters : undefined
  };
};

// Get count only (separate method for count requests)

// Get count only (separate method for count requests)
const getUserSubscriptionsCount = async (filters = {}, connection) => {
  const result = await getUserSubscriptionsWithFilters({
    ...filters,
    page: 1,
    limit: 1
  }, connection);
  return {
    message: "User subscriptions count fetched successfully",
    data: {
      totalCount: result.pagination?.totalItems || 0
    },
    filters
  };
};

//get unassigned free plan before grant

//get unassigned free plan before grant
const getUnassignedFreePlans = async (filters = {}, connection) => {
  const {
    page = 1,
    limit = 10,
    driverUniqueId,
    // MANDATORY: need to know which driver to check for
    planName,
    planDescription,
    sortBy = "planName",
    sortOrder = "ASC"
  } = filters;
  if (!driverUniqueId) {
    throw new AppError("driverUniqueId is required to check unassigned free plans", AppError.BAD_REQUEST);
  }
  const safeLimit = Math.max(1, parseInt(limit));
  const offset = (page - 1) * safeLimit;
  const whereClauses = ["sp.isFree = TRUE"];
  const params = [driverUniqueId];
  whereClauses.push(`
    NOT EXISTS (
      SELECT 1 
      FROM UserSubscription ds 
      JOIN SubscriptionPlanPricing spp2 ON ds.subscriptionPlanPricingUniqueId = spp2.subscriptionPlanPricingUniqueId
      WHERE spp2.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
        AND ds.driverUniqueId = ?
        AND Date(ds.endDate) >= Date(CURDATE()) 
    )
  `);
  if (planName) {
    whereClauses.push("LOWER(sp.planName) LIKE LOWER(?)");
    params.push(`%${planName}%`);
  }
  if (planDescription) {
    whereClauses.push("LOWER(sp.description) LIKE LOWER(?)");
    params.push(`%${planDescription}%`);
  }
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const sql = `
    SELECT
      sp.*,
      spp.subscriptionPlanPricingUniqueId,
      spp.price,
      spp.effectiveFrom,
      spp.effectiveTo,
      EXISTS (
        SELECT 1
        FROM UserSubscription ds
        JOIN SubscriptionPlanPricing spp2 ON ds.subscriptionPlanPricingUniqueId = spp2.subscriptionPlanPricingUniqueId
        WHERE spp2.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
          AND ds.driverUniqueId = ?
      ) as hasEverHadPlan
    FROM SubscriptionPlan sp
    INNER JOIN SubscriptionPlanPricing spp
      ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
      AND CURDATE() BETWEEN DATE(spp.effectiveFrom) AND COALESCE(DATE(spp.effectiveTo), '9999-12-31')
    ${whereClause}
    ORDER BY sp.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total
    FROM SubscriptionPlan sp
    LEFT JOIN SubscriptionPlanPricing spp
      ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
      AND CURDATE() BETWEEN DATE(spp.effectiveFrom) AND COALESCE(DATE(spp.effectiveTo), '9999-12-31')
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || connection || pool;
  const [rows] = await executor.query(sql, [driverUniqueId, ...params, safeLimit, offset]);
  const [countRes] = await executor.query(countSql, params);
  const total = countRes[0]?.total || 0;
  return {
    message: "Unassigned free plans fetched successfully",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      limit: safeLimit,
      totalItems: total,
      totalPages: Math.ceil(total / safeLimit),
    },
    filters
  };
};

module.exports = {
  getUserSubscriptionsWithFilters,
  getUserSubscriptionsCount,
  getUnassignedFreePlans
};
