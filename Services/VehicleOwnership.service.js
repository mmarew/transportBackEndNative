const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  getStatusOfVehicleByVehicleUniqueId,
  createVehicleStatus,
} = require("./VehicleStatus.service");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { usersRoles, VEHICLE_STATUS_TYPES } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");

const createVehicleOwnership = async (body) => {
  const {
    vehicleUniqueId,
    userUniqueId,
    roleId,
    ownershipStartDate,
    ownershipEndDate = null,
    vehicleOwnershipCreatedBy,
    connection = null, // Optional connection for transaction
  } = body;

  if (!vehicleUniqueId || !roleId || !ownershipStartDate) {
    throw new AppError("All fields are required for vehicle ownership", 400);
  }

  // Verify vehicle status
  const statusResult =
    await getStatusOfVehicleByVehicleUniqueId(vehicleUniqueId);

  const statusData = statusResult.data;
  // if there is no status of vehicle registered before create new active status
  if (!statusData) {
    // create new active status of vehicle
    await createVehicleStatus({
      vehicleUniqueId,
      VehicleStatusTypeId: VEHICLE_STATUS_TYPES.ACTIVE,
      vehicleStatusCreatedBy: userUniqueId,
      connection,
    });
  } else if (statusData.VehicleStatusTypeId !== VEHICLE_STATUS_TYPES.ACTIVE) {
    throw new AppError("Vehicle is not active", 400);
  }

  // Check if ownership already exists (using filter function)
  // Note: getVehicleOwnershipsByFilter is complex and might need refactoring too if it's critical for transaction consistency.
  // For now, let's assume the overlap check below covers the most critical part, or we update getVehicleOwnershipsByFilter separately if needed.
  // Assuming getVehicleOwnershipsByFilter doesn't support connection yet, let's skip adding it there for now or update it if strict consistency is needed.
  const existingOwnership = await getVehicleOwnershipsByFilter({
    filters: {
      vehicleUniqueId,
      userUniqueId,
      roleId: usersRoles.vehicleOwnerRoleId,
    },
    // connection, // Pass if supported or needed
  });
  if (existingOwnership.data && existingOwnership.data.length) {
    throw new AppError("Vehicle ownership already exists", 400);
  }

  // validate not by existingOwnership only but also by VehicleOwnership.ownershipEndDate
  // Prevent overlapping/active ownerships for the same vehicle
  const overlapSql = `
    SELECT * FROM VehicleOwnership
    WHERE vehicleUniqueId = ?
      AND (
        ownershipEndDate IS NULL
        OR ownershipEndDate >= ?
      )
    LIMIT 1
  `;
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [overlaps] = await queryExecutor.query(overlapSql, [
    vehicleUniqueId,
    ownershipStartDate,
  ]);
  if (overlaps.length) {
    throw new AppError("Vehicle is already reserved by other user", 400);
  }

  // Create new ownership
  const ownershipUniqueId = uuidv4();
  const result = await insertData({
    tableName: "VehicleOwnership",
    colAndVal: {
      ownershipUniqueId,
      vehicleUniqueId,
      userUniqueId, // Include userUniqueId in the insert
      roleId,
      ownershipStartDate,
      ownershipEndDate,
      vehicleOwnershipCreatedBy, // Added missing field
      vehicleOwnershipCreatedAt: currentDate(),
    },
    connection,
  });

  return { 
    message: "success", 
    data: {
      ownershipUniqueId,
      result
    } 
  };
};

const updateVehicleOwnership = async (body) => {
  const allowedFields = [
    "vehicleUniqueId",
    "userUniqueId",
    "roleId",
    "ownershipStartDate",
    "ownershipEndDate",
  ];
  const ownershipUniqueId = body?.ownershipUniqueId;
  if (!ownershipUniqueId) {
    throw new AppError("ownershipUniqueId is required for update", 400);
  }

  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (body?.[field] !== undefined) {
      if (
        field === "ownershipEndDate" &&
        (body[field] === "" || body[field] === null)
      ) {
        updates.push(`${field} = NULL`);
      } else {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    throw new AppError("No valid fields provided for update", 400);
  }

  values.push(ownershipUniqueId);
  const sql = `UPDATE VehicleOwnership 
               SET ${updates.join(", ")} 
               WHERE ownershipUniqueId = ?`;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Vehicle ownership not found or update failed", 404);
  }

  return {
    message: "success",
    data: null,
  };
};

const deleteVehicleOwnership = async (ownershipUniqueId) => {
  const result = await updateData({
    tableName: "VehicleOwnership",
    conditions: { ownershipUniqueId },
    updateValues: {
      vehicleOwnershipDeletedAt: currentDate(),
    },
  });

  if (result.affectedRows === 0) {
    throw new AppError("Vehicle ownership not found", 404);
  }

  return {
    message: "success",
    data: null,
  };
};

