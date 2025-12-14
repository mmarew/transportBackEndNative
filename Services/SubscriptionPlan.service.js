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
// const updateSubscriptionPlan = async (
//   uniqueId,
//   planName,
//   description,
//   isFree
// ) => {
//   const sql = `
//     UPDATE SubscriptionPlan
//     SET planName = ?, description = ?, isFree = ?
//     WHERE subscriptionPlanUniqueId = ?
//   `;
//   const [result] = await pool.query(sql, [
//     planName,
//     description,
//     isFree,
//     uniqueId,
//   ]);

//   return result.affectedRows > 0
//     ? {
//         message: "success",
//         data: {
//           subscriptionPlanUniqueId: uniqueId,
//           planName,
//           description,
//           isFree,
//         },
//       }
//     : { message: "error", error: "Failed to update subscription plan" };
// };
// Update by uniqueId with dynamic parameter building
const updateSubscriptionPlan = async (
  uniqueId,
  planName,
  description,
  isFree
) => {
  // Validate that uniqueId is provided
  if (!uniqueId) {
    return {
      message: "error",
      error: "SubscriptionPlanUniqueId is required",
    };
  }
  const updateData = { planName, description, isFree };
  // Validate that updateData is provided and not empty
  if (!updateData || Object.keys(updateData).length === 0) {
    return {
      message: "error",
      error: "At least one field to update must be provided",
    };
  }

  // List of allowed fields that can be updated
  const allowedFields = ["planName", "description", "isFree"];

  // Filter out any fields that are not allowed or undefined/null
  const fieldsToUpdate = {};

  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined && updateData[field] !== null) {
      fieldsToUpdate[field] = updateData[field];
    }
  });

  // Check if we have any valid fields to update
  if (Object.keys(fieldsToUpdate).length === 0) {
    return {
      message: "error",
      error:
        "No valid fields provided for update. Allowed fields: planName, description, isFree",
    };
  }

  try {
    // Build dynamic SQL query
    const setClauses = [];
    const values = [];

    // Process each field to update
    Object.keys(fieldsToUpdate).forEach((field) => {
      setClauses.push(`${field} = ?`);
      values.push(fieldsToUpdate[field]);
    });

    // Add uniqueId to values array for WHERE clause
    values.push(uniqueId);

    const sql = `
      UPDATE SubscriptionPlan
      SET ${setClauses.join(", ")}
      WHERE subscriptionPlanUniqueId = ?
    `;

    console.log("Update SQL:", sql);
    console.log("Update values:", values);

    const [result] = await pool.query(sql, values);

    if (result.affectedRows > 0) {
      // Option 1: Return minimal success response
      return {
        message: "success",
        data: {
          subscriptionPlanUniqueId: uniqueId,
          ...fieldsToUpdate,
          affectedRows: result.affectedRows,
        },
      };

      // Option 2: Return the complete updated record (if preferred)
      // const [updatedRecord] = await pool.query(
      //   'SELECT * FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?',
      //   [uniqueId]
      // );
      // return {
      //   message: "success",
      //   data: updatedRecord[0]
      // };
    } else {
      return {
        message: "error",
        error: "No record found with the provided uniqueId or no changes made",
      };
    }
  } catch (error) {
    console.error("Error updating subscription plan:", error);

    // Handle specific MySQL errors
    if (error.code === "ER_DUP_ENTRY") {
      return {
        message: "error",
        error:
          "Plan name must be unique. Another plan with this name already exists.",
      };
    }

    return {
      message: "error",
      error: "Failed to update subscription plan",
      details: error.message,
    };
  }
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
