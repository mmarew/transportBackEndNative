const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");

// Create Pricing
const createPricing = async (
  subscriptionPlanUniqueId,
  price,
  durationInDays,
  effectiveFrom,
  effectiveTo,
  isFree = false
) => {
  const today = currentDate();

  const activeData = await getPricingWithFilters({
    subscriptionPlanUniqueId,
  });

  if (activeData?.data?.length > 0) {
    return {
      message: "error",
      error: "There is already an active pricing for this plan.",
    };
  }

  const subscriptionPlanPricingUniqueId = uuidv4();

  const sql = `
    INSERT INTO SubscriptionPlanPricing 
    (subscriptionPlanPricingUniqueId, subscriptionPlanUniqueId, price, durationInDays, effectiveFrom, effectiveTo)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    subscriptionPlanPricingUniqueId,
    subscriptionPlanUniqueId,
    price,
    durationInDays,
    effectiveFrom,
    effectiveTo || null,
  ];

  try {
    const [result] = await pool.query(sql, values);
    return {
      message: "success",
      data: "Subscription Plan Price Created Successfully",
    };
  } catch (err) {
    console.error("Error creating pricing:", err);
    return {
      message: "error",
      error: "Database error while creating pricing.",
    };
  }
};

// Single comprehensive method with filters

// Single comprehensive method with filters
const getPricingWithFilters = async (filters = {}) => {
  const {
    subscriptionPlanPricingUniqueId,
    subscriptionPlanUniqueId,
    date,
    isActive,
    sortBy = " SubscriptionPlanPricing.createdAt ",
    sortOrder = "DESC",
    page = 1,
    limit = 10,
  } = filters;

  // Build WHERE clause dynamically
  let whereConditions = [];
  let queryParams = [];

  // Filter by specific pricing ID
  if (subscriptionPlanPricingUniqueId) {
    whereConditions.push(
      "SubscriptionPlanPricing.subscriptionPlanPricingUniqueId = ?"
    );
    queryParams.push(subscriptionPlanPricingUniqueId);
  }

  // Filter by plan ID - SPECIFY THE TABLE NAME
  if (subscriptionPlanUniqueId) {
    whereConditions.push(
      "SubscriptionPlanPricing.subscriptionPlanUniqueId = ?"
    );
    queryParams.push(subscriptionPlanUniqueId);
  }

  // Filter by active/inactive status
  if (isActive !== undefined) {
    const effectiveDate = date || currentDate();
    if (isActive) {
      whereConditions.push(
        "effectiveFrom <= ? AND (effectiveTo IS NULL OR effectiveTo >= ?)"
      );
      queryParams.push(effectiveDate, effectiveDate);
    } else {
      whereConditions.push("(effectiveFrom > ? OR effectiveTo < ?)");
      queryParams.push(effectiveDate, effectiveDate);
    }
  }

  // Build the WHERE clause
  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Calculate pagination
  const offset = (page - 1) * limit;

  // Count total records for pagination metadata
  const countSql = `SELECT COUNT(*) as total FROM SubscriptionPlanPricing ${whereClause}`;

  // For count query, use the same WHERE conditions but without table prefix for count query
  const countWhereConditions = whereConditions.map((cond) =>
    cond.replace("SubscriptionPlanPricing.", "")
  );
  const countWhereClause =
    countWhereConditions.length > 0
      ? `WHERE ${countWhereConditions.join(" AND ")}`
      : "";
  const countSqlFixed = `SELECT COUNT(*) as total FROM SubscriptionPlanPricing ${countWhereClause}`;

  const [countResult] = await pool.query(countSqlFixed, queryParams);
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Main query with pagination
  const sql = `
    SELECT 
      SubscriptionPlanPricing.*,
      SubscriptionPlan.*
    FROM SubscriptionPlanPricing 
    JOIN SubscriptionPlan ON SubscriptionPlanPricing.subscriptionPlanUniqueId = SubscriptionPlan.subscriptionPlanUniqueId
    ${whereClause}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  // Add pagination parameters
  const allParams = [...queryParams, limit, offset];

  try {
    const [result] = await pool.query(sql, allParams);

    return {
      message: "success",
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  } catch (err) {
    console.error("Error fetching pricing with filters:", err);
    return {
      message: "error",
      error: "Database error while fetching pricing data.",
    };
  }
};

// Update by unique pricing ID
const updatePricingByUniqueId = async (
  subscriptionPlanPricingUniqueId,
  price,
  durationInDays,
  effectiveFrom,
  effectiveTo
) => {
  const sql = `
    UPDATE SubscriptionPlanPricing 
    SET price = ?, durationInDays = ?, effectiveFrom = ?, effectiveTo = ?
    WHERE subscriptionPlanPricingUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    price,
    durationInDays,
    effectiveFrom,
    effectiveTo,
    subscriptionPlanPricingUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          subscriptionPlanPricingUniqueId,
          price,
          durationInDays,
          effectiveFrom,
          effectiveTo,
        },
      }
    : { message: "error", error: "Failed to update pricing" };
};

// Delete by unique pricing ID
const deletePricingByUniqueId = async (subscriptionPlanPricingUniqueId) => {
  const sql = `
    DELETE FROM SubscriptionPlanPricing 
    WHERE subscriptionPlanPricingUniqueId = ?
  `;
  const [result] = await pool.query(sql, [subscriptionPlanPricingUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Pricing ${subscriptionPlanPricingUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete pricing" };
};

module.exports = {
  createPricing,
  getPricingWithFilters,
  updatePricingByUniqueId,
  deletePricingByUniqueId,
};
