const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new tariff rate for a vehicle type
exports.createTariffRateForVehicleType = async (data) => {
  const executor = transactionStorage.getStore() || pool;

  // Check for existing active record (exclude soft-deleted)
  const [existedData] = await executor.query(
    `SELECT tariffRateForVehicleTypeId FROM TariffRateForVehicleTypes
     WHERE vehicleTypeUniqueId = ? AND tariffRateUniqueId = ?
       AND tariffRateForVehicleTypeDeletedAt IS NULL
     LIMIT 1`,
    [data.vehicleTypeUniqueId, data.tariffRateUniqueId],
  );

  if (existedData.length > 0) {
    throw new AppError("Tariff rate for vehicle type already exists", AppError.BAD_REQUEST);
  }

  const sql = `
    INSERT INTO TariffRateForVehicleTypes (
      tariffRateForVehicleTypeUniqueId,
      vehicleTypeUniqueId,
      tariffRateUniqueId,
      tariffRateForVehicleTypeCreatedBy,
      tariffRateForVehicleTypeCreatedAt
    ) VALUES (?, ?, ?, ?, ?)
  `;
  const userUniqueId = data.user?.userUniqueId;
  const tariffRateForVehicleTypeUniqueId = uuidv4();
  await executor.query(sql, [
    tariffRateForVehicleTypeUniqueId,
    data.vehicleTypeUniqueId,
    data.tariffRateUniqueId,
    userUniqueId || null,
    currentDate(),
  ]);

  return {
    message: "Tariff rates for vehicle types fetched",
    data: { tariffRateForVehicleTypeUniqueId },
  };
};

/**
 * Get tariff rates for vehicle types with optional filtering and pagination.
 * Supports: tariffRateForVehicleTypeUniqueId, vehicleTypeUniqueId, tariffRateUniqueId, page, limit
 */
exports.getTariffRatesByFilterForVehicleTypes = async (filters = {}) => {
  const {
    tariffRateForVehicleTypeUniqueId,
    vehicleTypeUniqueId,
    tariffRateUniqueId,
    page = 1,
    limit = 10,
    sortBy = "tariffRateForVehicleTypeId",
    sortOrder = "DESC",
  } = filters;

  const executor = transactionStorage.getStore() || pool;
  let whereClause = "WHERE TRVT.tariffRateForVehicleTypeDeletedAt IS NULL";
  const queryParams = [];
  const countParams = [];

  if (tariffRateForVehicleTypeUniqueId) {
    whereClause += " AND TRVT.tariffRateForVehicleTypeUniqueId = ?";
    queryParams.push(tariffRateForVehicleTypeUniqueId);
    countParams.push(tariffRateForVehicleTypeUniqueId);
  }

  if (vehicleTypeUniqueId) {
    whereClause += " AND TRVT.vehicleTypeUniqueId = ?";
    queryParams.push(vehicleTypeUniqueId);
    countParams.push(vehicleTypeUniqueId);
  }

  if (tariffRateUniqueId) {
    whereClause += " AND TRVT.tariffRateUniqueId = ?";
    queryParams.push(tariffRateUniqueId);
    countParams.push(tariffRateUniqueId);
  }

  // Sorting
  const validSortColumns = [
    "tariffRateForVehicleTypeId",
    "vehicleTypeName",
    "tariffRateName",
  ];
  const safeSortColumn = validSortColumns.includes(sortBy)
    ? sortBy
    : "tariffRateForVehicleTypeId";
  const safeSortOrder = sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

  // Use appropriate table prefix for sort column
  let orderByColumn;
  if (safeSortColumn === "vehicleTypeName") {
    orderByColumn = "VT.vehicleTypeName";
  } else if (safeSortColumn === "tariffRateName") {
    orderByColumn = "TR.tariffRateName";
  } else {
    orderByColumn = `TRVT.${safeSortColumn}`;
  }

  const joinClause = `
    FROM TariffRateForVehicleTypes TRVT
    JOIN VehicleTypes VT ON TRVT.vehicleTypeUniqueId = VT.vehicleTypeUniqueId
    JOIN TariffRate TR ON TRVT.tariffRateUniqueId = TR.tariffRateUniqueId
  `;

  // Count query
  const [countResult] = await executor.query(
    `SELECT COUNT(*) as total ${joinClause} ${whereClause}`,
    countParams,
  );
  const total = countResult[0]?.total || 0;

  // Data query with pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  queryParams.push(parseInt(limit), offset);

  const [rows] = await executor.query(
    `SELECT TRVT.*, VT.*, TR.* ${joinClause} ${whereClause}
     ORDER BY ${orderByColumn} ${safeSortOrder} LIMIT ? OFFSET ?`,
    queryParams,
  );

  const totalPages = Math.ceil(total / parseInt(limit));

  return {
    message: "Tariff rates for vehicle types fetched",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      limit: parseInt(limit),
    },
  };
};

