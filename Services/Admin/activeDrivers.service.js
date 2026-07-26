"use strict";

const {
  pool
} = require("../../Middleware/Database.config");



const {
  usersRoles,
  USER_STATUS,
  
  
} = require("../../Utils/ListOfSeedData");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const getAllActiveDrivers = async req => {
  const {
    page = 1,
    limit = 10,
    search,
    // General search across multiple fields
    name,
    // Filter by driver name
    email,
    // Filter by email
    phone,
    // Filter by phone number
    vehicleType,
    // Filter by vehicle type
    licensePlate,
    // Filter by license plate
    status,
    // Filter by specific status
    sortBy = "userCreatedAt",
    // Sorting field
    sortOrder = "DESC" // Sorting order
  } = req.query;
  const offset = (page - 1) * limit;

  // Base WHERE conditions for active drivers
  let whereClause = `
    WHERE ursc.statusId = ${USER_STATUS.ACTIVE}
    AND ur.roleId = ${usersRoles.driverRoleId}
    `;
  const params = [];

  // General search across multiple fields
  if (search && search.trim() !== "") {
    const wildcardSearch = `%${search.trim()}%`;
    whereClause += `
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? 
             OR v.licensePlate LIKE ? OR vt.vehicleTypeName LIKE ?)
        `;
    params.push(wildcardSearch, wildcardSearch, wildcardSearch, wildcardSearch, wildcardSearch);
  }

  // Filter by driver name
  if (name && name.trim() !== "") {
    const wildcardName = `%${name.trim()}%`;
    whereClause += ` AND u.fullName LIKE ?`;
    params.push(wildcardName);
  }

  // Filter by email
  if (email && email.trim() !== "") {
    const wildcardEmail = `%${email.trim()}%`;
    whereClause += ` AND u.email LIKE ?`;
    params.push(wildcardEmail);
  }

  // Filter by phone number
  if (phone && phone.trim() !== "") {
    const wildcardPhone = `%${phone.trim()}%`;
    whereClause += ` AND u.phoneNumber LIKE ?`;
    params.push(wildcardPhone);
  }

  // Filter by vehicle type
  if (vehicleType && vehicleType.trim() !== "") {
    const wildcardVehicleType = `%${vehicleType.trim()}%`;
    whereClause += ` AND vt.vehicleTypeName LIKE ?`;
    params.push(wildcardVehicleType);
  }

  // Filter by license plate
  if (licensePlate && licensePlate.trim() !== "") {
    const wildcardLicensePlate = `%${licensePlate.trim()}%`;
    whereClause += ` AND v.licensePlate LIKE ?`;
    params.push(wildcardLicensePlate);
  }

  // Filter by status (if you want to allow filtering by different statuses)
  if (status && status.trim() !== "") {
    whereClause += ` AND ursc.statusId = ?`;
    params.push(parseInt(status));
  }

  // Validate and set sorting
  const validSortFields = ["createdAt", "fullName", "email", "phoneNumber", "licensePlate", "vehicleTypeName", "statusCreatedAt"];
  const validSortOrders = ["ASC", "DESC"];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "u.userCreatedAt";
  const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "DESC";

  // Count query
  const countSql = `
    SELECT COUNT(DISTINCT u.userUniqueId) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    `;
  const executor = transactionStorage.getStore() || pool;
  const [countRows] = await executor.query(countSql, params);
  const total = countRows[0].total;

  // Data query with comprehensive driver information
  const dataSql = `
    SELECT 
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.userCreatedAt,
        ur.userRoleId,
        ur.roleId,
        ursc.statusId,
        ursc.userRoleStatusCreatedAt AS statusCreatedAt,
        v.vehicleUniqueId,
        v.licensePlate,
        v.color,
        vt.vehicleTypeName,
        vt.vehicleTypeDescription,
        vo.ownershipUniqueId,
        vo.ownershipStartDate,
        vo.ownershipEndDate,
        r.roleName
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY ${sortField === "createdAt" ? "u.userCreatedAt" : sortField === "fullName" ? "u.fullName" : sortField === "email" ? "u.email" : sortField === "phoneNumber" ? "u.phoneNumber" : sortField === "licensePlate" ? "v.licensePlate" : sortField === "vehicleTypeName" ? "vt.vehicleTypeName" : "ursc.userRoleStatusCreatedAt"} ${sortDirection}
    LIMIT ? OFFSET ?
    `;
  const dataParams = [...params, parseInt(limit), parseInt(offset)];
  const [data] = await executor.query(dataSql, dataParams);
  return {
    message: "Active drivers list fetched",
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    },
    data,
    filters: {
      search,
      name,
      email,
      phone,
      vehicleType,
      licensePlate,
      status: status || USER_STATUS.ACTIVE,
      // Default active status
      sortBy: sortField,
      sortOrder: sortDirection
    }
  };
};

module.exports = {
  getAllActiveDrivers
};