const getVehicleOwnershipsByFilter = async ({
  filters = {},
  page,
  limit,
  includePagination = false,
}) => {
  const parameterMapping = {
    ownershipUniqueId: "ownershipUniqueId",
    ownershipStartDate: "ownershipStartDate",
    ownershipEndDate: "ownershipEndDate",
    vehicleUniqueId: "vehicleUniqueId",
    licensePlate: "licensePlate",
    color: "color",
    vehicleTypeUniqueId: "vehicleTypeUniqueId",
    userUniqueId: "userUniqueId",
    phoneNumber: "phoneNumber",
    email: "email",
    fullName: "fullName",
    roleUniqueId: "roleUniqueId",
    hasOwner: "hasOwner",
    search: "search",
  };

  const where = ["VehicleOwnership.vehicleOwnershipDeletedAt IS NULL"];
  const values = [];

  for (const [paramKey, paramValue] of Object.entries(filters)) {
    if (paramValue !== undefined && paramValue !== "" && paramValue !== null) {
      if (paramKey === "hasOwner") {
        if (
          paramValue === true ||
          paramValue === "true" ||
          paramValue === "1"
        ) {
          where.push("VehicleOwnership.userUniqueId IS NOT NULL");
        } else if (
          paramValue === false ||
          paramValue === "false" ||
          paramValue === "0"
        ) {
          where.push("VehicleOwnership.userUniqueId IS NULL");
        }
      } else if (paramKey === "search") {
        const searchValue = `%${paramValue}%`;
        where.push(`(
          Vehicle.licensePlate LIKE ? OR 
          Vehicle.color LIKE ? OR 
          Users.fullName LIKE ? OR 
          Users.phoneNumber LIKE ? OR
          Users.email LIKE ?
        )`);
        values.push(
          searchValue,
          searchValue,
          searchValue,
          searchValue,
          searchValue,
        );
      } else if (parameterMapping[paramKey]) {
        const dbColumn = parameterMapping[paramKey];
        let tablePrefix = "VehicleOwnership.";

        if (["licensePlate", "color", "vehicleId"].includes(paramKey)) {
          tablePrefix = "Vehicle.";
        } else if (
          ["phoneNumber", "email", "fullName", "userId"].includes(paramKey)
        ) {
          tablePrefix = "Users.";
        } else if (["roleName", "roleUniqueId"].includes(paramKey)) {
          tablePrefix = "Roles.";
        } else if (
          ["vehicleTypeName", "vehicleTypeId", "vehicleTypeUniqueId"].includes(
            paramKey,
          )
        ) {
          tablePrefix = "VehicleTypes.";
        }

        where.push(`${tablePrefix}${dbColumn} = ?`);
        values.push(paramValue);
      }
    }
  }

  let joinClause = `
    LEFT JOIN Users ON Users.userUniqueId = VehicleOwnership.userUniqueId
    LEFT JOIN Vehicle ON Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId
    LEFT JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = Vehicle.vehicleTypeUniqueId
    LEFT JOIN Roles ON Roles.roleId = VehicleOwnership.roleId
  `;

  let paginationClause = "";
  let pagination = undefined;
  if (limit) {
    const pageNum = Math.max(parseInt(page || 1), 1);
    const pageSize = Math.max(parseInt(limit), 1);
    const offset = (pageNum - 1) * pageSize;
    paginationClause = " LIMIT ? OFFSET ?";

    if (includePagination) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM VehicleOwnership
        ${joinClause}
        ${where.length ? " WHERE " + where.join(" AND ") : ""}
      `;
      const executor = transactionStorage.getStore() || pool;
      const [countRows] = await executor.query(countSql, values);
      const total = countRows?.[0]?.total || 0;
      const totalPages = Math.ceil(total / pageSize);
      pagination = {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: pageSize,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      };
    }

    values.push(pageSize, offset);
  }

  const sql = `
    SELECT 
      VehicleOwnership.*,
      Users.userId,
      Users.userUniqueId,
      Users.fullName,
      Users.phoneNumber,
      Users.email,
      Users.userCreatedAt,
      Vehicle.vehicleId,
      Vehicle.vehicleUniqueId,
      Vehicle.licensePlate,
      Vehicle.color,
      Vehicle.vehicleCreatedAt,
      Vehicle.vehicleUpdatedAt,
      VehicleTypes.vehicleTypeId,
      VehicleTypes.vehicleTypeUniqueId,
      VehicleTypes.vehicleTypeName,
      VehicleTypes.vehicleTypeDescription,
      VehicleTypes.carryingCapacity,
      Roles.roleId,
      Roles.roleUniqueId,
      Roles.roleName
    FROM VehicleOwnership 
    ${joinClause}
    ${where.length ? " WHERE " + where.join(" AND ") : ""}
    ORDER BY VehicleOwnership.ownershipStartDate DESC
    ${paginationClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(sql, values);

  const formattedData = rows.map((row) => ({
    ownership: {
      ownershipId: row.ownershipId,
      ownershipUniqueId: row.ownershipUniqueId,
      vehicleUniqueId: row.vehicleUniqueId,
      userUniqueId: row.userUniqueId,
      roleId: row.roleId,
      startDate: row.ownershipStartDate,
      endDate: row.ownershipEndDate,
    },
    owner: row.userUniqueId
      ? {
        userId: row.userId,
        userUniqueId: row.userUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        email: row.email,
        roleName: row.roleName,
        userCreatedAt: row.userCreatedAt,
      }
      : null,
    vehicle: {
      id: row.vehicleId,
      uniqueId: row.vehicleUniqueId,
      licensePlate: row.licensePlate,
      color: row.color,
      vehicleTypeId: row.vehicleTypeId,
      vehicleTypeUniqueId: row.vehicleTypeUniqueId,
      vehicleTypeName: row.vehicleTypeName,
      vehicleTypeDescription: row.vehicleTypeDescription,
      carryingCapacity: row.carryingCapacity,
      createdAt: row.vehicleCreatedAt,
      updatedAt: row.vehicleUpdatedAt,
    },
    role: {
      id: row.roleId,
      uniqueId: row.roleUniqueId,
      name: row.roleName,
    },
  }));

  if (includePagination && limit) {
    return {
      message: "success",
      data: formattedData,
      pagination,
    };
  }
  return { message: "success", data: formattedData };
};

module.exports = {
  createVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getVehicleOwnershipsByFilter,
};
