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

const getOfflineDrivers = async req => {
  const {
    page = 1,
    limit = 10,
    search,
    name,
    email,
    phone,
    vehicleType
  } = req.query;
  const offset = (page - 1) * limit;

  // FIXED: Include drivers with NULL journeyStatus OR status NOT IN online statuses
  const activeStatusList = activeJourneyStatuses.join(", ");
  let whereClause = `
  WHERE ur.roleId = ${usersRoles.driverRoleId}
  AND ursc.statusId = ${USER_STATUS.ACTIVE}
  AND (dr.journeyStatusId IS NULL OR dr.journeyStatusId NOT IN (${activeStatusList}))
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
  try {
    // Count query
    const countSql = `
    SELECT COUNT(DISTINCT u.userUniqueId) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = ${usersRoles.driverRoleId}
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = ${USER_STATUS.ACTIVE}
    LEFT JOIN (
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

    // Data query
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
          WHEN dr.journeyStatusId IS NULL THEN 'No recent requests'
          WHEN dr.journeyStatusId = ${journeyStatusMap.journeyCompleted} THEN 'Completed'
          WHEN dr.journeyStatusId = ${journeyStatusMap.cancelledByShipper} THEN 'Cancelled by shipper'
          WHEN dr.journeyStatusId = ${journeyStatusMap.rejectedByShipper} THEN 'Rejected by shipper'
          WHEN dr.journeyStatusId = ${journeyStatusMap.cancelledByDriver} THEN 'Cancelled by driver'
          WHEN dr.journeyStatusId = ${journeyStatusMap.cancelledByAdmin} THEN 'Cancelled by admin'
          WHEN dr.journeyStatusId = ${journeyStatusMap.completedByAdmin} THEN 'Completed by admin'
          WHEN dr.journeyStatusId = ${journeyStatusMap.cancelledBySystem} THEN 'Cancelled by system'
          WHEN dr.journeyStatusId = ${journeyStatusMap.noAnswerFromDriver} THEN 'No answer from driver'
          WHEN dr.journeyStatusId = ${journeyStatusMap.notSelectedInBid} THEN 'Not selected in bid'
          ELSE 'Unknown status'
        END as journeyStatusName
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = ${usersRoles.driverRoleId}
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = ${USER_STATUS.ACTIVE}
    LEFT JOIN (
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
      message: data.length > 0 ? "success" : "No offline drivers found",
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      data
    };
  } catch {
    throw new AppError("Failed to fetch offline drivers", AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  getOfflineDrivers
};
