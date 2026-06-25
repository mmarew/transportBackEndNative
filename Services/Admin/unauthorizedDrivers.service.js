"use strict";

const {
  pool
} = require("../../Middleware/Database.config");
const {
  accountStatus
} = require("../Account");


const {
  usersRoles,
  USER_STATUS,
  
  
} = require("../../Utils/ListOfSeedData");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const getUnauthorizedDriver = async query => {
  const {
    page = 1,
    limit = 10,
    search,
    name,
    email,
    phone,
    status,
    vehicleType,
    licensePlate,
    sortBy,
    sortOrder
  } = query;
  const offset = (page - 1) * limit;

  // Base WHERE conditions for unauthorized drivers (excluding active and banned, role driver)
  let whereClause = `
    WHERE UserRoleStatusCurrent.statusId NOT IN (${USER_STATUS.ACTIVE}, ${USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN})
    AND Roles.roleId = ${usersRoles.driverRoleId}
    AND Users.isDeleted = FALSE
    `;
  const params = [];

  // General search across multiple fields
  if (search && search.trim() !== "") {
    const wildcardSearch = `%${search.trim()}%`;
    whereClause += `
        AND (Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ? 
             OR Vehicle.licensePlate LIKE ? OR VehicleTypes.vehicleTypeName LIKE ?)
        `;
    params.push(wildcardSearch, wildcardSearch, wildcardSearch, wildcardSearch, wildcardSearch);
  }

  // Filter by driver name
  if (name && name?.trim() !== "") {
    const wildcardName = `%${name?.trim()}%`;
    whereClause += ` AND Users.fullName LIKE ?`;
    params.push(wildcardName);
  }

  // Filter by email
  if (email && email?.trim() !== "") {
    const wildcardEmail = `%${email?.trim()}%`;
    whereClause += ` AND Users.email LIKE ?`;
    params.push(wildcardEmail);
  }

  // Filter by phone number
  if (phone && phone?.trim() !== "") {
    const wildcardPhone = `%${phone?.trim()}%`;
    whereClause += ` AND Users.phoneNumber LIKE ?`;
    params.push(wildcardPhone);
  }

  // Filter by specific status (if provided, override default exclusion)
  if (status) {
    if (Array.isArray(status)) {
      const placeholders = status.map(() => "?").join(",");
      whereClause += ` AND UserRoleStatusCurrent.statusId IN (${placeholders})`;
      params.push(...status);
    } else {
      whereClause += ` AND UserRoleStatusCurrent.statusId = ?`;
      params.push(status);
    }
  }

  // Filter by vehicle type
  if (vehicleType && vehicleType.trim() !== "") {
    const wildcardVehicleType = `%${vehicleType.trim()}%`;
    whereClause += ` AND VehicleTypes.vehicleTypeName LIKE ?`;
    params.push(wildcardVehicleType);
  }

  // Filter by license plate
  if (licensePlate && licensePlate.trim() !== "") {
    const wildcardLicensePlate = `%${licensePlate.trim()}%`;
    whereClause += ` AND Vehicle.licensePlate LIKE ?`;
    params.push(wildcardLicensePlate);
  }

  // Validate sorting parameters
  const validSortFields = ["userRoleStatusCreatedAt", "fullName", "email", "phoneNumber", "createdAt", "statusName"];
  const validSortOrders = ["ASC", "DESC"];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "UserRoleStatusCurrent.userRoleStatusId";
  const sortDirection = sortOrder && validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "DESC";

  // Build JOINs conditionally based on filters
  let joins = `
    JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId 
      AND UserRole.userRoleDeletedAt IS NULL
    JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
    JOIN Roles ON UserRole.roleId = Roles.roleId 
      AND Roles.roleDeletedAt IS NULL
    JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    `;

  // Add vehicle-related JOINs only if vehicle filters or search are provided
  if (vehicleType || licensePlate || search && search.trim() !== "") {
    joins += `
    LEFT JOIN VehicleDriver ON Users.userUniqueId = VehicleDriver.driverUserUniqueId 
      AND VehicleDriver.assignmentStatus = 'active'
      AND VehicleDriver.assignmentEndDate IS NULL
    LEFT JOIN Vehicle ON VehicleDriver.vehicleUniqueId = Vehicle.vehicleUniqueId
      AND Vehicle.vehicleDeletedAt IS NULL
    LEFT JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      AND VehicleTypes.vehicleTypeDeletedAt IS NULL
      `;
  }

  // Count query for pagination
  const countSql = `
    SELECT COUNT(DISTINCT Users.userUniqueId) AS total
    FROM Users
    ${joins}
    ${whereClause}
    `;
  const executor = transactionStorage.getStore() || pool;
  const [countRows] = await executor.query(countSql, params);
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const currentPage = parseInt(page);

  // Calculate pagination metadata
  const hasNext = currentPage < totalPages;
  const hasPrevious = currentPage > 1;

  // Main data query - Optimized to fetch only mandatory fields for filtering/sorting
  const dataSql = `
    SELECT 
        Users.userId, Users.userUniqueId, Users.fullName, Users.phoneNumber, Users.email, Users.userCreatedAt,
        UserRole.userRoleId, UserRole.roleId,
        UserRoleStatusCurrent.userRoleStatusId, UserRoleStatusCurrent.userRoleStatusUniqueId, 
        UserRoleStatusCurrent.statusId, UserRoleStatusCurrent.userRoleStatusCreatedAt,
        Statuses.statusName
    FROM Users
    ${joins}
    ${whereClause}
    GROUP BY 
        Users.userUniqueId,
        UserRole.userRoleId,
        UserRoleStatusCurrent.userRoleStatusId
    ORDER BY 
        ${sortField === "fullName" ? "Users.fullName" : sortField === "email" ? "Users.email" : sortField === "phoneNumber" ? "Users.phoneNumber" : sortField === "createdAt" ? "Users.userCreatedAt" : sortField === "statusName" ? "Statuses.statusName" : "UserRoleStatusCurrent.userRoleStatusCreatedAt"} ${sortDirection}
    LIMIT ? OFFSET ?
    `;
  const dataParams = [...params, parseInt(limit), parseInt(offset)];
  const [unauthorizedUsers] = await executor.query(dataSql, dataParams);

  // Get documents and status for each user using the unified accountStatus service
  const usersWithDocuments = await Promise.all(unauthorizedUsers?.map(async user => {
    const userUniqueId = user?.userUniqueId;
    const statusResult = await accountStatus({
      ownerUserUniqueId: userUniqueId,
      user: user,
      body: {
        roleId: user.roleId
      }
    });
    return {
      ...statusResult
    };
  }));
  return {
    message: "success",
    pagination: {
      total,
      page: currentPage,
      limit: parseInt(limit),
      totalPages,
      hasNext,
      hasPrevious,
      nextPage: hasNext ? currentPage + 1 : null,
      previousPage: hasPrevious ? currentPage - 1 : null
    },
    filters: {
      search,
      name,
      email,
      phone,
      status: status || `All except ${USER_STATUS.ACTIVE} (active) and ${USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN} (banned)`,
      // Show which statuses are included
      vehicleType,
      licensePlate,
      sortBy: sortField,
      sortOrder: sortDirection
    },
    // Filter out users who self-healed to ACTIVE or were dynamically BANNED during the check
    data: usersWithDocuments.filter(u => u.status !== USER_STATUS.ACTIVE && u.status !== USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN)
  };
};

module.exports = {
  getUnauthorizedDriver
};
