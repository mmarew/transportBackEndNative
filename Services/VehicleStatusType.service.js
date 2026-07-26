const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const logger = require("../Utils/logger");

// Create a new VehicleStatusType
const createVehicleStatusType = async (data) => {
  const statusTypeName = data.VehicleStatusTypeName || data.typeName;
  if (!statusTypeName) {
    throw new AppError("Vehicle Status Type name is required", 400);
  }
  if (statusTypeName.length > 50) {
    throw new AppError("Vehicle Status Type name is too long", 400);
  }

  const registeredType = await getData({
    tableName: "VehicleStatusTypes",
    conditions: { VehicleStatusTypeName: statusTypeName, VehicleStatusTypeDeletedAt: null },
  });

  if (registeredType?.length) {
    return {
      message: "Vehicle status type operation completed",
      data: null,
    };
  }

  const VehicleStatusTypeCreatedBy = data.userUniqueId || "admin";
  const vehicleStatusTypeUniqueId = data.vehicleStatusTypeUniqueId || uuidv4();
  const payload = {
    vehicleStatusTypeUniqueId,
    VehicleStatusTypeName: statusTypeName,
    VehicleStatusTypeDescription: data.statusTypeDescription || data.description,
    VehicleStatusTypeCreatedAt: currentDate(),
    VehicleStatusTypeCreatedBy,
  };

  if (data.VehicleStatusTypeId) {
    payload.VehicleStatusTypeId = data.VehicleStatusTypeId;
  }
  
  logger.info(`Inserting VehicleStatusType: ${statusTypeName}`, { vehicleStatusTypeUniqueId });
  
  const result = await insertData({
    tableName: "VehicleStatusTypes",
    colAndVal: payload,
  });
  return { 
    message: "Vehicle status type operation completed", 
    data: { 
      vehicleStatusTypeUniqueId,
      result
    } 
  };
};

// Unified GET with filtering
const getAllVehicleStatusTypes = async (filters = {}) => {
  const { page = 1, limit = 10, typeName, vehicleStatusTypeUniqueId } = filters;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const offset = (pageNum - 1) * limitNum;

  const where = ["VehicleStatusTypeDeletedAt IS NULL"];
  const params = [];

  if (vehicleStatusTypeUniqueId) {
    where.push("vehicleStatusTypeUniqueId = ?");
    params.push(vehicleStatusTypeUniqueId);
  }
  if (typeName) {
    where.push("VehicleStatusTypeName LIKE ?");
    params.push(`%${typeName}%`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const sql = `SELECT * FROM VehicleStatusTypes ${whereClause} LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as total FROM VehicleStatusTypes ${whereClause}`;

  const executor = transactionStorage.getStore() || pool;
  const [[countRow]] = await executor.query(countSql, params);
  
  params.push(limitNum, offset);
  const [rows] = await executor.query(sql, params);

  return {
    message: "Vehicle status type operation completed",
    data: rows,
    pagination: {
      currentPage: pageNum,
      limit: limitNum,
      totalItems: countRow?.total || 0,
      totalPages: Math.ceil((countRow?.total || 0) / limitNum) || 1,
    },
  };
};

// Update VehicleStatusType by UUID
const updateVehicleStatusType = async (vehicleStatusTypeUniqueId, data) => {
  const payload = {
    VehicleStatusTypeName: data.statusTypeName || data.typeName,
    VehicleStatusTypeDescription: data.statusTypeDescription || data.description,
  };

  const result = await updateData({
    tableName: "VehicleStatusTypes",
    conditions: { vehicleStatusTypeUniqueId },
    updateValues: payload,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Update failed or Vehicle Status Type not found", 404);
  }

  return {
    message: "Vehicle status type operation completed",
    data: null,
  };
};

// Soft Delete VehicleStatusType by UUID
const deleteVehicleStatusType = async (vehicleStatusTypeUniqueId) => {
  const result = await updateData({
    tableName: "VehicleStatusTypes",
    conditions: { vehicleStatusTypeUniqueId },
    updateValues: {
      VehicleStatusTypeDeletedAt: currentDate(),
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Delete failed or Vehicle Status Type not found", 404);
  }

  return {
    message: "Vehicle status type operation completed",
    data: null,
  };
};

module.exports = {
  createVehicleStatusType,
  getAllVehicleStatusTypes,
  updateVehicleStatusType,
  deleteVehicleStatusType,
};
