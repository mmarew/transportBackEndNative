const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const logger = require("../Utils/logger");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
// Function to add a cancellation reason
const addCancellationReason = async (body, user) => {
  try {
    const cancellationReasonTypeUniqueId = uuidv4();
    const roleId = body.roleId;
    const cancellationReason = body.cancellationReason;
    // requestMode: 'individual' | 'company' | 'both' — defaults to 'both' if not provided
    const requestMode = body.requestMode || "both";
    const createdBy = user?.userUniqueId;

    // Check if the reason already exists
    const isAvailable = await getData({
      tableName: "CancellationReasonsType",
      conditions: { cancellationReason, roleId },
    });
    if (isAvailable.length > 0) {
      throw new AppError("Cancellation reason already exists", 409);
    }

    const sqlToAddReason = `
      INSERT INTO CancellationReasonsType 
      (cancellationReasonTypeUniqueId, cancellationReason, roleId, requestMode, cancellationReasonTypeCreatedBy, cancellationReasonTypeCreatedAt) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const reasonValues = [
      cancellationReasonTypeUniqueId,
      cancellationReason,
      roleId,
      requestMode,
      createdBy,
      currentDate(),
    ];

    const executor = transactionStorage.getStore() || pool;
    const [registerResult] = await executor.query(sqlToAddReason, reasonValues);
    if (registerResult.affectedRows > 0) {
      return {
        message: "success",
        data: {
          cancellationReasonTypeUniqueId,
          message: "Cancellation reason registered successfully",
        },
      };
    } else {
      throw new AppError("Cancellation reason registration failed", 500);
    }
  } catch (error) {
    logger.error("Error adding cancellation reason", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      `Cancellation reason registration failed: ${error.message}`,
      500,
    );
  }
};

// Function to delete a cancellation reason by unique ID
const deleteCancellationReason = async (req) => {
  const cancellationReasonTypeUniqueId =
    req.params.cancellationReasonTypeUniqueId;
  const userUniqueId = req.user?.userUniqueId;

  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT cancellationReasonTypeUniqueId FROM CancellationReasonsType WHERE cancellationReasonTypeUniqueId = ?",
    [cancellationReasonTypeUniqueId],
  );
  if (!existing || existing.length === 0) {
    throw new AppError("Cancellation reason not found", 404);
  }

  const sqlToDeleteReason = `UPDATE CancellationReasonsType SET cancellationReasonTypeDeletedAt = ?, cancellationReasonTypeDeletedBy = ? WHERE cancellationReasonTypeUniqueId = ?`;
  const [result] = await executor.query(sqlToDeleteReason, [
    currentDate(),
    userUniqueId,
    cancellationReasonTypeUniqueId,
  ]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "Cancellation reason deleted successfully",
    };
  }
  throw new AppError("Cancellation reason delete failed", 500);
};

// Function to update a cancellation reason by unique ID
const updateCancellationReason = async (req) => {
  const cancellationReasonTypeUniqueId =
    req.params.cancellationReasonTypeUniqueId;
  const userUniqueId = req.user?.userUniqueId;

  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT cancellationReasonTypeUniqueId FROM CancellationReasonsType WHERE cancellationReasonTypeUniqueId = ?",
    [cancellationReasonTypeUniqueId],
  );
  if (!existing || existing.length === 0) {
    throw new AppError("Cancellation reason not found", 404);
  }

  const setParts = [];
  const values = [];

  if (req.body.cancellationReason !== undefined) {
    setParts.push("cancellationReason = ?");
    values.push(req.body.cancellationReason);
  }

  if (req.body.roleId !== undefined) {
    setParts.push("roleId = ?");
    values.push(req.body.roleId);
  }

  if (req.body.requestMode !== undefined) {
    const validModes = ["individual", "company", "both"];
    if (!validModes.includes(req.body.requestMode)) {
      throw new AppError(
        `Invalid requestMode. Allowed values: ${validModes.join(", ")}`,
        400,
      );
    }
    setParts.push("requestMode = ?");
    values.push(req.body.requestMode);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Add audit columns
  setParts.push("cancellationReasonTypeUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("cancellationReasonTypeUpdatedAt = ?");
  values.push(currentDate());

  const sqlToUpdateReason = `UPDATE CancellationReasonsType SET ${setParts.join(", ")} WHERE cancellationReasonTypeUniqueId = ?`;
  values.push(cancellationReasonTypeUniqueId);

  const [result] = await executor.query(sqlToUpdateReason, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "Cancellation reason updated successfully",
    };
  }
  throw new AppError("Cancellation reason update failed", 500);
};
const getAllCancellationReasons = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.cancellationReasonTypeUniqueId) {
    clauses.push("c.cancellationReasonTypeUniqueId = ?");
    params.push(filters.cancellationReasonTypeUniqueId);
  }

  if (filters.cancellationReason) {
    clauses.push("c.cancellationReason LIKE ?");
    params.push(`%${String(filters.cancellationReason).trim()}%`);
  }

  if (filters.roleId !== undefined) {
    clauses.push("c.roleId = ?");
    params.push(Number(filters.roleId));
  }

  // Filter by requestMode: 'individual', 'company', or 'both'
  // When filtering for 'individual' or 'company', also include reasons tagged 'both'
  if (filters.requestMode) {
    if (filters.requestMode === "individual" || filters.requestMode === "company") {
      clauses.push("c.requestMode IN (?, 'both')");
      params.push(filters.requestMode);
    } else if (filters.requestMode === "both") {
      clauses.push("c.requestMode = 'both'");
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT c.*, r.roleName
    FROM CancellationReasonsType c
    LEFT JOIN Roles r ON c.roleId = r.roleId
    ${whereClause}
    ORDER BY c.cancellationReasonsTypeId DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM CancellationReasonsType c
    ${whereClause}
  `;

  const [rows] = await pool.query(dataSql, [...params, limit, offset]);
  const [countRows] = await pool.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  if (!rows || rows.length === 0) {
    return {
      message: "success",
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  return {
    message: "success",
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = {
  getAllCancellationReasons,
  addCancellationReason,
  deleteCancellationReason,
  updateCancellationReason,
};
