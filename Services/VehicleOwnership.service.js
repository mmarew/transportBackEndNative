const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  getStatusOfVehicleByVehicleUniqueId,
  createVehicleStatus,
} = require("./VehicleStatus.service");
const { insertData } = require("../CRUD/Create/CreateData");
const { usersRoles } = require("../Utils/ListOfFixedData");

const createVehicleOwnership = async (body) => {
  const {
    vehicleUniqueId,
    userUniqueId,
    roleId,
    ownershipStartDate,
    ownershipEndDate = null,
  } = body;

  if (!vehicleUniqueId || !userUniqueId || !roleId || !ownershipStartDate) {
    return {
      message: "error",
      error: "All fields are required for vehicle ownership",
    };
  }

  // Verify vehicle status
  const statusOfVehicle = await getStatusOfVehicleByVehicleUniqueId(
    vehicleUniqueId
  );

  if (statusOfVehicle.message === "error") return statusOfVehicle;
  console.log("@createVehicleOwnership statusOfVehicle", statusOfVehicle);
  const statusData = statusOfVehicle.data;
  // if there is no status of vehicle registered before create new active status
  if (!statusData) {
    // create new active status of vehicle
    const data = await createVehicleStatus({
      vehicleUniqueId,
      VehicleStatusTypeId: 1,
    });
  } else if (statusData.VehicleStatusTypeId !== 1) {
    return { message: "error", error: "Vehicle is not active" };
  }

  // Check if ownership already exists (using filter function)
  const existingOwnership = await getVehicleOwnershipsByFilter({
    filters: {
      vehicleUniqueId,
      userUniqueId,
      roleId: usersRoles.vehicleOwnerRoleId,
    },
  });
  if (existingOwnership.length) {
    return {
      message: "error",
      error: "Vehicle ownership already exists",
      existingOwnership,
    };
  }
  // validate not by existingOwnership only but also by VehicleOwnership.ownershipEndDate
  // Prevent overlapping/active ownerships for the same vehicle
  // If another ownership has no end date, or its end date is after the new start date, it's overlapping
  const overlapSql = `
    SELECT * FROM VehicleOwnership
    WHERE vehicleUniqueId = ?
      AND (
        ownershipEndDate IS NULL
        OR ownershipEndDate >= ?
      )
    LIMIT 1
  `;
  const [overlaps] = await pool.query(overlapSql, [
    vehicleUniqueId,
    ownershipStartDate,
  ]);
  if (overlaps.length) {
    return {
      overlaps,
      message: "error",
      error: "Vehicle is already reserved by other user",
    };
  }

  // Create new ownership
  const ownershipUniqueId = uuidv4();
  const result = await insertData({
    tableName: "VehicleOwnership",
    colAndVal: {
      ownershipUniqueId,
      vehicleUniqueId,
      userUniqueId,
      roleId,
      ownershipStartDate,
      ownershipEndDate,
    },
  });

  return { message: "success", data: result };
};

// removed granular getters in favor of filter-based retrieval

const updateVehicleOwnership = async (ownershipId, body) => {
  const { vehicleId, userId, roleId, ownershipStartDate, ownershipEndDate } =
    body;
  const sql = `UPDATE VehicleOwnership SET vehicleId = ?, userId = ?, roleId = ?, ownershipStartDate = ?, ownershipEndDate = ? 
               WHERE ownershipId = ?`;
  const values = [
    vehicleId,
    userId,
    roleId,
    ownershipStartDate,
    ownershipEndDate || null,
    ownershipId,
  ];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership updated successfully",
      };
    }
    return { message: "error", data: "Vehicle ownership update failed" };
  } catch (error) {
    console.log("Error updating vehicle ownership:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle ownership update",
    };
  }
};

const deleteVehicleOwnership = async (ownershipId) => {
  const sql = `DELETE FROM VehicleOwnership WHERE ownershipId = ?`;

  try {
    const [result] = await pool.query(sql, [ownershipId]);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership deleted successfully",
      };
    }
    return { message: "error", data: "Vehicle ownership not found" };
  } catch (error) {
    console.log("Error deleting vehicle ownership:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle ownership deletion",
    };
  }
};

// removed getAllVehicleOwnerships in favor of filter-based retrieval
// get vehicle ownerships by filters across all columns
const getVehicleOwnershipsByFilter = async ({
  filters = {},
  page,
  limit,
  includePagination = false,
}) => {
  console.log("@getVehicleOwnershipsByFilter filters", filters);
  try {
    const allowedKeys = [
      "ownershipId",
      "ownershipUniqueId",
      "vehicleUniqueId",
      "Users.userUniqueId",
      "Roles.roleId",
      "ownershipStartDate",
      "ownershipEndDate",
    ];

    const where = [];
    const values = [];

    for (const key of allowedKeys) {
      if (filters[key] !== undefined && filters[key] !== "") {
        where.push(`${key} = ?`);
        values.push(filters[key]);
      }
    }
    console.log("@where", where, "@values", values);

    // Pagination
    let paginationClause = "";
    let pagination = undefined;
    if (limit) {
      const pageNum = Math.max(parseInt(page || 1), 1);
      const pageSize = Math.max(parseInt(limit), 1);
      const offset = (pageNum - 1) * pageSize;
      paginationClause = " LIMIT ? OFFSET ?";
      values.push(pageSize, offset);

      // Count total only when pagination requested and response wants pagination meta
      if (includePagination) {
        const countSql = `SELECT COUNT(*) AS total FROM VehicleOwnership${
          where.length ? " WHERE " + where.join(" AND ") : ""
        }`;
        const [countRows] = await pool.query(
          countSql,
          values.slice(0, values.length - 2)
        );
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
    }

    const sql = `SELECT VehicleOwnership.*, Users.*
      FROM VehicleOwnership 
      JOIN Users ON Users.userUniqueId = VehicleOwnership.userUniqueId
      ${where.length ? " WHERE " + where.join(" AND ") : ""}
      ${paginationClause}`;

    const [rows] = await pool.query(sql, values);
    if (includePagination && limit)
      return { message: "success", data: rows, pagination };
    return rows;
  } catch (error) {
    console.log("Error fetching vehicle ownerships by filter:", error);
    throw error;
  }
};
// removed getVehicleOwnershipByUserUniqueId in favor of filter-based retrieval
module.exports = {
  createVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getVehicleOwnershipsByFilter,
};
