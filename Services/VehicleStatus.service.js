const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const createVehicleStatus = async (data) => {
  const {
    vehicleUniqueId,
    VehicleStatusTypeId,
    statusEndDate = null,
    vehicleStatusCreatedBy,
    connection = null, // Optional connection for transaction
  } = data;
  if (!vehicleUniqueId || !VehicleStatusTypeId) {
    throw new AppError(
      "VehicleUniqueId and VehicleStatusTypeId are required",
      400,
    );
  }

  // Check if the status already exists
  const existingStatus = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleUniqueId },
    connection,
  });

  if (existingStatus.length) {
    // throw new AppError("VehicleStatus already exists", 400);
  }

  const vehicleStatusUniqueId = uuidv4();
  const colAndVal = {
    vehicleStatusUniqueId,
    vehicleUniqueId,
    VehicleStatusTypeId,
    statusStartDate: currentDate(),
    statusEndDate,
    vehicleStatusCreatedBy,
    vehicleStatusCreatedAt: currentDate(),
  };
  console.log("@createVehicleStatus colAndVal", colAndVal);
  // Insert new status
  const result = await insertData({
    tableName: "VehicleStatus",
    colAndVal,
    connection,
  });

  return { message: "success", data: result };
};

const getVehicleStatuses = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    vehicleStatusUniqueId,
    vehicleUniqueId,
    VehicleStatusTypeId,
    search,
  } = filters;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;
  const offset = (pageNum - 1) * limitNum;

  const where = ["vs.vehicleStatusDeletedAt IS NULL"];
  const params = [];

  if (vehicleStatusUniqueId) {
    where.push("vs.vehicleStatusUniqueId = ?");
    params.push(vehicleStatusUniqueId);
  }
  if (vehicleUniqueId) {
    where.push("vs.vehicleUniqueId = ?");
    params.push(vehicleUniqueId);
  }
  if (VehicleStatusTypeId) {
    where.push("vs.VehicleStatusTypeId = ?");
    params.push(VehicleStatusTypeId);
  }
  if (search) {
    where.push("(vst.VehicleStatusTypeName LIKE ? OR vs.remark LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT 
      vs.*,
      vst.VehicleStatusTypeName,
      vst.VehicleStatusTypeDescription
    FROM VehicleStatus vs
    LEFT JOIN VehicleStatusTypes vst ON vs.VehicleStatusTypeId = vst.VehicleStatusTypeId
    ${whereClause}
    ORDER BY vs.vehicleStatusCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total 
    FROM VehicleStatus vs
    LEFT JOIN VehicleStatusTypes vst ON vs.VehicleStatusTypeId = vst.VehicleStatusTypeId
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [[countRow]] = await executor.query(countSql, params);

  params.push(limitNum, offset);
  const [rows] = await executor.query(sql, params);

  return {
    message: "success",
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countRow?.total || 0,
      totalPages: Math.ceil((countRow?.total || 0) / limitNum) || 1,
    },
  };
};

const updateVehicleStatus = async (vehicleStatusUniqueId, data) => {
  const result = await updateData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    updateValues: data,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Update failed or VehicleStatus not found", 404);
  }

  return { message: "success", data: result };
};

const deleteVehicleStatus = async (vehicleStatusUniqueId) => {
  const result = await updateData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusUniqueId },
    updateValues: {
      vehicleStatusDeletedAt: currentDate(),
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Delete failed or VehicleStatus not found", 404);
  }

  return {
    message: "success",
    data: "VehicleStatus soft-deleted successfully",
  };
};

const getStatusOfVehicleByVehicleUniqueId = async (vehicleUniqueId) => {
  const result = await getVehicleStatuses({ vehicleUniqueId, limit: 1 });
  return {
    message: result.message,
    data: result.data?.[0] || null,
  };
};

module.exports = {
  createVehicleStatus,
  updateVehicleStatus,
  deleteVehicleStatus,
  getVehicleStatuses,
  getStatusOfVehicleByVehicleUniqueId,
};
