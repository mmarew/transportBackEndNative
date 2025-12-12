const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  getActiveSubscriptionPlanningPrice,
} = require("./SubscriptionPlanPricing.service");
const { currentDate, currentDateEAT } = require("../Utils/CurrentDate");
const modifyDateTime = require("../Utils/adjustDateTime");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const {
  deleteDriverBalanceByTransactionUniqueId,
} = require("./DriverBalance.service/DriverBalance.delete.service");

// Create subscription
const createDriverSubscription = async (
  driverUniqueId,
  subscriptionPlanUniqueId,
  startDate,
  endDate
) => {
  // const activeSubscription=await ()
  const driverSubscriptionUniqueId = uuidv4();
  const today = currentDate();
  // there are old and outdated pricing data so we need active one only
  const activePricing = await getActiveSubscriptionPlanningPrice({
    subscriptionPlanUniqueId,
    today,
  });

  const activePricingData = activePricing?.data?.[0];

  // if there is no active pricing and planning return error
  if (!activePricingData) {
    console.log(
      "@activePricingData",
      activePricingData,
      "subscriptionPlanUniqueId",
      subscriptionPlanUniqueId
    );
    return {
      message: "error",
      error: "You can't create subscription using this plan.",
    };
  }

  const price = activePricingData?.price;
  const durationInDays = activePricingData?.durationInDays;
  // check if the user already have this subscription
  const filters = {
    driverUniqueId,
    subscriptionPlanUniqueId,
  };
  const getActiveSubscription = await getDriverSubscriptionsWithFilters(
    filters
  );

  const activeSubscriptionData = getActiveSubscription?.data?.[0];

  console.log(
    "@getActiveSubscription",
    getActiveSubscription,
    "@createDriverSubscription subscriptionPlanUniqueId",
    subscriptionPlanUniqueId
  );
  // return;
  let savedEndDate = null,
    savedStartDate = null;
  // prevent recreate double free trial
  if (activeSubscriptionData) {
    if (activeSubscriptionData?.isFree) {
      return {
        message: "error",
        error: "You have already registered for a free trial once.",
      };
    } else {
      savedEndDate = activeSubscriptionData?.endDate;
      // the end of previous is begining of today, so we assigned the end date to starting date
      savedStartDate = savedEndDate;
    }
  } else {
  }
  console.log("@savedEndDate", savedEndDate);

  // deduct balance if subscription was free trial because it is already added above in balance so deduct it now
  // if (activePricingData?.isFree) {
  const newBalanceInDeductionOfSubscription = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: price,
    driverUniqueId,
    transactionUniqueId: driverSubscriptionUniqueId, // driverSubscriptionUniqueId,
    transactionType: "Subscription",
  });
  console.log(
    "@newBalanceInDeductionOfSubscription",
    newBalanceInDeductionOfSubscription
  );
  // return;
  if (newBalanceInDeductionOfSubscription?.message == "error") {
    // delete new recorded balance
    deleteDriverBalanceByTransactionUniqueId({
      transactionUniqueId: driverSubscriptionUniqueId,
    });
    return newBalanceInDeductionOfSubscription;
  }
  // return;
  // If there is savedEndDate add next purchase on savedEndDate
  const nextDate = modifyDateTime(savedEndDate ? savedEndDate : today, {
    days: durationInDays,
  });

  const sql = `
    INSERT INTO DriverSubscription 
    (driverSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    driverSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,
    savedStartDate ? savedStartDate : today,
    nextDate,
  ];
  const [result] = await pool.query(sql, values);
  console.log("@DriverSubscription result", result);
  if (result.affectedRows == 0) {
    // delete new recorded balance
    deleteDriverBalanceByTransactionUniqueId({
      transactionUniqueId: driverSubscriptionUniqueId,
    });
  }

  return {
    message: "success",
    data: {
      driverSubscriptionUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,
      startDate,
      endDate,
    },
  };
};

// Get all
// const getAllDriverSubscriptions = async () => {
//   const sql = `SELECT * FROM DriverSubscription join SubscriptionPlanPricing on DriverSubscription.subscriptionPlanUniqueId=SubscriptionPlanPricing.subscriptionPlanUniqueId join SubscriptionPlan on SubscriptionPlan.subscriptionPlanUniqueId=DriverSubscription.subscriptionPlanUniqueId ORDER BY driverSubscriptionId DESC`;
//   const [result] = await pool.query(sql);
//   return { message: "success", data: result };
// };

// Update by UUID
const updateDriverSubscriptionByUniqueId = async (
  driverSubscriptionUniqueId,
  startDate,
  endDate,
  subscriptionPlanUniqueId
) => {
  const sql = `
    UPDATE DriverSubscription 
    SET startDate = ?, endDate = ?, subscriptionPlanUniqueId = ?
    WHERE driverSubscriptionUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    startDate,
    endDate,
    subscriptionPlanUniqueId,
    driverSubscriptionUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          driverSubscriptionUniqueId,
          startDate,
          endDate,
          subscriptionPlanUniqueId,
        },
      }
    : { message: "error", error: "Failed to update subscription " };
};