// Get tariff rate by vehicle type unique id (used internally by PaymentCalculator)
exports.getTariffRateByVehicleTypeUniqueId = async (vehicleTypeUniqueId) => {
  const { performJoinSelect } = require("../CRUD/Read/ReadData");
  const result = await performJoinSelect({
    baseTable: "TariffRateForVehicleTypes",
    joins: [
      {
        table: "TariffRate",
        on: "TariffRateForVehicleTypes.tariffRateUniqueId = TariffRate.tariffRateUniqueId",
      },
    ],
    conditions: {
      vehicleTypeUniqueId: vehicleTypeUniqueId,
    },
  });

  return {
    message: "Tariff rates for vehicle types fetched",
    data: result || [],
  };
};

// Update a tariff rate for vehicle type by UUID
exports.updateTariffRateForVehicleType = async (
  tariffRateForVehicleTypeUniqueId,
  data,
) => {
  // Protect ID/UUID fields from being updated
  delete data.tariffRateForVehicleTypeUniqueId;
  delete data.tariffRateForVehicleTypeId;

  const userUniqueId = data.user?.userUniqueId;
  const setParts = [];
  const values = [];

  // Build dynamic SET clause — only update provided fields
  if (data.vehicleTypeUniqueId !== undefined) {
    setParts.push("vehicleTypeUniqueId = ?");
    values.push(data.vehicleTypeUniqueId);
  }
  if (data.tariffRateUniqueId !== undefined) {
    setParts.push("tariffRateUniqueId = ?");
    values.push(data.tariffRateUniqueId);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // Always update audit fields
  setParts.push("tariffRateForVehicleTypeUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("tariffRateForVehicleTypeUpdatedAt = ?");
  values.push(currentDate());

  values.push(tariffRateForVehicleTypeUniqueId);
  const sql = `UPDATE TariffRateForVehicleTypes SET ${setParts.join(", ")}
    WHERE tariffRateForVehicleTypeUniqueId = ?
      AND tariffRateForVehicleTypeDeletedAt IS NULL`;

  const [result] = await (transactionStorage.getStore() || pool).query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError(
      "Tariff rate for vehicle type not found or no changes made",
      AppError.NOT_FOUND,
    );
  }

  return {
    message: "Tariff rates for vehicle types fetched",
    data: null,
  };
};

// Soft delete a tariff rate for vehicle type by UUID
exports.deleteTariffRateForVehicleType = async (
  tariffRateForVehicleTypeUniqueId,
  user,
) => {
  const userUniqueId = user?.userUniqueId;
  const sql = `
    UPDATE TariffRateForVehicleTypes
    SET tariffRateForVehicleTypeDeletedAt = ?,
        tariffRateForVehicleTypeDeletedBy = ?
    WHERE tariffRateForVehicleTypeUniqueId = ?
      AND tariffRateForVehicleTypeDeletedAt IS NULL
  `;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [
    currentDate(),
    userUniqueId,
    tariffRateForVehicleTypeUniqueId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Tariff rate for vehicle type not found", AppError.NOT_FOUND);
  }

  return {
    message: "Tariff rates for vehicle types fetched",
    data: null,
  };
};
