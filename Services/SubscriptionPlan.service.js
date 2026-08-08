const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create
const createSubscriptionPlan = async ({
  planName,
  description,
  isFree = false,
  durationInDays,
  user,
}) => {
  const checkSql = `SELECT * FROM SubscriptionPlan WHERE planName = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(checkSql, [planName]);
  if (existing.length > 0) {
    throw new AppError("Plan name already exists", AppError.BAD_REQUEST);
  }

  const subscriptionPlanUniqueId = uuidv4();
  const createdBy = user?.userUniqueId || subscriptionPlanUniqueId;
  const insertSql = `
    INSERT INTO SubscriptionPlan (subscriptionPlanUniqueId, planName, description, isFree, durationInDays, subscriptionPlanCreatedBy, subscriptionPlanCreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  await executor.query(insertSql, [
    subscriptionPlanUniqueId,
    planName,
    description,
    isFree,
    durationInDays,
    createdBy,
    currentDate(),
  ]);

  return {
    message: "Subscription plan created successfully",
    data: {
      subscriptionPlanUniqueId,
    },
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
    sortBy = "subscriptionPlanCreatedAt",
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

  // If getting single plan by ID, don't paginate
  if (subscriptionPlanUniqueId) {
    const sql = `
      SELECT * FROM SubscriptionPlan
      ${whereClause}
      LIMIT 1
    `;

    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, queryParams);

    if (result.length === 0) {
      throw new AppError("Subscription plan not found", AppError.NOT_FOUND);
    }

    return {
      message: "Subscription plan fetched successfully",
      data: result[0],
    };
  }

  // Get total count for pagination
  const countSql = `SELECT COUNT(*) as total FROM SubscriptionPlan ${whereClause}`;
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countSql, queryParams);
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
  const [result] = await executor.query(sql, allParams);

  return {
    message: "Subscription plans fetched successfully",
    data: result || [],
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages,
    },
  };
};

// Update by uniqueId with dynamic parameter building
const updateSubscriptionPlan = async (
  uniqueId,
  planName,
  description,
  isFree,
  durationInDays,
  updatedBy,
) => {
  // Validate that uniqueId is provided
  if (!uniqueId) {
    throw new AppError("SubscriptionPlanUniqueId is required", AppError.BAD_REQUEST);
  }
  const updateData = {
    planName,
    description,
    isFree,
    durationInDays,
    subscriptionPlanUpdatedBy: updatedBy,
  };
  // Validate that updateData is provided and not empty
  if (!updateData || Object.keys(updateData).length === 0) {
    throw new AppError("At least one field to update must be provided", AppError.BAD_REQUEST);
  }

  // List of allowed fields that can be updated (all fields except IDs/UUIDs)
  const allowedFields = [
    "planName",
    "description",
    "isFree",
    "durationInDays",
    "subscriptionPlanUpdatedBy",
  ];

  // Filter out any fields that are not allowed or undefined/null
  const fieldsToUpdate = {};

  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined && updateData[field] !== null) {
      fieldsToUpdate[field] = updateData[field];
    }
  });

  // Check if we have any valid fields to update
  if (Object.keys(fieldsToUpdate).length === 0) {
    throw new AppError(
      "No valid fields provided for update. Allowed fields: planName, description, isFree",
      AppError.BAD_REQUEST,
    );
  }

  // Build dynamic SQL query
  const setClauses = [];
  const values = [];

  // Process each field to update
  Object.keys(fieldsToUpdate).forEach((field) => {
    setClauses.push(`${field} = ?`);
    values.push(fieldsToUpdate[field]);
  });

  // Always update the timestamp
  setClauses.push("subscriptionPlanUpdatedAt = ?");
  values.push(currentDate());

  // Add uniqueId to values array for WHERE clause
  values.push(uniqueId);

  const sql = `
    UPDATE SubscriptionPlan
    SET ${setClauses.join(", ")}
    WHERE subscriptionPlanUniqueId = ?
  `;

  try {
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, values);

    if (result.affectedRows === 0) {
      throw new AppError(
        "No record found with the provided uniqueId or no changes made",
        AppError.NOT_FOUND,
      );
    }

    return {
      message: "Subscription plan updated successfully",
      data: {
        subscriptionPlanUniqueId: uniqueId,
        ...fieldsToUpdate,
        affectedRows: result.affectedRows,
      },
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError(
        "Plan name must be unique. Another plan with this name already exists.",
        AppError.BAD_REQUEST,
      );
    }
    throw error;
  }
};

// Delete by uniqueId
const deleteSubscriptionPlan = async (uniqueId) => {
  const sql = `DELETE FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [uniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete subscription plan or not found", AppError.NOT_FOUND);
  }

  return {
    message: `Subscription plan ${uniqueId} deleted successfully`,
    data: null,
  };
};

module.exports = {
  createSubscriptionPlan,
  getSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};