// Delete by UUID
const deleteDriverSubscriptionByUniqueId = async (
  driverSubscriptionUniqueId
) => {
  const sql = `DELETE FROM DriverSubscription WHERE driverSubscriptionUniqueId = ?`;
  const [result] = await pool.query(sql, [driverSubscriptionUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Subscription ${driverSubscriptionUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete subscription" };
};

// Consolidated service method for filtering
const getDriverSubscriptionsWithFilters = async (filters = {}) => {
  console.log("@getDriverSubscriptionsWithFilters filters", filters);
  const {
    page = 1,
    limit = 10,

    // ID filters
    driverSubscriptionUniqueId,
    driverUniqueId,
    subscriptionPlanUniqueId,

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
    durationInDays,

    // User filters
    createdBy,

    // Special filters
    daily,
    monthly,
    upcomingExpiry,
    expired,

    // Sorting
    sortBy = "driverSubscriptionId",
    sortOrder = "DESC",

    // Role-based
    roleFilter,
  } = filters;

  const offset = (page - 1) * limit;

  // Start building WHERE clause
  let whereClauses = [];
  let queryParams = [];
  let countParams = [];

  // ID-based filters
  if (driverSubscriptionUniqueId) {
    whereClauses.push("ds.driverSubscriptionUniqueId = ?");
    queryParams.push(driverSubscriptionUniqueId);
    countParams.push(driverSubscriptionUniqueId);
  }

  if (driverUniqueId) {
    whereClauses.push("ds.driverUniqueId = ?");
    queryParams.push(driverUniqueId);
    countParams.push(driverUniqueId);
  }

  if (subscriptionPlanUniqueId) {
    whereClauses.push("ds.subscriptionPlanUniqueId = ?");
    queryParams.push(subscriptionPlanUniqueId);
    countParams.push(subscriptionPlanUniqueId);
  }

  // Status filters
  if (isActive !== undefined) {
    if (isActive) {
      whereClauses.push("NOW() BETWEEN ds.startDate AND ds.endDate");
    } else {
      whereClauses.push("(NOW() < ds.startDate OR NOW() > ds.endDate)");
    }
  }

  if (isFree !== undefined) {
    whereClauses.push("sp.isFree = ?");
    queryParams.push(isFree);
    countParams.push(isFree);
  }

  // Date filters
  if (startDateBefore) {
    whereClauses.push("ds.startDate <= ?");
    queryParams.push(startDateBefore);
    countParams.push(startDateBefore);
  }

  if (startDateAfter) {
    whereClauses.push("ds.startDate >= ?");
    queryParams.push(startDateAfter);
    countParams.push(startDateAfter);
  }

  if (endDateBefore) {
    whereClauses.push("ds.endDate <= ?");
    queryParams.push(endDateBefore);
    countParams.push(endDateBefore);
  }

  if (endDateAfter) {
    whereClauses.push("ds.endDate >= ?");
    queryParams.push(endDateAfter);
    countParams.push(endDateAfter);
  }

  if (createdAtStart) {
    whereClauses.push("ds.createdAt >= ?");
    queryParams.push(createdAtStart);
    countParams.push(createdAtStart);
  }

  if (createdAtEnd) {
    whereClauses.push("ds.createdAt <= ?");
    queryParams.push(createdAtEnd);
    countParams.push(createdAtEnd);
  }

  // Plan filters
  if (planName) {
    whereClauses.push("LOWER(sp.planName) LIKE LOWER(?)");
    queryParams.push(`%${planName}%`);
    countParams.push(`%${planName}%`);
  }

  if (planDescription) {
    whereClauses.push("LOWER(sp.description) LIKE LOWER(?)");
    queryParams.push(`%${planDescription}%`);
    countParams.push(`%${planDescription}%`);
  }

  // Pricing filters
  if (minPrice !== undefined) {
    whereClauses.push("spp.price >= ?");
    queryParams.push(minPrice);
    countParams.push(minPrice);
  }

  if (maxPrice !== undefined) {
    whereClauses.push("spp.price <= ?");
    queryParams.push(maxPrice);
    countParams.push(maxPrice);
  }

  if (durationInDays) {
    whereClauses.push("spp.durationInDays = ?");
    queryParams.push(durationInDays);
    countParams.push(durationInDays);
  }

  // Special filters
  if (daily) {
    whereClauses.push("DATE(ds.startDate) = CURDATE()");
  }

  if (monthly) {
    whereClauses.push(
      "YEAR(ds.startDate) = YEAR(CURDATE()) AND MONTH(ds.startDate) = MONTH(CURDATE())"
    );
  }

  if (upcomingExpiry) {
    whereClauses.push(
      "ds.endDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)"
    );
  }

  if (expired) {
    whereClauses.push("ds.endDate < NOW()");
  }

  // Role-based filtering (if needed)
  if (roleFilter === "driver" && driverUniqueId === undefined) {
    // Drivers can only see their own subscriptions
    // This should be handled at controller level with req.user
  }

  // Build WHERE clause
  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Validate and map sort column
  const sortColumnMap = {
    driverSubscriptionId: "ds.driverSubscriptionId",
    startDate: "ds.startDate",
    endDate: "ds.endDate",
    createdAt: "ds.createdAt",
    planName: "sp.planName",
    price: "spp.price",
    durationInDays: "spp.durationInDays",
  };

  const validSortOrder = ["ASC", "DESC"];
  const orderDirection = validSortOrder.includes(sortOrder.toUpperCase())
    ? sortOrder.toUpperCase()
    : "DESC";

  const orderColumn = sortColumnMap[sortBy] || "ds.driverSubscriptionId";

  // Main query
  const sql = `
    SELECT
      ds.*,
      sp.planName,
      sp.description as planDescription,
      sp.isFree,
      spp.price,
      spp.durationInDays,
      spp.effectiveFrom,
      spp.effectiveTo,
      CASE
        WHEN NOW() BETWEEN ds.startDate AND ds.endDate THEN 'active'
        WHEN NOW() < ds.startDate THEN 'upcoming'
        WHEN NOW() > ds.endDate THEN 'expired'
      END as subscriptionStatus,
      DATEDIFF(ds.endDate, NOW()) as daysUntilExpiry
    FROM DriverSubscription ds
    LEFT JOIN SubscriptionPlan sp
      ON ds.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    LEFT JOIN SubscriptionPlanPricing spp
      ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
      AND NOW() BETWEEN spp.effectiveFrom AND COALESCE(spp.effectiveTo, '9999-12-31')
    ${whereClause}
    ORDER BY ${orderColumn} ${orderDirection}
    LIMIT ? OFFSET ?
  `;
  console.log("@sqlll", sql);
  // Count query
  const countSql = `
    SELECT COUNT(*) as total
    FROM DriverSubscription ds
    LEFT JOIN SubscriptionPlan sp
      ON ds.subscriptionPlanUniqueId = sp.subscriptionPlanUniqueId
    LEFT JOIN SubscriptionPlanPricing spp
      ON sp.subscriptionPlanUniqueId = spp.subscriptionPlanUniqueId
      AND NOW() BETWEEN spp.effectiveFrom AND COALESCE(spp.effectiveTo, '9999-12-31')
    ${whereClause}
  `;

  // Add pagination to query params
  const mainQueryParams = [...queryParams, parseInt(limit), offset];

  try {
    const [rows] = await pool.query(sql, mainQueryParams);
    const [countRes] = await pool.query(countSql, countParams);
    const total = countRes[0]?.total || 0;

    return {
      message: "success",
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit),
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    console.error("Error in getDriverSubscriptionsWithFilters:", error);
    return {
      message: "error",
      error: "Failed to fetch subscriptions",
      details: error.message,
    };
  }
};

// Get count only (separate method for count requests)
const getDriverSubscriptionsCount = async (filters = {}) => {
  // Reuse the same WHERE logic from getDriverSubscriptionsWithFilters
  // but only return count
  const result = await getDriverSubscriptionsWithFilters({
    ...filters,
    page: 1,
    limit: 1,
  });

  return {
    message: "success",
    data: {
      totalCount: result.pagination?.totalItems || 0,
    },
    filters,
  };
};

module.exports = {
  getDriverSubscriptionsCount,

  createDriverSubscription,

  updateDriverSubscriptionByUniqueId,
  deleteDriverSubscriptionByUniqueId,

  getDriverSubscriptionsWithFilters,
};
