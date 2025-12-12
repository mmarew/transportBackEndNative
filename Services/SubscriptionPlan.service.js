const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create
const createSubscriptionPlan = async ({
  planName,
  description,
  isFree = false,
}) => {
  const checkSql = `SELECT * FROM SubscriptionPlan WHERE planName = ?`;
  const [existing] = await pool.query(checkSql, [planName]);
  if (existing.length > 0) {
    return { message: "error", error: "Plan name already exists" };
  }

  const subscriptionPlanUniqueId = uuidv4();
  const insertSql = `
    INSERT INTO SubscriptionPlan (subscriptionPlanUniqueId, planName, description, isFree)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await pool.query(insertSql, [
    subscriptionPlanUniqueId,
    planName,
    description,
    isFree,
  ]);

  return {
    message: "success",
    data: "Subscription plan created successfully",
  };
};

// Single method to handle both all plans and single plan with filters
const getSubscriptionPlans = async (filters = {}) => {
  const {
    subscriptionPlanUniqueId,
    planName,
    isFree,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "DESC",
  } = filters;

  let whereConditions = [];
  let queryParams = [];

  // Build WHERE conditions
  if (subscriptionPlanUniqueId) {
    whereConditions.push("subscriptionPlanUniqueId = ?");
    queryParams.push(subscriptionPlanUniqueId);
  }

  if (planName) {
    whereConditions.push("planName LIKE ?");
    queryParams.push(`%${planName}%`);
  }

  if (isFree !== undefined) {
    whereConditions.push("isFree = ?");
    queryParams.push(isFree);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Handle pagination
  const offset = (page - 1) * limit;

  try {
    // If getting single plan by ID, don't paginate
    if (subscriptionPlanUniqueId) {
      const sql = `
        SELECT * FROM SubscriptionPlan
        ${whereClause}
        LIMIT 1
      `;

      const [result] = await pool.query(sql, queryParams);

      if (result.length === 0) {
        return { message: "error", error: "Subscription plan not found" };
      }

      return {
        message: "success",
        data: result[0],
      };
    }

    // Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM SubscriptionPlan ${whereClause}`;
    const [countResult] = await pool.query(countSql, queryParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const sql = `
      SELECT * FROM SubscriptionPlan
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const allParams = [...queryParams, limit, offset];
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
    console.error("Error fetching subscription plans:", err);
    return {
      message: "error",
      error: "Database error while fetching subscription plans",
    };
  }
};

// Update by uniqueId
const updateSubscriptionPlan = async (
  uniqueId,
  planName,
  description,
  isFree
) => {
  const sql = `
    UPDATE SubscriptionPlan
    SET planName = ?, description = ?, isFree = ?
    WHERE subscriptionPlanUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    planName,
    description,
    isFree,
    uniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          subscriptionPlanUniqueId: uniqueId,
          planName,
          description,
          isFree,
        },
      }
    : { message: "error", error: "Failed to update subscription plan" };
};

// Delete by uniqueId
const deleteSubscriptionPlan = async (uniqueId) => {
  const sql = `DELETE FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?`;
  const [result] = await pool.query(sql, [uniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Subscription plan ${uniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete subscription plan" };
};

module.exports = {
  createSubscriptionPlan,
  getSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};
