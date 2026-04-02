const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { createVehicleOwnership } = require("./VehicleOwnership.service");
const { createVehicleStatus } = require("./VehicleStatus.service");
const { removeWhiteSpace } = require("../Validator/Validation");
const { createVehicleDriver } = require("./VehicleDriver.service");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { transactionStorage } = require("../Utils/TransactionContext");
const { sendSocketIONotificationToAdmin } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const { performJoinSelect } = require("../CRUD/Read/ReadData");

// create vehicle and create ownership based on status of vehicle.
const createVehicle = async (data, user, driverUserUniqueId) => {

  let vehicleTypeUniqueId = data?.vehicleTypeUniqueId,
    licensePlate = data?.licensePlate,
    color = data?.color;

  licensePlate = removeWhiteSpace(licensePlate);
  if (!vehicleTypeUniqueId || !licensePlate || !color) {
    throw new AppError("All fields are required", 400);
  }

  // Verify if VehicleType exists
  const vehicleTypeExists = await getData({
    tableName: "VehicleTypes",
    conditions: { vehicleTypeUniqueId },
  });

  if (!vehicleTypeExists.length) {
    throw new AppError("Vehicle type does not exist", 400);
  }

  // Check if vehicle with the same license plate exists
  let vehicle = await getData({
    tableName: "Vehicle",
    conditions: { licensePlate },
  });

  if (!vehicle?.length) {
    // Vehicle doesn't exist, create it
    const vehicleUniqueId = uuidv4();
    await insertData({
      tableName: "Vehicle",
      colAndVal: {
        vehicleUniqueId,
        vehicleTypeUniqueId,
        licensePlate,
        color,
        vehicleCreatedBy: user?.userUniqueId,
        vehicleCreatedAt: currentDate(),
      },
    });

    // Register vehicle status as Active (VehicleStatusTypeId = 1)
    await createVehicleStatus({
      vehicleUniqueId,
      VehicleStatusTypeId: 1,
      vehicleStatusCreatedBy: user?.userUniqueId,
    });

    vehicle = [{ vehicleUniqueId }];
  }

  // Check active assignment for this driver
  const activeAssignments = await getData({
    tableName: "VehicleDriver",
    conditions: {
      driverUserUniqueId,
      assignmentStatus: "active",
    },
  });
  logger.debug("@activeAssignments", activeAssignments);
  if (activeAssignments?.length > 0) {
    throw new AppError("Driver already has an active vehicle", 400);
  }

  const vehicleUniqueId = vehicle?.[0]?.vehicleUniqueId;

  // Create vehicle ownership record
  await createVehicleOwnership({
    vehicleUniqueId,
    userUniqueId: driverUserUniqueId,
    roleId: usersRoles.vehicleOwnerRoleId,
    ownershipStartDate: currentDate(),
    vehicleOwnershipCreatedBy: user?.userUniqueId,
  });

  // Assign driver to vehicle
  await createVehicleDriver({
    vehicleUniqueId,
    driverUserUniqueId: driverUserUniqueId,
    assignmentStartDate: currentDate(),
    assignmentStatus: "active",
    vehicleDriverCreatedBy: user?.userUniqueId,
  });

  // Fetch full driver and vehicle info for admin notification
  const driverData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
      {
        table: "Statuses",
        on: "UserRoleStatusCurrent.statusId = Statuses.statusId",
      },
    ],
    conditions: {
      "Users.userUniqueId": driverUserUniqueId,
      "UserRole.roleId": usersRoles.driverRoleId,
    },
    limit: 1,
  });

  if (driverData?.length > 0) {
    sendSocketIONotificationToAdmin({
      message: {
        message: "success",
        request: "New vehicle registered",
        messageType: messageTypes.create_vehicle,
        driver: driverData[0],
      },
      phoneNumber: driverData[0]?.phoneNumber,
    });
  }

  return { message: "success", data: { vehicleUniqueId } };
};

