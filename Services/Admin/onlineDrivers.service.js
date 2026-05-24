"use strict";

const {
  pool
} = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");
const {
  usersRoles,
  USER_STATUS,
  journeyStatusMap,
  activeJourneyStatuses
} = require("../../Utils/ListOfSeedData");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const getOnlineDrivers = async req => {
  const {
    page = 1,
    limit = 10,
    search,
    name,
    email,
    phone,
    vehicleType,
    journeyStatus
  } = req.query;
  const offset = (page - 1) * limit;

  // Base WHERE conditions for online drivers
  const onlineStatusList = activeJourneyStatuses.join(", ");
  let whereClause = `
  WHERE ur.roleId = ${usersRoles.driverRoleId}
  AND ursc.statusId = ${USER_STATUS.ACTIVE}
  AND dr.journeyStatusId IN (${onlineStatusList})
  `;
  const params = [];

  // General search across multiple fields
  if (search && search.trim() !== "") {
    const wildcardSearch = `%${search.trim()}%`;
    whereClause += `
      AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? OR v.licensePlate LIKE ? OR vt.vehicleTypeName LIKE ?)
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

  // Filter by journey status (single or multiple)
  if (journeyStatus) {
    if (Array.isArray(journeyStatus)) {
      // Multiple journey statuses
      const placeholders = journeyStatus.map(() => "?").join(",");
      whereClause += ` AND dr.journeyStatusId IN (${placeholders})`;
      params.push(...journeyStatus);
    } else {
      // Single journey status
      whereClause += ` AND dr.journeyStatusId = ?`;
      params.push(journeyStatus);
    }
  } else {
    // Default to online statuses
    whereClause += ` AND dr.journeyStatusId IN (${activeJourneyStatuses.join(", ")})`;
  }
  try {
    // Count query - get latest request per driver
    const countSql = `
    SELECT COUNT(DISTINCT u.userUniqueId) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = ${usersRoles.driverRoleId}
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = ${USER_STATUS.ACTIVE}
    INNER JOIN (
        SELECT dr1.userUniqueId, dr1.journeyStatusId
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(driverRequestCreatedAt) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.driverRequestCreatedAt = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    `;
    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, params);
    const total = countRows[0]?.total || 0;

    // Data query with comprehensive driver information
    const dataSql = `
    SELECT 
        u.userId,
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.userCreatedAt,
        dr.driverRequestId,
        dr.driverRequestUniqueId,
        dr.journeyStatusId as currentJourneyStatus,
        dr.driverRequestCreatedAt as lastRequestTime,
        dr.originLatitude,
        dr.originLongitude,
        dr.originPlace,
        ur.userRoleId,
        ur.userRoleUniqueId,
        ursc.statusId as userStatusId,
        ursc.userRoleStatusUniqueId,
        v.vehicleId,
        v.vehicleUniqueId,
        v.licensePlate,
        v.color,
        vt.vehicleTypeId,
        vt.vehicleTypeName,
        r.roleName,
        CASE 
          WHEN dr.journeyStatusId = ${journeyStatusMap.waiting} THEN 'Waiting'
          WHEN dr.journeyStatusId = ${journeyStatusMap.requested} THEN 'Requested'
          WHEN dr.journeyStatusId = ${journeyStatusMap.acceptedByDriver} THEN 'Accepted by driver'
          WHEN dr.journeyStatusId = ${journeyStatusMap.acceptedByShipper} THEN 'Accepted by shipper'
          WHEN dr.journeyStatusId = ${journeyStatusMap.journeyStarted} THEN 'Journey started'
          ELSE 'Unknown status'
        END as journeyStatusName
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = ${usersRoles.driverRoleId}
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = ${USER_STATUS.ACTIVE}
    INNER JOIN (
        SELECT dr1.*
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(driverRequestCreatedAt) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.driverRequestCreatedAt = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY dr.driverRequestCreatedAt DESC, u.fullName ASC
    LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, parseInt(limit), parseInt(offset)];
    const [data] = await executor.query(dataSql, dataParams);
    return {
      message: data.length > 0 ? "success" : "No online drivers found",
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      data
    };
  } catch {
    throw new AppError("Failed to fetch online drivers", 500);
  }
};

module.exports = {
  getOnlineDrivers
};
