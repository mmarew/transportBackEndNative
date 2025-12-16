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

  if (!vehicleUniqueId || !roleId || !ownershipStartDate) {
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
      roleId,
      ownershipStartDate,
      ownershipEndDate,
    },
  });

  return { message: "success", data: result };
};

// removed granular getters in favor of filter-based retrieval
const updateVehicleOwnership = async (body) => {
  try {
    // Define allowed fields for update
    const allowedFields = [
      "vehicleUniqueId",
      "userUniqueId",
      "roleId",
      "ownershipStartDate",
      "ownershipEndDate",
    ];
    const ownershipUniqueId = body?.ownershipUniqueId;
    // Filter only allowed fields that have values
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (body?.[field] !== undefined) {
        // Handle null/empty string for ownershipEndDate
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

    // If no valid fields to update, return error
    if (updates.length === 0) {
      return {
        message: "error",
        data: "No valid fields provided for update",
      };
    }

    // Add ownershipId to values for WHERE clause
    values.push(ownershipUniqueId);

    // Build the SQL query
    const sql = `UPDATE VehicleOwnership 
                 SET ${updates.join(", ")} 
                 WHERE ownershipUniqueId = ?`;

    // Execute the update
    const [result] = await pool.query(sql, values);

    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership updated successfully",
      };
    }

    return {
      message: "error",
      data: "Vehicle ownership not found or update failed",
    };
  } catch (error) {
    console.log("Error updating vehicle ownership:", error);

    // Handle specific database errors
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return {
        message: "error",
        data: "Referenced user or vehicle does not exist",
      };
    }

    if (error.code === "ER_DUP_ENTRY") {
      return {
        message: "error",
        data: "Duplicate entry violation",
      };
    }

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

const getVehicleOwnershipsByFilter = async ({
  filters = {},
  page,
  limit,
  includePagination = false,
}) => {
  console.log("@getVehicleOwnershipsByFilter filters", filters);
  try {
    // Define which parameters are allowed and map them to database columns
    const parameterMapping = {
      // Ownership parameters
      ownershipId: "ownershipId",
      ownershipUniqueId: "ownershipUniqueId",
      ownershipStartDate: "ownershipStartDate",
      ownershipEndDate: "ownershipEndDate",

      // Vehicle parameters
      vehicleId: "vehicleId",
      vehicleUniqueId: "vehicleUniqueId",
      licensePlate: "licensePlate",
      color: "color",
      vehicleTypeId: "vehicleTypeId",
      vehicleTypeName: "vehicleTypeName",
      vehicleTypeUniqueId: "vehicleTypeUniqueId",

      // User parameters
      userId: "userId",
      userUniqueId: "userUniqueId",
      phoneNumber: "phoneNumber",
      email: "email",
      fullName: "fullName",

      // Role parameters
      roleId: "roleId",
      roleUniqueId: "roleUniqueId",
      roleName: "roleName",

      // Custom parameters (will be handled specially)
      hasOwner: "hasOwner", // true/false for whether owner exists
      search: "search", // general search across multiple fields
    };

    const where = [];
    const values = [];

    // Build WHERE clause
    for (const [paramKey, paramValue] of Object.entries(filters)) {
      if (
        paramValue !== undefined &&
        paramValue !== "" &&
        paramValue !== null
      ) {
        if (paramKey === "hasOwner") {
          // Handle owner existence filter
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
          // Handle general search across multiple fields
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
            searchValue
          );
        } else if (parameterMapping[paramKey]) {
          // Handle regular filters
          const dbColumn = parameterMapping[paramKey];

          // Determine which table this column belongs to
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
            [
              "vehicleTypeName",
              "vehicleTypeId",
              "vehicleTypeUniqueId",
            ].includes(paramKey)
          ) {
            tablePrefix = "VehicleTypes.";
          }

          where.push(`${tablePrefix}${dbColumn} = ?`);
          values.push(paramValue);
        }
      }
    }

    console.log("@where", where, "@values", values);

    // Use LEFT JOIN to include all ownerships
    let joinClause = `
      LEFT JOIN Users ON Users.userUniqueId = VehicleOwnership.userUniqueId
      LEFT JOIN Vehicle ON Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId
      LEFT JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = Vehicle.vehicleTypeUniqueId
      LEFT JOIN Roles ON Roles.roleId = VehicleOwnership.roleId
    `;

    // Pagination
    let paginationClause = "";
    let pagination = undefined;
    if (limit) {
      const pageNum = Math.max(parseInt(page || 1), 1);
      const pageSize = Math.max(parseInt(limit), 1);
      const offset = (pageNum - 1) * pageSize;
      paginationClause = " LIMIT ? OFFSET ?";

      // Count total only when pagination requested
      if (includePagination) {
        const countSql = `
          SELECT COUNT(*) AS total 
          FROM VehicleOwnership
          ${joinClause}
          ${where.length ? " WHERE " + where.join(" AND ") : ""}
        `;
        const countValues = values.slice(0, values.length);
        console.log("@countSql", countSql, "@countValues", countValues);

        const [countRows] = await pool.query(countSql, countValues);
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

    // Build main query without AS aliases
    const sql = `
      SELECT 
        VehicleOwnership.*,
        Users.userId,
        Users.userUniqueId,
        Users.fullName,
        Users.phoneNumber,
        Users.email,
        Users.createdAt,
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

    console.log("@sql", sql, "@values", values);

    const [rows] = await pool.query(sql, values);

    // Format the response with cleaner property names
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
            createdAt: row.createdAt,
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
    return formattedData;
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
