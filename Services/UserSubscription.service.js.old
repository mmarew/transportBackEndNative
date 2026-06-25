const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const {
  prepareAndCreateNewBalance,
} = require("./UserBalance.service/UserBalance.post.service");

const { getPricingWithFilters } = require("./SubscriptionPlanPricing.service");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { transactionStorage } = require("../Utils/TransactionContext");

function getDaysBetweenDates(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffInMs = Math.abs(d2 - d1);
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays;
}

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Create subscription
const createUserSubscription = async ({
  driverUniqueId,
  subscriptionPlanPricingUniqueId,
  userSubscriptionCreatedBy,
}) => {
  const userSubscriptionUniqueId = uuidv4();
  const today = currentDate();

  const activePricing = await getPricingWithFilters({
    subscriptionPlanPricingUniqueId,
    isActive: true,
  });
  const activePricingData = activePricing?.data?.[0];
  logger.debug("@activePricingData", {
    activePricingData,
    subscriptionPlanPricingUniqueId,
  });

  if (!activePricingData) {
    throw new AppError("There is no such kind of plan pricing.", 400);
  }

  const isFree = activePricingData?.isFree;
  const price = activePricingData?.price;
  const effectiveFrom = activePricingData?.effectiveFrom;
  const effectiveTo = activePricingData?.effectiveTo;

  // Use durationInDays from pricing when available; only compute from dates if BOTH are set
  let durationInDays = activePricingData?.durationInDays;
  if (
    durationInDays === null ||
    durationInDays === undefined ||
    durationInDays <= 0
  ) {
    if (effectiveFrom && effectiveTo) {
      durationInDays = getDaysBetweenDates(effectiveFrom, effectiveTo);
    } else {
      throw new AppError(
        "durationInDays is missing for this pricing configuration.",
        400,
      );
    }
  }

  let savedEndDate = null,
    savedStartDate = null;

  if (isFree) {
    const filters = {
      driverUniqueId,
      subscriptionPlanPricingUniqueId,
    };
    const checkGrantedBefore = await getUserSubscriptionsWithFilters(filters);
    const dataGrantedBefore = checkGrantedBefore?.data?.[0];
    if (dataGrantedBefore) {
      throw new AppError(
        "You have already registered for a free trial once.",
        400,
      );
    }
  }

  const activeSubscription = await getUserSubscriptionsWithFilters({
    driverUniqueId,
    limit: 1,
  });
  const activeSubscriptionData = activeSubscription?.data?.[0];

  if (activeSubscriptionData) {
    savedEndDate = activeSubscriptionData?.endDate;
    savedStartDate = savedEndDate;
  }

  const executor = transactionStorage.getStore() || pool;

  // 1. Deduct/add balance for subscription
  // Note: prepareAndCreateNewBalance now throws AppError
  const balanceResult = await prepareAndCreateNewBalance({
    addOrDeduct: activePricingData?.isFree ? "add" : "deduct",
    amount: price,
    driverUniqueId,
    transactionUniqueId: userSubscriptionUniqueId,
    transactionType: "Subscription",
    isFree,
    userBalanceCreatedBy: driverUniqueId,
  });
  logger.debug("@balanceResult", balanceResult);

  // 2. Insert subscription record
  const nextDate = addDays(
    savedEndDate ? savedEndDate : today,
    durationInDays,
  );
  const sql = `
    INSERT INTO UserSubscription 
    (userSubscriptionUniqueId, driverUniqueId, subscriptionPlanPricingUniqueId, startDate, endDate, userSubscriptionCreatedBy, userSubscriptionCreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    userSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
    savedStartDate ? savedStartDate : today,
    nextDate,
    userSubscriptionCreatedBy || driverUniqueId,
    currentDate(),
  ];

  const [insertResult] = await executor.query(sql, values);

  if (insertResult.affectedRows === 0) {
    throw new AppError("Failed to create subscription", 500);
  }

  const result = {
    userSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
  };

  // Fetch the newly created subscription with full plan details
  const newSubscription = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1,
  });

  return {
    message: "success",
    data: [newSubscription?.data?.[0] || result], // Return as array to match GET
    pagination: {
      currentPage: 1,
      itemsPerPage: 1,
      totalItems: newSubscription?.pagination?.totalItems || 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      userSubscriptionUniqueId,
      driverUniqueId,
    },
  };
};

// Update by UUID - Dynamic update (only updates provided fields)
const updateUserSubscriptionByUniqueId = async (
  userSubscriptionUniqueId,
  data,
) => {
  if (!userSubscriptionUniqueId || !data || Object.keys(data).length === 0) {
    throw new AppError("Missing subscription ID or update data", 400);
  }

  // Exclude fields that should never be updated
  const excludedFields = ["userSubscriptionUniqueId", "userSubscriptionId"];

  // Build dynamic SET clause
  const updates = [];
  const values = [];

  Object.keys(data).forEach((key) => {
    if (!excludedFields.includes(key) && data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  });

  if (updates.length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  // Add userSubscriptionUpdatedAt timestamp
  updates.push(`userSubscriptionUpdatedAt = ?`);

  // Add WHERE clause value
  values.push(currentDate(), userSubscriptionUniqueId);

  const sql = `
    UPDATE UserSubscription 
    SET ${updates.join(", ")}
    WHERE userSubscriptionUniqueId = ?
  `;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Subscription not found or no changes made", 404);
  }

  // Fetch updated subscription to return full data
  const updatedSubscription = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1,
  });

  return {
    message: "success",
    data: [updatedSubscription?.data?.[0] || { userSubscriptionUniqueId }], // Return as array to match GET
    pagination: {
      currentPage: 1,
      itemsPerPage: 1,
      totalItems: updatedSubscription?.pagination?.totalItems || 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      userSubscriptionUniqueId,
    },
  };
};

// Delete by UUID - Soft delete using the existing update method
const deleteUserSubscriptionByUniqueId = async (
  userSubscriptionUniqueId,
  userUniqueId,
) => {
  // First check if subscription exists and is not already deleted
  const existingSubscriptionRes = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1,
  });
  const existingSubscription = existingSubscriptionRes?.data?.[0];

  if (!existingSubscription) {
    throw new AppError("Subscription not found", 404);
  }

  // Check if already soft deleted
  if (existingSubscription.userSubscriptionDeletedAt) {
    throw new AppError("Subscription is already deleted", 400);
  }

  // Use the existing update method to perform soft delete
  const deleteData = {
    userSubscriptionDeletedAt: currentDate(),
    userSubscriptionDeletedBy: userUniqueId,
  };

  await updateUserSubscriptionByUniqueId(userSubscriptionUniqueId, deleteData);

  return {
    message: "success",
    data: `Subscription ${userSubscriptionUniqueId} marked as deleted successfully`,
  };
};

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
    sortOrder = "DESC",
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
      whereClauses.push(
        "CURDATE() BETWEEN DATE(ds.startDate) AND DATE(ds.endDate)",
      );
    } else {
      whereClauses.push(
        "CURDATE() NOT BETWEEN DATE(ds.startDate) AND DATE(ds.endDate)",
      );
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
    whereClauses.push(
      "YEAR(ds.startDate) = YEAR(CURDATE()) AND MONTH(ds.startDate) = MONTH(CURDATE())",
    );
  }

  if (upcomingExpiry) {
    whereClauses.push(
      "DATE(ds.endDate) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)",
    );
  }

  if (expired) {
    whereClauses.push("DATE(ds.endDate) < CURDATE()");
  }

  // Add soft delete filter - exclude deleted subscriptions
  whereClauses.push("ds.userSubscriptionDeletedAt IS NULL");

  // Build WHERE clause
  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

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
    daysUntilExpiry: "DATEDIFF(ds.endDate, CURDATE())",
  };

  const validSortOrder = ["ASC", "DESC"];
  const orderDirection = validSortOrder.includes(sortOrder.toUpperCase())
    ? sortOrder.toUpperCase()
    : "DESC";

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
  const [rows] = await executor.query(sql, [
    ...queryParams,
    parseInt(limit),
    offset,
  ]);
  const [countRes] = await executor.query(countSql, queryParams);
  const total = countRes[0]?.total || 0;

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      itemsPerPage: parseInt(limit),
      totalItems: total,
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNext: page < Math.ceil(total / parseInt(limit)),
      hasPrev: page > 1,
    },
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
};

// Get count only (separate method for count requests)
const getUserSubscriptionsCount = async (filters = {}, connection) => {
  const result = await getUserSubscriptionsWithFilters(
    {
      ...filters,
      page: 1,
      limit: 1,
    },
    connection,
  );

  return {
    message: "success",
    data: { totalCount: result.pagination?.totalItems || 0 },
    filters,
  };
};

//get unassigned free plan before grant
const getUnassignedFreePlans = async (filters = {}, connection) => {
  const {
    page = 1,
    limit = 10,
    driverUniqueId, // MANDATORY: need to know which driver to check for
    planName,
    planDescription,
    sortBy = "planName",
    sortOrder = "ASC",
  } = filters;

  if (!driverUniqueId) {
    throw new AppError(
      "driverUniqueId is required to check unassigned free plans",
      400,
    );
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

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

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
  const [rows] = await executor.query(sql, [
    driverUniqueId,
    ...params,
    safeLimit,
    offset,
  ]);
  const [countRes] = await executor.query(countSql, params);
  const total = countRes[0]?.total || 0;

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      itemsPerPage: safeLimit,
      totalItems: total,
      totalPages: Math.ceil(total / safeLimit),
      hasNext: page < Math.ceil(total / safeLimit),
      hasPrev: page > 1,
    },
    filters,
  };
};

const getSubscriptionData = async (filters = {}, connection) => {
  const { dataType = "userSubscriptions" } = filters;

  if (dataType === "freePlans") {
    return await getUnassignedFreePlans(filters, connection);
  } else {
    return await getUserSubscriptionsWithFilters(filters, connection);
  }
};

module.exports = {
  getSubscriptionData,
  getUserSubscriptionsCount,
  createUserSubscription,
  updateUserSubscriptionByUniqueId,
  deleteUserSubscriptionByUniqueId,
  getUserSubscriptionsWithFilters,
};
