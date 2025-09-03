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
    // get all active drivers means get data from Users UserRole and UserRoleStatusCurrent. here UserRoleStatusCurrent.statusId = 1 and role id must be 2
    const sqlToGetAllActiveDrivers = `SELECT 
    u.*,
    ur.*,
    ursc.*
FROM 
    Users u
INNER JOIN 
    UserRole ur ON u.userUniqueId = ur.userUniqueId
INNER JOIN 
    UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
WHERE 
    ursc.statusId = 1
    AND ur.roleId = 2  `;
    const [data] = await pool.query(sqlToGetAllActiveDrivers);
    return { message: "success", data: data };
  },

  searchActiveDrivers: async (query) => {
    const sql = `
    SELECT 
      u.*,
      ur.*,
      ursc.*
    FROM 
      Users u
    INNER JOIN 
      UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN 
      UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    WHERE 
      ursc.statusId = 1
      AND ur.roleId = 2
      AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  `;

    const wildcardQuery = `%${query}%`; // Add wildcard for LIKE search
    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);
    if (data.length > 0) {
      return { message: "success", data: data };
    } else {
      return { message: "failed", data: data };
    }
  },

  getOfflineDrivers: async (req) => {
    const sqlToGetOfflineDrivers = `SELECT 
    dr.*,
    u.*,
    ur.*,
    ursc.*
FROM 
    DriverRequest dr
INNER JOIN (
    SELECT 
        userUniqueId, 
        MAX(requestTime) AS latestRequestTime 
    FROM 
        DriverRequest 
    GROUP BY 
        userUniqueId
) latestRequest 
    ON dr.userUniqueId = latestRequest.userUniqueId 
    AND dr.requestTime = latestRequest.latestRequestTime
INNER JOIN 
    Users u ON dr.userUniqueId = u.userUniqueId
INNER JOIN 
    UserRole ur ON ur.userUniqueId = u.userUniqueId
INNER JOIN 
    UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
WHERE 
    dr.journeyStatusId NOT IN (1, 2, 3, 4)
    AND ursc.statusId = 1
    AND ur.roleId = 2  `;

    const [data] = await pool.query(sqlToGetOfflineDrivers);
    return { message: "success", data: data };
  },

  searchOfflineDrivers: async (query) => {
    const sql = `
    SELECT 
      dr.*,
      u.*,
      ur.*,
      ursc.*
    FROM 
      DriverRequest dr
    INNER JOIN (
      SELECT 
          userUniqueId, 
          MAX(requestTime) AS latestRequestTime 
      FROM 
          DriverRequest 
      GROUP BY 
          userUniqueId
    ) latestRequest 
      ON dr.userUniqueId = latestRequest.userUniqueId 
      AND dr.requestTime = latestRequest.latestRequestTime
    INNER JOIN 
      Users u ON dr.userUniqueId = u.userUniqueId
    INNER JOIN 
      UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN 
      UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    WHERE 
      dr.journeyStatusId NOT IN (1, 2, 3, 4)
      AND ursc.statusId = 1
      AND ur.roleId = 2
      AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  `;

    const wildcardQuery = `%${query}%`; // Add wildcard for LIKE search
    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);
    return { message: "success", data: data };
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

  searchOnlineDrivers: async (query) => {
    const wildcardQuery = `%${query}%`; // Prepare the wildcard query for LIKE search

    const sql = `
    SELECT 
      dr.*,
      u.*,
      vo.*,
      v.*,
      vt.*
    FROM 
      DriverRequest dr
    INNER JOIN 
      Users u ON dr.userUniqueId = u.userUniqueId
    INNER JOIN 
      VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
    INNER JOIN 
      Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    INNER JOIN 
      VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    WHERE 
      dr.journeyStatusId = 1
      AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  `;

    const [data] = await pool.query(sql, [
      wildcardQuery,
      wildcardQuery,
      wildcardQuery,
    ]);

    if (data.length > 0) {
      return { message: "success", data: data };
    } else {
      return { message: "failed", data: data };
    }
  },

  // Fetch unauthorized drivers
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
