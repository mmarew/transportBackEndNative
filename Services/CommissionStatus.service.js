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

  // Check if exists by name
  const [existing] = await executor.query(
    "SELECT commissionStatusId FROM CommissionStatus WHERE statusName = ?",
    [statusName],
  );

  if (existing.length > 0) {
    return {
      message: "success",
      data: "Commission status with this name already exists",
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
    message: "success",
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
    conditions.push("deletedAt IS NULL");

    if (active === "true" || active === true) {
      conditions.push(
        "(effectiveFrom IS NULL OR effectiveFrom <= ?) AND (effectiveTo IS NULL OR effectiveTo >= ?)",
      );
      values.push(currentDate(), currentDate());
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
        createdAt
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
        totalCount,
        limit: parseInt(limit),
      },
      code: "COMMISSION_STATUSES_RETRIEVED",
    };
  } catch (error) {
    logger.application.databaseError(error, "getAllCommissionStatuses");
    throw new AppError("Failed to retrieve commission statuses", 500);
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
    throw new AppError("No fields to update", 400);
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
      throw new AppError("Commission status not found", 404);
    }
    return { message: "Commission Status updated successfully", data: result };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError("Commission status name already exists", 409);
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
      throw new AppError(
        "Cannot delete status: It is currently used by active commissions",
        409,
      );
    }

    const query = `
      UPDATE CommissionStatus 
      SET deletedAt = ?, deletedBy = ? 
      WHERE commissionStatusUniqueId = ? AND deletedAt IS NULL
    `;
    const [result] = await executor.query(query, [currentDate(), deletedBy, id]);

    if (result.affectedRows === 0) {
      throw new AppError("Commission status not found or already deleted", 404);
    }
    return { message: "Commission Status deleted successfully" };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.application.databaseError(error, "deleteCommissionStatus");
    throw new AppError("Failed to delete commission status", 500);
  }
};

module.exports = {
  createCommissionStatus,
  getAllCommissionStatuses,
  updateCommissionStatus,
  deleteCommissionStatus,
};
