const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Helper function to add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Create Pricing
const createPricing = async (
  subscriptionPlanUniqueIdOrObj,
  price,
  durationInDays,
  effectiveFrom,
  effectiveTo = null,
  createdByFromController = null,
) => {
  let subscriptionPlanUniqueId;
  let user;

  // Handle polymorphic arguments (object vs individual args)
  if (
    typeof subscriptionPlanUniqueIdOrObj === "object" &&
    subscriptionPlanUniqueIdOrObj !== null
  ) {
    // Called with an object (e.g., from seeder)
    ({
      subscriptionPlanUniqueId,
      price,
      durationInDays,
      effectiveFrom,
      effectiveTo,
      user,
    } = subscriptionPlanUniqueIdOrObj);
  } else {
    // Called with individual arguments (e.g., from controller)
    subscriptionPlanUniqueId = subscriptionPlanUniqueIdOrObj;
  }

  const executor = transactionStorage.getStore() || pool;
  // 0. Validate Subscription Plan Existence
  const [planExists] = await executor.query(
    "SELECT subscriptionPlanUniqueId, isFree FROM SubscriptionPlan WHERE subscriptionPlanUniqueId = ?",
    [subscriptionPlanUniqueId],
  );

  if (planExists.length === 0) {
    throw new AppError("Invalid Subscription Plan ID. Plan not found.", AppError.NOT_FOUND);
  }

  const planRow = planExists[0];

  // 1. For free plans: calculate effectiveTo if not provided but durationInDays given
  //    For paid plans: effectiveTo must remain null (no expiry)
  if (planRow.isFree) {
    if (!effectiveTo && durationInDays) {
      const fromDate = new Date(effectiveFrom);
      effectiveTo = addDays(fromDate, durationInDays);
    }
    // Enforce: free plans MUST have effectiveTo
    if (!effectiveTo) {
      throw new AppError(
        "effectiveTo is required for free subscription plans.",
        400,
      );
    }
  } else {
    // Paid plan — always null, ignore any provided effectiveTo or durationInDays
    effectiveTo = null;
  }

  // 3a. Check for exact duplicate (same plan, same price, same start date) to prevent seeder duplication
  const checkDuplicateSql = `
    SELECT subscriptionPlanPricingUniqueId 
    FROM SubscriptionPlanPricing 
    WHERE subscriptionPlanUniqueId = ? 
      AND price = ? 
      AND DATE(effectiveFrom) = DATE(?)
  `;
  const [duplicates] = await executor.query(checkDuplicateSql, [
    subscriptionPlanUniqueId,
    price,
    effectiveFrom,
  ]);

  if (duplicates.length > 0) {
    throw new AppError(
      "This pricing configuration already exists for this plan.",
      400,
    );
  }

  // 3b. Improved active pricing check with NULL-safe overlap detection
  const existingPricings = await getPricingWithFilters({
    subscriptionPlanUniqueId,
    isActive: true,
  });

  if (existingPricings?.data?.length > 0) {
    const hasOverlap = existingPricings.data.some((pricing) => {
      const existingFrom = new Date(pricing.effectiveFrom);
      // NULL effectiveTo means "never ends" — treat as far future
      const existingTo = pricing.effectiveTo
        ? new Date(pricing.effectiveTo)
        : new Date("9999-12-31");
      const newFrom = new Date(effectiveFrom);
      const newTo = effectiveTo
        ? new Date(effectiveTo)
        : new Date("9999-12-31");

      return newFrom <= existingTo && newTo >= existingFrom;
    });

    if (hasOverlap) {
      throw new AppError(
        "There is already an active pricing for this date range.",
        400,
      );
    }
  }

  const subscriptionPlanPricingUniqueId = uuidv4();
  const createdBy = createdByFromController || user?.userUniqueId;
  if (!createdBy || createdBy === subscriptionPlanPricingUniqueId) {
    throw new AppError(
      "subscriptionPlanPricingCreatedBy must be a valid user UUID (authenticated user).",
      400,
    );
  }

  // 4. SQL - added audit columns
  const sql = `
    INSERT INTO SubscriptionPlanPricing 
    (subscriptionPlanPricingUniqueId, subscriptionPlanUniqueId, price, effectiveFrom, effectiveTo, subscriptionPlanPricingCreatedBy, subscriptionPlanPricingCreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    subscriptionPlanPricingUniqueId,
    subscriptionPlanUniqueId,
    price,
    effectiveFrom,
    effectiveTo || null,
    createdBy,
    currentDate(),
  ];

  await executor.query(sql, values);

  return {
    message: "Subscription plan pricing fetched",
    data: { subscriptionPlanPricingUniqueId, effectiveFrom, effectiveTo: effectiveTo || null },
  };
};

const getPricingWithFilters = async (filters = {}) => {
  const {
    subscriptionPlanPricingUniqueId,
    subscriptionPlanUniqueId,
    subscriptionPlanId,
    planName,
    description,
    price,
    effectiveFrom,
    effectiveTo,
    createdAt,
    date,
    isActive,
    sortBy = " SubscriptionPlanPricing.subscriptionPlanPricingCreatedAt ",
    sortOrder = "DESC",
    page = 1,
    limit = 10,
    isFree = "all",
  } = filters;

  // Build WHERE clause dynamically
  let whereConditions = [];
  let queryParams = [];

  // Filter by isFree - THIS REQUIRES JOINING SubscriptionPlan TABLE
  if (isFree !== "all" && isFree !== undefined) {
    whereConditions.push("SubscriptionPlan.isFree = ?");
    queryParams.push(isFree);
  }

  if (subscriptionPlanId !== undefined) {
    whereConditions.push("SubscriptionPlan.subscriptionPlanId = ?");
    queryParams.push(Number(subscriptionPlanId));
  }

  if (planName) {
    whereConditions.push("SubscriptionPlan.planName LIKE ?");
    queryParams.push(`%${String(planName).trim()}%`);
  }

  if (description) {
    whereConditions.push("SubscriptionPlan.description LIKE ?");
    queryParams.push(`%${String(description).trim()}%`);
  }

  // Filter by specific pricing ID
  if (subscriptionPlanPricingUniqueId) {
    whereConditions.push(
      "SubscriptionPlanPricing.subscriptionPlanPricingUniqueId = ?",
    );
    queryParams.push(subscriptionPlanPricingUniqueId);
  }

  // Filter by plan ID
  if (subscriptionPlanUniqueId) {
    whereConditions.push(
      "SubscriptionPlanPricing.subscriptionPlanUniqueId = ?",
    );
    queryParams.push(subscriptionPlanUniqueId);
  }

  if (price !== undefined) {
    whereConditions.push("SubscriptionPlanPricing.price = ?");
    queryParams.push(Number(price));
  }

  if (effectiveFrom) {
    whereConditions.push(
      "DATE(SubscriptionPlanPricing.effectiveFrom) = DATE(?)",
    );
    queryParams.push(effectiveFrom);
  }

  if (effectiveTo) {
    whereConditions.push("DATE(SubscriptionPlanPricing.effectiveTo) = DATE(?)");
    queryParams.push(effectiveTo);
  }

  if (createdAt) {
    whereConditions.push(
      "DATE(SubscriptionPlanPricing.subscriptionPlanPricingCreatedAt) = DATE(?)",
    );
    queryParams.push(createdAt);
  }

  // Filter by active/inactive status
  if (isActive !== undefined) {
    const effectiveDate = date || currentDate();
    if (isActive) {
      whereConditions.push(
        "SubscriptionPlanPricing.effectiveFrom <= ? AND (SubscriptionPlanPricing.effectiveTo IS NULL OR SubscriptionPlanPricing.effectiveTo >= ?)",
      );
      queryParams.push(effectiveDate, effectiveDate);
    } else {
      whereConditions.push(
        "(SubscriptionPlanPricing.effectiveFrom > ? OR SubscriptionPlanPricing.effectiveTo < ?)",
      );
      queryParams.push(effectiveDate, effectiveDate);
    }
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Calculate pagination
  const offset = (page - 1) * limit;

  // Count total records
  const countSql = `
    SELECT COUNT(*) as total 
    FROM SubscriptionPlanPricing 
    JOIN SubscriptionPlan ON SubscriptionPlanPricing.subscriptionPlanUniqueId = SubscriptionPlan.subscriptionPlanUniqueId
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countSql, queryParams);
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Main query
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

  const allParams = [...queryParams, limit, offset];
  const [result] = await executor.query(sql, allParams);

  return {
    message: "Pricing fetched successfully",
    data: result || [],
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages,
    },
  };
};

