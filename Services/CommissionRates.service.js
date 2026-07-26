const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");

const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
// Create a commission rate
const createCommissionRate = async ({
  commissionRateUniqueId,
  commissionRate,
  commissionRateEffectiveDate,
  commissionRateExpirationDate,
  commissionRateCreatedBy,
}) => {
  const executor = transactionStorage.getStore() || pool;
  // Check if commission rate with same unique ID already exists
  const sqlCheckUniqueId = `
    SELECT * FROM CommissionRates 
    WHERE commissionRateUniqueId = ?
  `;
  const [existingById] = await executor.query(sqlCheckUniqueId, [
    commissionRateUniqueId,
  ]);

  if (existingById.length > 0) {
    return { message: "Commission rate already exists", data: null };
  }

  const sqlCheckDuplicate = `
    SELECT * FROM CommissionRates 
    WHERE commissionRate = ? 
    AND commissionRateDeletedAt IS NULL
    AND commissionRateEffectiveDate = ?
  `;
  const [existingRate] = await executor.query(sqlCheckDuplicate, [
    commissionRate,
    commissionRateEffectiveDate,
  ]);

  if (existingRate.length > 0) {
    return { message: "Commission rate already exists", data: null };
  }

  // Insert new commission rate
  const sqlInsert = `
    INSERT INTO CommissionRates (
      commissionRateUniqueId,
      commissionRate,
      commissionRateEffectiveDate,
      commissionRateExpirationDate,
      commissionRateCreatedBy,
      commissionRateCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    commissionRateUniqueId,
    commissionRate,
    commissionRateEffectiveDate,
    commissionRateExpirationDate,
    commissionRateCreatedBy,
    currentDate(),
  ];

  await executor.query(sqlInsert, values);

  return {
    message: "Commission rate created",
    data: {
      commissionRateUniqueId,
      commissionRate,
      commissionRateEffectiveDate,
    },
  };
};

// Retrieve all commission rates with pagination and filtering
const getAllCommissionRates = async (filters = {}) => {
  if (filters.commissionUniqueId) {
    const { getAllCommissions } = require("./Commission.service");
    return await getAllCommissions({
      commissionUniqueId: filters.commissionUniqueId,
    });
  }
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.commissionRateUniqueId) {
    clauses.push("commissionRateUniqueId = ?");
    params.push(filters.commissionRateUniqueId);
  }

  if (filters.commissionRate !== undefined) {
    clauses.push("commissionRate = ?");
    params.push(Number(filters.commissionRate));
  }

  if (filters.commissionRateMin !== undefined) {
    clauses.push("commissionRate >= ?");
    params.push(Number(filters.commissionRateMin));
  }

  if (filters.commissionRateMax !== undefined) {
    clauses.push("commissionRate <= ?");
    params.push(Number(filters.commissionRateMax));
  }

  if (filters.commissionRateEffectiveDate) {
    clauses.push("DATE(commissionRateEffectiveDate) = DATE(?)");
    params.push(filters.commissionRateEffectiveDate);
  }

  if (filters.effectiveDateFrom) {
    clauses.push("commissionRateEffectiveDate >= ?");
    params.push(filters.effectiveDateFrom);
  }

  if (filters.effectiveDateTo) {
    clauses.push("commissionRateEffectiveDate <= ?");
    params.push(filters.effectiveDateTo);
  }

  if (filters.commissionRateExpirationDate) {
    clauses.push("DATE(commissionRateExpirationDate) = DATE(?)");
    params.push(filters.commissionRateExpirationDate);
  }

  if (filters.expirationDateFrom) {
    clauses.push("commissionRateExpirationDate >= ?");
    params.push(filters.expirationDateFrom);
  }

  if (filters.expirationDateTo) {
    clauses.push("commissionRateExpirationDate <= ?");
    params.push(filters.expirationDateTo);
  }

  if (filters.commissionRateCreatedBy) {
    clauses.push("commissionRateCreatedBy = ?");
    params.push(filters.commissionRateCreatedBy);
  }

  if (filters.commissionRateUpdatedBy) {
    clauses.push("commissionRateUpdatedBy = ?");
    params.push(filters.commissionRateUpdatedBy);
  }

  if (filters.commissionRateDeletedBy) {
    clauses.push("commissionRateDeletedBy = ?");
    params.push(filters.commissionRateDeletedBy);
  }

  if (filters.commissionRateCreatedAt) {
    clauses.push("DATE(commissionRateCreatedAt) = DATE(?)");
    params.push(filters.commissionRateCreatedAt);
  }

  if (filters.commissionRateUpdatedAt === "notNull") {
    clauses.push("commissionRateUpdatedAt IS NOT NULL");
  } else if (filters.commissionRateUpdatedAt === "null") {
    clauses.push("commissionRateUpdatedAt IS NULL");
  } else if (filters.commissionRateUpdatedAt) {
    clauses.push("DATE(commissionRateUpdatedAt) = DATE(?)");
    params.push(filters.commissionRateUpdatedAt);
  }

  if (filters.commissionRateDeletedAt === "notNull") {
    clauses.push("commissionRateDeletedAt IS NOT NULL");
  } else if (
    filters.commissionRateDeletedAt === "null" ||
    filters.commissionRateDeletedAt === undefined
  ) {
    clauses.push("commissionRateDeletedAt IS NULL");
  } else if (filters.commissionRateDeletedAt) {
    clauses.push("DATE(commissionRateDeletedAt) = DATE(?)");
    params.push(filters.commissionRateDeletedAt);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const sortableMap = {
    commissionRateCreatedAt: "commissionRateCreatedAt",
    commissionRateUpdatedAt: "commissionRateUpdatedAt",
    commissionRateEffectiveDate: "commissionRateEffectiveDate",
    commissionRateExpirationDate: "commissionRateExpirationDate",
    commissionRate: "commissionRate",
  };
  const safeSortBy = sortableMap[filters.sortBy] || "commissionRateCreatedAt";
  const safeSortOrder =
    String(filters.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const countSql = `SELECT COUNT(*) as total FROM CommissionRates ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  const dataSql = `
    SELECT *
    FROM CommissionRates
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  if (!rows || rows.length === 0) {
    throw new AppError("No commission rates found", 404);
  }

  return {
    message: "Commission rates list fetched",
    data: rows,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// Update a commission rate by its unique ID
const updateCommissionRateByUniqueId = async ({
  commissionRateUniqueId,
  commissionRate,
  commissionRateEffectiveDate,
  commissionRateExpirationDate,
  commissionRateUpdatedBy,
}) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query(
    "SELECT commissionRateUniqueId, commissionRateDeletedAt FROM CommissionRates WHERE commissionRateUniqueId = ?",
    [commissionRateUniqueId],
  );
  if (!existingRows || existingRows.length === 0) {
    throw new AppError("Commission rate not found", 404);
  }
  if (existingRows[0]?.commissionRateDeletedAt) {
    await executor.query(
      "UPDATE CommissionRates SET commissionRateDeletedAt = NULL, commissionRateDeletedBy = NULL WHERE commissionRateUniqueId = ?",
      [commissionRateUniqueId],
    );
  }

  const setParts = [];
  const values = [];

  if (commissionRate !== undefined) {
    setParts.push("commissionRate = ?");
    values.push(commissionRate);
  }

  if (commissionRateEffectiveDate !== undefined) {
    setParts.push("commissionRateEffectiveDate = ?");
    values.push(commissionRateEffectiveDate);
  }

  if (commissionRateExpirationDate !== undefined) {
    setParts.push("commissionRateExpirationDate = ?");
    values.push(commissionRateExpirationDate);
  }

  if (commissionRateUpdatedBy !== undefined) {
    setParts.push("commissionRateUpdatedBy = ?");
    values.push(commissionRateUpdatedBy);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  setParts.push("commissionRateUpdatedAt = CURRENT_TIMESTAMP");
  const sqlQuery = `UPDATE CommissionRates SET ${setParts.join(", ")} WHERE commissionRateUniqueId = ?`;
  values.push(commissionRateUniqueId);

  const [result] = await executor.query(sqlQuery, values);
  if (result.affectedRows === 0) {
    throw new AppError("Commission rate update failed", 500);
  }

  return { message: "Commission rate deleted", data: null };
};

// Soft delete a commission rate by its unique ID
const deleteCommissionRateByUniqueId = async ({
  commissionRateUniqueId,
  commissionRateDeletedBy,
}) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query(
    "SELECT commissionRateUniqueId, commissionRateDeletedAt FROM CommissionRates WHERE commissionRateUniqueId = ?",
    [commissionRateUniqueId],
  );
  if (!existingRows || existingRows.length === 0) {
    throw new AppError("Commission rate not found", 404);
  }
  if (existingRows[0]?.commissionRateDeletedAt) {
    return { message: "Commission rate deleted", data: null };
  }

  const sqlDelete = `
    UPDATE CommissionRates 
    SET 
      commissionRateDeletedAt = ?,
      commissionRateDeletedBy = ?
    WHERE commissionRateUniqueId = ? AND commissionRateDeletedAt IS NULL
  `;

  const values = [
    currentDate(),
    commissionRateDeletedBy,
    commissionRateUniqueId,
  ];

  const [result] = await executor.query(sqlDelete, values);
  if (result.affectedRows === 0) {
    throw new AppError("Commission rate delete failed", 500);
  }

  return { message: "Commission rate deleted", data: null };
};

module.exports = {
  createCommissionRate,
  getAllCommissionRates,
  updateCommissionRateByUniqueId,
  deleteCommissionRateByUniqueId,
};
