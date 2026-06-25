const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new tariff rate
exports.createTariffRate = async (data) => {
  const {
    tariffRateName,
    standingTariffRate,
    journeyTariffRate,
    timingTariffRate,
    tariffRateDescription,
    tariffRateEffectiveDate,
    tariffRateExpirationDate,
  } = data;
  // validate if all  tariff rate exists
  if (
    !tariffRateName ||
    !standingTariffRate ||
    !journeyTariffRate ||
    !timingTariffRate
  ) {
    throw new AppError(
      "Tariff rate name and all tariff rates are required",
      400,
    );
  }
  const executor = transactionStorage.getStore() || pool;
  const [existedTariffRate] = await executor.query(
    "SELECT tariffRateId FROM TariffRate WHERE tariffRateName = ? AND tariffRateDeletedAt IS NULL LIMIT 1",
    [tariffRateName],
  );
  if (existedTariffRate?.length > 0) {
    throw new AppError("Tariff rate already exists", 400);
  }
  const sql = `
    INSERT INTO TariffRate (
      tariffRateUniqueId,
      tariffRateName,
      standingTariffRate,
      journeyTariffRate,
      timingTariffRate,
      tariffRateEffectiveDate,
      tariffRateExpirationDate,
      tariffRateDescription,
      tariffRateCreatedBy,
      tariffRateCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const user = data.user;
  const userUniqueId = user.userUniqueId;
  const tariffRateUniqueId = uuidv4();
  const values = [
    tariffRateUniqueId,
    tariffRateName,
    standingTariffRate,
    journeyTariffRate,
    timingTariffRate,
    tariffRateEffectiveDate,
    tariffRateExpirationDate,
    tariffRateDescription,
    userUniqueId,
    currentDate(),
  ];
  await (transactionStorage.getStore() || pool).query(sql, values);
  return { 
    message: "success", 
    data: {
      tariffRateUniqueId,
      message: "Tariff rate created successfully"
    } 
  };
};

/**
 * Get tariff rates with optional filtering and pagination.
 * Supports: tariffRateUniqueId, tariffRateName, page, limit, sortBy, sortOrder
 */
exports.getTariffRatesByFilter = async (filters = {}) => {
  const {
    tariffRateUniqueId,
    tariffRateName,
    page = 1,
    limit = 10,
    sortBy = "tariffRateId",
    sortOrder = "DESC",
  } = filters;

  const executor = transactionStorage.getStore() || pool;
  let whereClause = "WHERE tariffRateDeletedAt IS NULL";
  const queryParams = [];
  const countParams = [];

  if (tariffRateUniqueId) {
    whereClause += " AND tariffRateUniqueId = ?";
    queryParams.push(tariffRateUniqueId);
    countParams.push(tariffRateUniqueId);
  }

  if (tariffRateName) {
    whereClause += " AND LOWER(tariffRateName) LIKE LOWER(?)";
    queryParams.push(`%${tariffRateName}%`);
    countParams.push(`%${tariffRateName}%`);
  }

  // Sorting
  const validSortColumns = [
    "tariffRateId",
    "tariffRateName",
    "tariffRateCreatedAt",
    "tariffRateEffectiveDate",
    "tariffRateExpirationDate",
  ];
  const safeSortColumn = validSortColumns.includes(sortBy)
    ? sortBy
    : "tariffRateId";
  const safeSortOrder = sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

  // Count query
  const [countResult] = await executor.query(
    `SELECT COUNT(*) as total FROM TariffRate ${whereClause}`,
    countParams,
  );
  const total = countResult[0]?.total || 0;

  // Data query with pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  queryParams.push(parseInt(limit), offset);

  const [rows] = await executor.query(
    `SELECT * FROM TariffRate ${whereClause} ORDER BY ${safeSortColumn} ${safeSortOrder} LIMIT ? OFFSET ?`,
    queryParams,
  );

  const totalPages = Math.ceil(total / parseInt(limit));

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNext: parseInt(page) < totalPages,
      hasPrev: parseInt(page) > 1,
    },
  };
};

// Update a tariff rate by UUID
exports.updateTariffRate = async (tariffRateUniqueId, data) => {
  const userUniqueId = data.user?.userUniqueId;

  // Protect ID/UUID fields from being updated
  delete data.tariffRateUniqueId;
  delete data.tariffRateId;

  const setParts = [];
  const values = [];

  // Build dynamic SET clause based on provided fields
  if (data.tariffRateName !== undefined) {
    setParts.push("tariffRateName = ?");
    values.push(data.tariffRateName);
  }
  if (data.standingTariffRate !== undefined) {
    setParts.push("standingTariffRate = ?");
    values.push(data.standingTariffRate);
  }
  if (data.journeyTariffRate !== undefined) {
    setParts.push("journeyTariffRate = ?");
    values.push(data.journeyTariffRate);
  }
  if (data.timingTariffRate !== undefined) {
    setParts.push("timingTariffRate = ?");
    values.push(data.timingTariffRate);
  }
  if (data.tariffRateEffectiveDate !== undefined) {
    setParts.push("tariffRateEffectiveDate = ?");
    values.push(data.tariffRateEffectiveDate);
  }
  if (data.tariffRateExpirationDate !== undefined) {
    setParts.push("tariffRateExpirationDate = ?");
    values.push(data.tariffRateExpirationDate);
  }
  if (data.tariffRateDescription !== undefined) {
    setParts.push("tariffRateDescription = ?");
    values.push(data.tariffRateDescription);
  }

  // Check if any fields were provided to update
  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Always update audit fields
  setParts.push("tariffRateUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("tariffRateUpdatedAt = ?");
  values.push(currentDate());

  values.push(tariffRateUniqueId);
  const sql = `UPDATE TariffRate SET ${setParts.join(", ")} WHERE tariffRateUniqueId = ? AND tariffRateDeletedAt IS NULL`;

  const [result] = await (transactionStorage.getStore() || pool).query(sql, values);
  if (result.affectedRows === 0) {
    throw new AppError("Tariff rate not found or update failed", 404);
  }
  return { message: "success", data: "Tariff rate updated successfully" };
};

// Soft delete a tariff rate by UUID
exports.deleteTariffRate = async (tariffRateUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const sql = `UPDATE TariffRate SET tariffRateDeletedAt = ?, tariffRateDeletedBy = ? WHERE tariffRateUniqueId = ? AND tariffRateDeletedAt IS NULL`;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [currentDate(), userUniqueId, tariffRateUniqueId]);
  if (result.affectedRows === 0) {
    throw new AppError("Tariff rate not found or delete failed", 404);
  }
  return { message: "success", data: "Tariff rate deleted successfully" };
};