const updateVehicle = async (vehicleUniqueId, updateValues, user) => {
  const roleId = user?.roleId;
  const userUniqueId = user?.userUniqueId;

  if (
    roleId !== usersRoles.adminRoleId &&
    roleId !== usersRoles.supperAdminRoleId
  ) {
    // Verify ownership or assignment
    const verification = await pool.query(
      `SELECT 1 FROM Vehicle v
       LEFT JOIN VehicleOwnership vo ON v.vehicleUniqueId = vo.vehicleUniqueId AND vo.ownershipEndDate IS NULL
       LEFT JOIN VehicleDriver vd ON v.vehicleUniqueId = vd.vehicleUniqueId AND vd.assignmentStatus = 'active' AND vd.assignmentEndDate IS NULL
       WHERE v.vehicleUniqueId = ? 
         AND (vo.userUniqueId = ? OR vd.driverUserUniqueId = ?)
         AND v.vehicleDeletedAt IS NULL`,
      [vehicleUniqueId, userUniqueId, userUniqueId]
    );

    if (!verification[0].length) {
      throw new AppError("Unauthorized: You do not own or drive this vehicle", 403);
    }
  }

  const result = await updateData({
    tableName: "Vehicle",
    conditions: { vehicleUniqueId },
    updateValues,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update vehicle or vehicle not found", 404);
  }

  return { message: "success", data: "Vehicle updated successfully" };
};

const deleteVehicle = async (vehicleUniqueId, user) => {
  const roleId = user?.roleId;
  const userUniqueId = user?.userUniqueId;

  if (
    roleId !== usersRoles.adminRoleId &&
    roleId !== usersRoles.supperAdminRoleId
  ) {
    // Verify ownership or assignment
    const verification = await pool.query(
      `SELECT 1 FROM Vehicle v
       LEFT JOIN VehicleOwnership vo ON v.vehicleUniqueId = vo.vehicleUniqueId AND vo.ownershipEndDate IS NULL
       LEFT JOIN VehicleDriver vd ON v.vehicleUniqueId = vd.vehicleUniqueId AND vd.assignmentStatus = 'active' AND vd.assignmentEndDate IS NULL
       WHERE v.vehicleUniqueId = ? 
         AND (vo.userUniqueId = ? OR vd.driverUserUniqueId = ?)
         AND v.vehicleDeletedAt IS NULL`,
      [vehicleUniqueId, userUniqueId, userUniqueId]
    );

    if (!verification[0].length) {
      throw new AppError("Unauthorized: You do not own or drive this vehicle", 403);
    }
  }

  const result = await updateData({
    tableName: "Vehicle",
    conditions: { vehicleUniqueId },
    updateValues: { 
      vehicleDeletedAt: currentDate() 
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete vehicle or vehicle not found", 404);
  }

  return { message: "success", data: "Vehicle soft-deleted successfully" };
};

const getVehicles = async (query) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "vehicleCreatedAt",
    sortOrder = "DESC",
    vehicleUniqueId,
    ownerUserUniqueId,
    driverUserUniqueId,
    licensePlate,
    color,
    vehicleTypeUniqueId,
    search,
  } = query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = ["v.vehicleDeletedAt IS NULL"];
  const params = [];

  if (vehicleUniqueId) {
    whereConditions.push("v.vehicleUniqueId = ?");
    params.push(vehicleUniqueId);
  }

  // Include vehicles user owns (VehicleOwnership) OR is assigned to as driver (VehicleDriver)
  if (ownerUserUniqueId) {
    whereConditions.push("(vo.userUniqueId = ? OR vd.driverUserUniqueId = ?)");
    params.push(ownerUserUniqueId, ownerUserUniqueId);
  }

  if (driverUserUniqueId) {
    whereConditions.push("vd.driverUserUniqueId = ?");
    params.push(driverUserUniqueId);
  }

  if (licensePlate) {
    whereConditions.push("v.licensePlate LIKE ?");
    params.push(`%${licensePlate}%`);
  }

  if (color) {
    whereConditions.push("v.color = ?");
    params.push(color);
  }

  if (vehicleTypeUniqueId) {
    whereConditions.push("v.vehicleTypeUniqueId = ?");
    params.push(vehicleTypeUniqueId);
  }

  if (search) {
    whereConditions.push("(v.licensePlate LIKE ? OR v.color LIKE ?)");
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam);
  }

  const whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const sql = `
    SELECT 
      v.*,
      vt.vehicleTypeName,
      vt.vehicleTypeDescription,
      MAX(vo.userUniqueId) as ownerUniqueId,
      MAX(vs.VehicleStatusTypeId) as VehicleStatusTypeId
    FROM Vehicle v
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN VehicleOwnership vo ON v.vehicleUniqueId = vo.vehicleUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN VehicleDriver vd ON v.vehicleUniqueId = vd.vehicleUniqueId AND vd.assignmentStatus = 'active' AND vd.assignmentEndDate IS NULL
    LEFT JOIN VehicleStatus vs ON v.vehicleUniqueId = vs.vehicleUniqueId AND vs.statusEndDate IS NULL
    ${whereClause}
    GROUP BY v.vehicleId
    ORDER BY v.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(DISTINCT v.vehicleUniqueId) as total
    FROM Vehicle v
    LEFT JOIN VehicleOwnership vo ON v.vehicleUniqueId = vo.vehicleUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN VehicleDriver vd ON v.vehicleUniqueId = vd.vehicleUniqueId AND vd.assignmentStatus = 'active' AND vd.assignmentEndDate IS NULL
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || pool;
  const [[totalRows]] = await executor.query(countSql, params);
  
  params.push(limitNum, offset);
  const [rows] = await executor.query(sql, params);

  const totalItems = totalRows?.total || 0;
  const totalPages = Math.ceil(totalItems / limitNum) || 1;

  return {
    message: "success",
    data: rows,
    pagination: {
      totalItems,
      totalPages,
      currentPage: pageNum,
      itemsPerPage: limitNum,
    },
  };
};

module.exports = {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicles,
};
