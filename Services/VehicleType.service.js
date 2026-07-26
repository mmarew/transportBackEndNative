const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { deleteFile } = require("../Utils/FileUtils");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const checkVehicleTypeDuplicate = async ({
  vehicleTypeName,
  vehicleTypeIconName,
}) => {
  // Check by name
  const existedByName = await getData({
    tableName: "VehicleTypes",
    conditions: { vehicleTypeName },
  });
  if (existedByName.length > 0) {
    throw new AppError("Vehicle type already exists", 400);
  }

  // Check by icon
  const existedByIcon = await getData({
    tableName: "VehicleTypes",
    conditions: { vehicleTypeIconName },
  });
  if (existedByIcon.length > 0) {
    throw new AppError("Vehicle type icon already exists", 400);
  }

  return { message: "ok" };
};

// Create a new vehicle type
const createVehicleType = async (data) => {
  const vehicleTypeUniqueId = uuidv4();
  const user = data.user;
  const userUniqueId = user.userUniqueId;
  const {
    vehicleTypeName,
    vehicleTypeDescription,
    carryingCapacity,
    vehicleTypeIconName,
  } = data;
  // first verify existence of vehicleTypeName and vehicleTypeIconName
  const existedData = await getData({
    tableName: "VehicleTypes",
    conditions: {
      vehicleTypeName,
    },
  });
  if (existedData.length > 0) {
    throw new AppError("Vehicle type already exists", 400);
  }
  const query = `
    INSERT INTO VehicleTypes (
      vehicleTypeUniqueId,
      vehicleTypeName,
      vehicleTypeIconName,
      vehicleTypeDescription,
      carryingCapacity,
      vehicleTypeCreatedBy,
      vehicleTypeCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    vehicleTypeUniqueId,
    vehicleTypeName,
    vehicleTypeIconName,
    vehicleTypeDescription,
    carryingCapacity,
    userUniqueId,
    currentDate(), // East African Time timestamp
  ];

  const executor = transactionStorage.getStore() || pool;
  await executor.query(query, values);
  return {
    message: "Vehicle type created",
    data: null,
  };
};

// Get all vehicle types
const getVehicleTypesByfilter = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.vehicleTypeUniqueId) {
    clauses.push("vehicleTypeUniqueId = ?");
    params.push(filters.vehicleTypeUniqueId);
  }

  if (filters.vehicleTypeName) {
    clauses.push("vehicleTypeName LIKE ?");
    params.push(`%${String(filters.vehicleTypeName).trim()}%`);
  }

  if (filters.vehicleTypeIconName) {
    clauses.push("vehicleTypeIconName LIKE ?");
    params.push(`%${String(filters.vehicleTypeIconName).trim()}%`);
  }

  if (filters.vehicleTypeDescription) {
    clauses.push("vehicleTypeDescription LIKE ?");
    params.push(`%${String(filters.vehicleTypeDescription).trim()}%`);
  }

  if (filters.vehicleTypeCreatedBy) {
    clauses.push("vehicleTypeCreatedBy = ?");
    params.push(filters.vehicleTypeCreatedBy);
  }

  if (filters.vehicleTypeUpdatedBy) {
    clauses.push("vehicleTypeUpdatedBy = ?");
    params.push(filters.vehicleTypeUpdatedBy);
  }

  if (filters.vehicleTypeDeletedBy) {
    clauses.push("vehicleTypeDeletedBy = ?");
    params.push(filters.vehicleTypeDeletedBy);
  }

  if (filters.carryingCapacity !== undefined) {
    clauses.push("carryingCapacity = ?");
    params.push(Number(filters.carryingCapacity));
  }

  if (filters.vehicleTypeCreatedAt) {
    clauses.push("DATE(vehicleTypeCreatedAt) = DATE(?)");
    params.push(filters.vehicleTypeCreatedAt);
  }

  if (filters.vehicleTypeUpdatedAt === "notNull") {
    clauses.push("vehicleTypeUpdatedAt IS NOT NULL");
  } else if (filters.vehicleTypeUpdatedAt === "null") {
    clauses.push("vehicleTypeUpdatedAt IS NULL");
  } else if (filters.vehicleTypeUpdatedAt) {
    clauses.push("DATE(vehicleTypeUpdatedAt) = DATE(?)");
    params.push(filters.vehicleTypeUpdatedAt);
  }

  if (filters.vehicleTypeDeletedAt === "notNull") {
    clauses.push("vehicleTypeDeletedAt IS NOT NULL");
  } else if (
    filters.vehicleTypeDeletedAt === "null" ||
    filters.vehicleTypeDeletedAt === undefined
  ) {
    clauses.push("vehicleTypeDeletedAt IS NULL");
  } else if (filters.vehicleTypeDeletedAt) {
    clauses.push("DATE(vehicleTypeDeletedAt) = DATE(?)");
    params.push(filters.vehicleTypeDeletedAt);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT *
    FROM VehicleTypes
    ${whereClause}
    ORDER BY vehicleTypeCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM VehicleTypes
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [dataRows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  if (!dataRows || dataRows.length === 0) {
    throw new AppError("No vehicle types found", 404);
  }

  return {
    message: "Vehicle types list fetched",
    data: dataRows,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// Update a vehicle type by unique ID
const updateVehicleType = async (vehicleTypeUniqueId, data, file) => {
  const {
    vehicleTypeName,
    vehicleTypeDescription,
    carryingCapacity,
    vehicleTypeUpdatedBy,
    previousVehicleTypeIconName,
  } = data;

  const setParts = [];
  const values = [];

  if (vehicleTypeName !== undefined) {
    setParts.push("vehicleTypeName = ?");
    values.push(vehicleTypeName);
  }

  if (vehicleTypeDescription !== undefined) {
    setParts.push("vehicleTypeDescription = ?");
    values.push(vehicleTypeDescription);
  }

  if (carryingCapacity !== undefined) {
    setParts.push("carryingCapacity = ?");
    values.push(carryingCapacity);
  }

  if (vehicleTypeUpdatedBy !== undefined) {
    setParts.push("vehicleTypeUpdatedBy = ?");
    values.push(vehicleTypeUpdatedBy);
  }

  let newIconFileName = null;
  if (file) {
    newIconFileName = file.filename;
    setParts.push("vehicleTypeIconName = ?");
    values.push(newIconFileName);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  setParts.push("vehicleTypeUpdatedAt = ?");
  values.push(currentDate());

  const query = `UPDATE VehicleTypes SET ${setParts.join(", ")} WHERE vehicleTypeUniqueId = ? AND vehicleTypeDeletedAt IS NULL`;
  values.push(vehicleTypeUniqueId);

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(query, values);
  if (
    newIconFileName &&
    result.affectedRows > 0 &&
    previousVehicleTypeIconName
  ) {
    deleteFile(previousVehicleTypeIconName);
  }

  if (result.affectedRows === 0) {
    throw new AppError("Vehicle type not found or update failed", 404);
  }

  return { message: "Vehicle type deleted", data: null };
};

// Soft-delete a vehicle type by unique ID
const deleteVehicleType = async (vehicleTypeUniqueId, deletedBy) => {
  const query = `
    UPDATE VehicleTypes 
    SET 
      vehicleTypeDeletedAt = ?, 
      vehicleTypeDeletedBy = ? 
    WHERE vehicleTypeUniqueId = ? AND vehicleTypeDeletedAt IS NULL
  `;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(query, [
    currentDate(),
    deletedBy,
    vehicleTypeUniqueId,
  ]);
  if (result.affectedRows === 0) {
    throw new AppError("Vehicle type not found or already deleted", 404);
  }
  return { message: "Vehicle type deleted", data: null };
};

module.exports = {
  checkVehicleTypeDuplicate,
  createVehicleType,
  getVehicleTypesByfilter,
  updateVehicleType,
  deleteVehicleType,
};