const updatePricingByUniqueId = async (
  subscriptionPlanPricingUniqueId,
  updateData = {},
  updatedBy = null,
) => {
  // Validate inputs
  if (!subscriptionPlanPricingUniqueId) {
    throw new AppError("subscriptionPlanPricingUniqueId is required", AppError.BAD_REQUEST);
  }

  const allowedFields = [
    "price",
    "durationInDays",
    "effectiveFrom",
    "effectiveTo",
    "subscriptionPlanUniqueId",
    "isFree",
  ];

  // Add updatedBy if provided
  if (updatedBy) {
    updateData.subscriptionPlanPricingUpdatedBy = updatedBy;
  }
  const setClauses = [];
  const values = [];
  const validationErrors = [];

  // Process each allowed field
  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined && updateData[field] !== null) {
      // Field-specific validation
      switch (field) {
      case "price": {
        const price = parseFloat(updateData[field]);
        if (isNaN(price)) {
          validationErrors.push("price must be a valid number");
        } else if (price < 0) {
          validationErrors.push("price cannot be negative");
        } else {
          setClauses.push("price = ?");
          values.push(price.toFixed(2));
        }
        break;
      }

      case "durationInDays": {
        const duration = parseInt(updateData[field]);
        if (isNaN(duration)) {
          validationErrors.push("durationInDays must be a valid integer");
        } else if (duration <= 0) {
          validationErrors.push("durationInDays must be greater than 0");
        } else {
          setClauses.push("durationInDays = ?");
          values.push(duration);
        }
        break;
      }

      case "effectiveFrom":
      case "effectiveTo": {
        const dateValue = validateAndFormatDate(updateData[field]);
        if (dateValue === false) {
          validationErrors.push(
            `${field} must be a valid date in YYYY-MM-DD format or ISO string`,
          );
        } else if (dateValue !== null) {
          setClauses.push(`${field} = ?`);
          values.push(dateValue);
        }
        break;
      }

      case "subscriptionPlanUniqueId":
        setClauses.push(`${field} = ?`);
        values.push(updateData[field]);
        break;

      case "isFree": {
        const isFree =
            updateData[field] === true ||
            updateData[field] === 1 ||
            String(updateData[field]).toLowerCase() === "true";
        setClauses.push("isFree = ?");
        values.push(isFree ? 1 : 0);
        break;
      }

      default:
        setClauses.push(`${field} = ?`);
        values.push(updateData[field]);
      }
    }
  });

  // Check for errors
  if (validationErrors.length > 0) {
    throw new AppError(
      `Validation failed: ${validationErrors.join(", ")}`,
      400,
    );
  }

  // Ensure at least one field to update
  if (setClauses.length === 0) {
    throw new AppError(
      "No valid fields to update. Provide at least one of: price, durationInDays, effectiveFrom, effectiveTo, subscriptionPlanUniqueId, isFree",
      400,
    );
  }

  // Add timestamp update
  setClauses.push("subscriptionPlanPricingUpdatedAt = ?");
  values.push(currentDate());

  // Add the uniqueId for WHERE clause
  values.push(subscriptionPlanPricingUniqueId);

  const sql = `
    UPDATE SubscriptionPlanPricing
    SET ${setClauses.join(", ")}
    WHERE subscriptionPlanPricingUniqueId = ?
  `;

  try {
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, values);

    if (result.affectedRows === 0) {
      throw new AppError("Pricing record not found or no changes made", AppError.NOT_FOUND);
    }

    // Get the updated record
    const [updated] = await executor.query(
      "SELECT * FROM SubscriptionPlanPricing WHERE subscriptionPlanPricingUniqueId = ?",
      [subscriptionPlanPricingUniqueId],
    );

    return {
    message: "Pricing updated successfully",
      data: updated[0],
      updatedFields: setClauses.map((clause) => clause.split(" = ")[0]),
      affectedRows: result.affectedRows,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMap = {
      ER_TRUNCATED_WRONG_VALUE: "Invalid date format. Use YYYY-MM-DD format.",
      ER_BAD_NULL_ERROR: "Required field cannot be null.",
      ER_DATA_TOO_LONG: "Data too long for column.",
      ER_DUP_ENTRY: "Duplicate entry found.",
    };

    throw new AppError(errorMap[error.code] || "Failed to update pricing", AppError.BAD_REQUEST);
  }
};

