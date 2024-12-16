const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getAttachedDocumentsByUser } = require("./AttachedDocuments.service");

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

  getOnlineDrivers: async (req) => {
    // driver is online when its journeyStatusId is one in DriverRequest table . also get drivers vehicle detailes from vehicle table and VehicleOwnership table. vehicle is connected to VehicleTypes table
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
    return { messsage: "success", data };
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
        const documents = await getAttachedDocumentsByUser(user.userUniqueId);
        return { user, documents };
      })
    );

    return usersWithDocuments;
  },
};

module.exports = adminServices;
