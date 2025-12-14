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
    isFree = "all",
  } = filters;

  // Build WHERE clause dynamically
  let whereConditions = [];
  let queryParams = [];

  // Filter by isFree - THIS REQUIRES JOINING SubscriptionPlan TABLE
  if (isFree === "all") {
    // No filter for isFree
  } else if (isFree !== undefined) {
    whereConditions.push("SubscriptionPlan.isFree = ?");
    queryParams.push(isFree);
  }

  // Filter by specific pricing ID
  if (subscriptionPlanPricingUniqueId) {
    whereConditions.push(
      "SubscriptionPlanPricing.subscriptionPlanPricingUniqueId = ?"
    );
    queryParams.push(subscriptionPlanPricingUniqueId);
  }

  // Filter by plan ID
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
        "SubscriptionPlanPricing.effectiveFrom <= ? AND (SubscriptionPlanPricing.effectiveTo IS NULL OR SubscriptionPlanPricing.effectiveTo >= ?)"
      );
      queryParams.push(effectiveDate, effectiveDate);
    } else {
      whereConditions.push(
        "(SubscriptionPlanPricing.effectiveFrom > ? OR SubscriptionPlanPricing.effectiveTo < ?)"
      );
      queryParams.push(effectiveDate, effectiveDate);
    }
  }

  // Build the WHERE clause for main query (with JOIN)
  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Build WHERE clause for count query (also needs JOIN)
  const countWhereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Calculate pagination
  const offset = (page - 1) * limit;

  // Count total records for pagination metadata
  // IMPORTANT: Count query also needs to JOIN SubscriptionPlan table when filtering by isFree
  let countSql;
  if (isFree !== "all" && isFree !== undefined) {
    // When filtering by isFree, we need the JOIN
    countSql = `
      SELECT COUNT(*) as total 
      FROM SubscriptionPlanPricing 
      JOIN SubscriptionPlan ON SubscriptionPlanPricing.subscriptionPlanUniqueId = SubscriptionPlan.subscriptionPlanUniqueId
      ${countWhereClause}
    `;
  } else {
    // When not filtering by isFree, we can skip the JOIN for count
    countSql = `SELECT COUNT(*) as total FROM SubscriptionPlanPricing ${countWhereClause}`;
  }

  // Use the same query parameters for count query
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Main query with pagination - ALWAYS JOIN for main query to get SubscriptionPlan data
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

const updatePricingByUniqueId = async (
  subscriptionPlanPricingUniqueId,
  updateData = {}
) => {
  console.log("@updatePricingByUniqueId updateData", updateData);
  // Validate inputs
  if (!subscriptionPlanPricingUniqueId) {
    return {
      message: "error",
      error: "subscriptionPlanPricingUniqueId is required",
    };
  }

  const allowedFields = [
    "price",
    "durationInDays",
    "effectiveFrom",
    "effectiveTo",
  ];
  const setClauses = [];
  const values = [];
  const errors = [];

  // Process each allowed field
  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined && updateData[field] !== null) {
      // Field-specific validation
      switch (field) {
        case "price":
          const price = parseFloat(updateData[field]);
          if (isNaN(price)) {
            errors.push("price must be a valid number");
          } else if (price < 0) {
            errors.push("price cannot be negative");
          } else {
            setClauses.push("price = ?");
            values.push(price.toFixed(2));
          }
          break;

        case "durationInDays":
          const duration = parseInt(updateData[field]);
          if (isNaN(duration)) {
            errors.push("durationInDays must be a valid integer");
          } else if (duration <= 0) {
            errors.push("durationInDays must be greater than 0");
          } else {
            setClauses.push("durationInDays = ?");
            values.push(duration);
          }
          break;

        case "effectiveFrom":
        case "effectiveTo":
          const dateValue = validateAndFormatDate(updateData[field]);
          if (dateValue === false) {
            errors.push(
              `${field} must be a valid date in YYYY-MM-DD format or ISO string`
            );
          } else if (dateValue !== null) {
            // null means not provided
            setClauses.push(`${field} = ?`);
            values.push(dateValue);
          }
          break;

        default:
          setClauses.push(`${field} = ?`);
          values.push(updateData[field]);
      }
    }
  });

  // Check for errors
  if (errors.length > 0) {
    return {
      message: "error",
      error: "Validation failed",
      details: errors.join(", "),
    };
  }

  // Ensure at least one field to update
  if (setClauses.length === 0) {
    return {
      message: "error",
      error:
        "No valid fields to update. Provide at least one of: price, durationInDays, effectiveFrom, effectiveTo",
    };
  }

  // Add the uniqueId for WHERE clause
  values.push(subscriptionPlanPricingUniqueId);

  try {
    const sql = `
      UPDATE SubscriptionPlanPricing
      SET ${setClauses.join(", ")}
      WHERE subscriptionPlanPricingUniqueId = ?
    `;

    console.log("Executing SQL:", sql);
    console.log("With values:", values);

    const [result] = await pool.query(sql, values);

    if (result.affectedRows > 0) {
      // Get the updated record
      const [updated] = await pool.query(
        "SELECT * FROM SubscriptionPlanPricing WHERE subscriptionPlanPricingUniqueId = ?",
        [subscriptionPlanPricingUniqueId]
      );

      return {
        message: "success",
        data: updated[0],
        updatedFields: setClauses.map((clause) => clause.split(" = ")[0]),
        affectedRows: result.affectedRows,
      };
    } else {
      return {
        message: "error",
        error: "Pricing record not found or no changes made",
      };
    }
  } catch (error) {
    console.error("Database update error:", error);

    // User-friendly error messages
    const errorMap = {
      ER_TRUNCATED_WRONG_VALUE: "Invalid date format. Use YYYY-MM-DD format.",
      ER_BAD_NULL_ERROR: "Required field cannot be null.",
      ER_DATA_TOO_LONG: "Data too long for column.",
      ER_DUP_ENTRY: "Duplicate entry found.",
    };

    return {
      message: "error",
      error: errorMap[error.code] || "Failed to update pricing",
      sqlError: error.code,
      details: error.message,
    };
  }
};

// Enhanced date validation function
function validateAndFormatDate(dateValue) {
  if (dateValue === null || dateValue === undefined) return null;
  if (dateValue === "") return null; // Empty string means no date

  try {
    let dateObj;

    // Handle Date objects
    if (dateValue instanceof Date) {
      dateObj = dateValue;
    }
    // Handle ISO strings (with or without timezone)
    else if (typeof dateValue === "string") {
      // Remove timezone and time for DATE type
      const datePart = dateValue.split("T")[0];

      // Validate YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const parts = datePart.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        // Basic date validation
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return false;
        }

        return datePart; // Already in correct format
      }

      // Try to parse other formats
      dateObj = new Date(dateValue);
    } else {
      return false;
    }

    // Check if valid date
    if (isNaN(dateObj.getTime())) {
      return false;
    }

    // Format to YYYY-MM-DD
    return dateObj.toISOString().split("T")[0];
  } catch (error) {
    console.error("Date formatting error:", error);
    return false;
  }
}

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