// Enhanced date validation function
function validateAndFormatDate(dateValue) {
  if (dateValue === null || dateValue === undefined || dateValue === "") {
    return null;
  }

  try {
    let dateObj;

    // Handle Date objects
    if (dateValue instanceof Date) {
      dateObj = dateValue;
    }
    // Handle strings
    else if (typeof dateValue === "string") {
      const datePart = dateValue.split("T")[0];

      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const parts = datePart.split("-");
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return false;
        }

        return datePart;
      }

      dateObj = new Date(dateValue);
    } else {
      return false;
    }

    if (isNaN(dateObj.getTime())) {
      return false;
    }

    return dateObj.toISOString().split("T")[0];
  } catch {
    return false;
  }
}

// Delete by unique pricing ID
const deletePricingByUniqueId = async (subscriptionPlanPricingUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT subscriptionPlanPricingUniqueId FROM SubscriptionPlanPricing WHERE subscriptionPlanPricingUniqueId = ?",
    [subscriptionPlanPricingUniqueId],
  );

  if (!existing || existing.length === 0) {
    throw new AppError("Pricing record not found", AppError.NOT_FOUND);
  }

  const sql = `DELETE FROM SubscriptionPlanPricing WHERE subscriptionPlanPricingUniqueId = ?`;
  const [result] = await executor.query(sql, [subscriptionPlanPricingUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete pricing", AppError.INTERNAL_SERVER_ERROR);
  }

  return {
    message: `Pricing ${subscriptionPlanPricingUniqueId} deleted successfully`,
    data: null,
  };
};

module.exports = {
  createPricing,
  getPricingWithFilters,
  updatePricingByUniqueId,
  deletePricingByUniqueId,
};
