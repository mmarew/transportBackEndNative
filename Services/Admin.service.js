const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getAttachedDocumentsByUser } = require("./AttachedDocuments.service");
const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const { getVehicle } = require("./Vehicle.service");
const {
  getVehicleAndOwnershipViaUserUniqueId,
} = require("./VehicleOwnership.service");

const adminServices = {
  getAllActiveDrivers: async (req) => {
    const page = parseInt(req.query.page) || 1; // default page = 1
    const limit = parseInt(req.query.limit) || 10; // default limit = 10
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countSql = `
    SELECT COUNT(*) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    WHERE ursc.statusId = 1 AND ur.roleId = 2
  `;
    const [countRows] = await pool.query(countSql);
    const total = countRows[0].total;

    // Fetch paginated records
    const sqlToGetAllActiveDrivers = `
    SELECT 
      u.userUniqueId,
      u.fullName,
      u.phoneNumber,
      u.email,
      ur.userRoleId,
      ur.roleId,
      ursc.statusId,
      ursc.userRoleStatusCreatedAt AS statusCreatedAt
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    WHERE ursc.statusId = 1 AND ur.roleId = 2
    ORDER BY u.createdAt DESC
    LIMIT ? OFFSET ?
  `;

    const [data] = await pool.query(sqlToGetAllActiveDrivers, [limit, offset]);

    return {
      message: "success",
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data,
    };
  },

  searchActiveDrivers: async (query, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const wildcardQuery = `%${query}%`;

    // Count total for pagination
    const countSql = `
      SELECT COUNT(*) AS total
      FROM Users u
      INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
      INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
      WHERE ursc.statusId = 1
        AND ur.roleId = 2
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
    `;
    const [countRows] = await pool.query(countSql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);
    const total = countRows[0].total;

    // Get paginated data
    const sql = `
      SELECT 
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        ur.userRoleId,
        ursc.statusId
      FROM Users u
      INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
      INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
      WHERE ursc.statusId = 1
        AND ur.roleId = 2
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
      ORDER BY u.createdAt DESC
      LIMIT ? OFFSET ?
    `;
    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
      limit,
      offset,
    ]);

    return {
      message: "success",
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data,
    };
  },
  searchOfflineDrivers: async (query, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const wildcardQuery = `%${query}%`;

    // Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT dr.userUniqueId
        FROM DriverRequest dr
        INNER JOIN (
          SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
          FROM DriverRequest
          GROUP BY userUniqueId
        ) latestRequest 
          ON dr.userUniqueId = latestRequest.userUniqueId 
          AND dr.requestTime = latestRequest.latestRequestTime
        INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
        INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
        INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
        WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4)
          AND ursc.statusId = 1
          AND ur.roleId = 2
          AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
      ) as sub
    `;
    const [countRows] = await pool.query(countSql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);
    const total = countRows[0].total;

    // Data
    const sql = `
      SELECT dr.*, u.*, ur.*, ursc.*
      FROM DriverRequest dr
      INNER JOIN (
        SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
        FROM DriverRequest
        GROUP BY userUniqueId
      ) latestRequest 
        ON dr.userUniqueId = latestRequest.userUniqueId 
        AND dr.requestTime = latestRequest.latestRequestTime
      INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
      INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
      INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
      WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4)
        AND ursc.statusId = 1
        AND ur.roleId = 2
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
      ORDER BY dr.requestTime DESC
      LIMIT ? OFFSET ?
    `;
    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
      limit,
      offset,
    ]);

    return {
      message: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data,
    };
  },

  searchOnlineDrivers: async (query, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const wildcardQuery = `%${query}%`;

    // Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM DriverRequest dr
      INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
      WHERE dr.journeyStatusId = 1
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
    `;
    const [countRows] = await pool.query(countSql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);
    const total = countRows[0].total;

    // Data
    const sql = `
      SELECT dr.*, u.*, vo.*, v.*, vt.*
      FROM DriverRequest dr
      INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
      INNER JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
      INNER JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
      INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
      WHERE dr.journeyStatusId = 1
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
      ORDER BY dr.requestTime DESC
      LIMIT ? OFFSET ?
    `;
    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
      limit,
      offset,
    ]);

    return {
      message: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data,
    };
  },

  getOnlineDrivers: async (req) => {
    // driver is online when its journeyStatusId is one in DriverRequest table . also get drivers vehicle details from vehicle table and VehicleOwnership table. vehicle is connected to VehicleTypes table
    const data = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
        {
          table: "VehicleOwnership",
          on: "Users.userUniqueId = VehicleOwnership.userUniqueId",
        },
        {
          table: "Vehicle",
          on: "VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId",
        },
        {
          table: "VehicleTypes",
          on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
        },
      ],
      conditions: {
        "DriverRequest.journeyStatusId": 1,
      },
    });
    return { message: "success", data };
  },

  getUnauthorizedDriver: async () => {
    const sql = `
      SELECT Users.*, UserRole.*, UserRoleStatusCurrent.*, Roles.* ,Statuses.*
      FROM Users JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
      JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId JOIN Roles ON UserRole.roleId = Roles.roleId JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId WHERE UserRoleStatusCurrent.statusId != ? and Roles.roleId =?
    `;
    const [unauthorizedUsers] = await pool.query(sql, [1, 2]);

    const usersWithDocuments = await Promise.all(
      unauthorizedUsers.map(async (user) => {
        const userUniqueId = user.userUniqueId;
        // const documents = await getAttachedDocumentsByUser(userUniqueId);
        const documents = await driversDocumentVehicleRequirement({
          ownerUserUniqueId: userUniqueId,
          user: user,
        });
        // const vehicle = (
        //   await getVehicleAndOwnershipViaUserUniqueId(userUniqueId)
        // )?.data;

        // console.log("getUnauthorizedDriver documents", documents);

        return documents;
      })
    );

    return usersWithDocuments;
  },
  getAllNoOfUnAuthorizedDriver: async () => {
    const sql = `
      SELECT COUNT(*) AS total
      FROM Users JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
      JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId JOIN Roles ON UserRole.roleId = Roles.roleId JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId WHERE UserRoleStatusCurrent.statusId != ? and Roles.roleId =?
    `;
    const [countRows] = await pool.query(sql, [1, 2]);
    return {
      message: "success",
      data: { totalUnAuthorizedDrivers: countRows[0].total },
    };
  },
  searchUnauthorizedDriver: async (query) => {
    const sql = `
    SELECT Users.*, UserRole.*, UserRoleStatusCurrent.*, Roles.*, Statuses.*
    FROM Users
    JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
    JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
    JOIN Roles ON UserRole.roleId = Roles.roleId
    JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    WHERE (Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ?)
      AND UserRoleStatusCurrent.statusId != ? 
      AND Roles.roleId = ?
  `;

    const wildcardQuery = `%${query}%`;
    const [results] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
      1,
      2,
    ]);

    const usersWithDocuments = await Promise.all(
      results.map(async (user) => {
        const documents = await getAttachedDocumentsByUser(user.userUniqueId);
        return { user, documents };
      })
    );
    return { message: "success", data: usersWithDocuments };
  },
};

module.exports = adminServices;
