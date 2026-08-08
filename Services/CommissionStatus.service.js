const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { transactionStorage } = require("../Utils/TransactionContext");

const createCommissionStatus = async ({
  statusName,
  description,
  effectiveFrom,
  effectiveTo,
  user,
}) => {
  const executor = transactionStorage.getStore() || pool;
  const commissionStatusUniqueId = uuidv4();
  const createdBy = user?.userUniqueId || commissionStatusUniqueId;

  // Check if exists by name (active rows only)
  const [existing] = await executor.query(
    "SELECT commissionStatusUniqueId, statusName FROM CommissionStatus WHERE statusName = ? AND commissionStatusDeletedAt IS NULL LIMIT 1",
    [statusName],
  );

  if (existing.length > 0) {
    return {
      message: "Commission status already exists",
      data: {
        commissionStatusUniqueId: existing[0].commissionStatusUniqueId,
        statusName: existing[0].statusName,
      },
    };
  }

  const insertQuery = `
    INSERT INTO CommissionStatus 
    (commissionStatusUniqueId, statusName, description, effectiveFrom, effectiveTo, commissionStatusCreatedBy, commissionStatusCreatedAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await executor.query(insertQuery, [
    commissionStatusUniqueId,
    statusName,
    description,
    effectiveFrom,
    effectiveTo,
    createdBy,
    currentDate(),
  ]);

  return {
    message: "Commission status created successfully",
    data: {
      commissionStatusUniqueId,
      statusName,
      description,
      effectiveFrom,
      effectiveTo,
    },
  };
};

const getAllCommissionStatuses = async (filters = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "statusName",
      sortOrder = "ASC",
      statusName,
      active,
    } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    if (statusName) {
      conditions.push("statusName LIKE ?");
      values.push(`%${statusName}%`);
    }

    // Default: Exclude deleted
    conditions.push("commissionStatusDeletedAt IS NULL");

    if (active === "true" || active === true) {
      conditions.push(
        "(effectiveFrom IS NULL OR effectiveFrom <= NOW()) AND (effectiveTo IS NULL OR effectiveTo >= NOW())",
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    const countQuery = `SELECT COUNT(*) as total FROM CommissionStatus ${whereClause}`;
    const [countResult] = await pool.query(countQuery, values);
    const totalCount = countResult[0].total;

    const query = `
      SELECT 
        commissionStatusUniqueId, 
        statusName, 
        description,
        effectiveFrom,
        effectiveTo,
        commissionStatusCreatedAt
      FROM CommissionStatus
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [statuses] = await pool.query(query, [
      ...values,
      parseInt(limit),
      parseInt(offset),
    ]);

    return {
      message: "Commission statuses retrieved successfully",
      data: statuses,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        limit: parseInt(limit),
      },
    };
  } catch (error) {
    logger.application.databaseError(error, "getAllCommissionStatuses");
    throw new AppError("Failed to retrieve commission statuses", AppError.INTERNAL_SERVER_ERROR);
  }
};

const updateCommissionStatus = async (id, data) => {
  const userUniqueId = data.user?.userUniqueId;
  const fields = [];
  const values = [];

  if (data.statusName) {
    fields.push("statusName = ?");
    values.push(data.statusName);
  }
  if (data.description !== undefined) {
    fields.push("description = ?");
    values.push(data.description);
  }
  if (data.effectiveFrom !== undefined) {
    fields.push("effectiveFrom = ?");
    values.push(data.effectiveFrom);
  }
  if (data.effectiveTo !== undefined) {
    fields.push("effectiveTo = ?");
    values.push(data.effectiveTo);
  }

  if (fields.length === 0) {
    throw new AppError("No fields to update", AppError.BAD_REQUEST);
  }

  // Add audit columns
  fields.push("commissionStatusUpdatedBy = ?");
  values.push(userUniqueId);
  fields.push("commissionStatusUpdatedAt = ?");
  values.push(currentDate());

  values.push(id);

  const query = `UPDATE CommissionStatus SET ${fields.join(
    ", ",
  )} WHERE commissionStatusUniqueId = ?`;

  try {
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(query, values);
    if (result.affectedRows === 0) {
      throw new AppError("Commission status not found", AppError.NOT_FOUND);
    }
    return { message: "Commission Status updated successfully", data: result };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return { message: "Commission status name already exists", data: null };
    }
    logger.application.databaseError(error, "updateCommissionStatus");
    throw error;
  }
};

const deleteCommissionStatus = async (id, deletedBy) => {
  // Check for dependencies before delete (e.g. existing active commissions)
  try {
    // Optional: Check if used by active commissions?
    // For soft delete, we might still allow it, but let's keep the safeguard for now
    // or relax it. The user usually wants to "remove" it from lists.
    // Let's check if it's used in *active* commissions not deleted ones.
    const executor = transactionStorage.getStore() || pool;
    const [referencing] = await executor.query(
      "SELECT commissionId FROM Commission WHERE commissionStatusUniqueId = ? AND commissionDeletedAt IS NULL LIMIT 1",
      [id],
    );
    if (referencing.length > 0) {
      return { message: "Commission status is in use — delete skipped" };
    }

    const query = `
      UPDATE CommissionStatus 
      SET commissionStatusDeletedAt = ?, commissionStatusDeletedBy = ? 
      WHERE commissionStatusUniqueId = ? AND commissionStatusDeletedAt IS NULL
    `;
    const [result] = await executor.query(query, [
      currentDate(),
      deletedBy,
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new AppError("Commission status not found or already deleted", AppError.NOT_FOUND);
    }
    return { message: "Commission Status deleted successfully" };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.application.databaseError(error, "deleteCommissionStatus");
    throw new AppError("Failed to delete commission status", AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  createCommissionStatus,
  getAllCommissionStatuses,
  updateCommissionStatus,
  deleteCommissionStatus,
};
