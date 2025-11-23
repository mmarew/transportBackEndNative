const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const {} = require("./VehicleOwnership.service");

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
  // getOfflineDrivers: async (req) => {
  //   const page = parseInt(req.query.page) || 1; // default page = 1
  //   const limit = parseInt(req.query.limit) || 10; // default limit = 10
  //   const offset = (page - 1) * limit;

  //   // Get total count for pagination
  //   const countSql = `
  //   SELECT COUNT(*) AS total
  //   FROM (
  //     SELECT dr.userUniqueId
  //     FROM DriverRequest dr
  //     INNER JOIN (
  //       SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
  //       FROM DriverRequest
  //       GROUP BY userUniqueId
  //     ) latestRequest
  //       ON dr.userUniqueId = latestRequest.userUniqueId
  //       AND dr.requestTime = latestRequest.latestRequestTime
  //     INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //     INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
  //     INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
  //     WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4,5)
  //       AND ursc.statusId = 1
  //       AND ur.roleId = 2
  //   ) as sub
  // `;
  //   const [countRows] = await pool.query(countSql);
  //   const total = countRows[0].total;

  //   // Fetch paginated records
  //   const sqlToGetOfflineDrivers = `
  //   SELECT dr.*, u.*, ur.*, ursc.*
  //   FROM DriverRequest dr
  //   INNER JOIN (
  //     SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
  //     FROM DriverRequest
  //     GROUP BY userUniqueId
  //   ) latestRequest
  //     ON dr.userUniqueId = latestRequest.userUniqueId
  //     AND dr.requestTime = latestRequest.latestRequestTime
  //   INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //   INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
  //   INNER JOIN UserRoleStatusCurrent ursc ON ursc .userRoleId = ur.userRoleId
  //   WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4,5)
  //     AND ursc.statusId = 1
  //     AND ur.roleId = 2
  //   ORDER BY dr.requestTime DESC
  //   LIMIT ? OFFSET ?
  // `;

  //   const [data] = await pool.query(sqlToGetOfflineDrivers, [limit, offset]);

  //   return {
  //     message: "success",
  //     pagination: {
  //       total,
  //       page,
  //       limit,
  //       totalPages: Math.ceil(total / limit),
  //     },
  //     data,
  //   };
  // },

  // searchOfflineDrivers: async (query, page = 1, limit = 10) => {
  //   const offset = (page - 1) * limit;
  //   const wildcardQuery = `%${query}%`;

  //   // Count
  //   const countSql = `
  //     SELECT COUNT(*) AS total
  //     FROM (
  //       SELECT dr.userUniqueId
  //       FROM DriverRequest dr
  //       INNER JOIN (
  //         SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
  //         FROM DriverRequest
  //         GROUP BY userUniqueId
  //       ) latestRequest
  //         ON dr.userUniqueId = latestRequest.userUniqueId
  //         AND dr.requestTime = latestRequest.latestRequestTime
  //       INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //       INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
  //       INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
  //       WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4,5)
  //         AND ursc.statusId = 1
  //         AND ur.roleId = 2
  //         AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  //     ) as sub
  //   `;
  //   const [countRows] = await pool.query(countSql, [
  //     wildcardQuery,
  //     wildcardQuery,
  //     wildcardQuery,
  //   ]);
  //   const total = countRows[0].total;

  //   // Data
  //   const sql = `
  //     SELECT dr.*, u.*, ur.*, ursc.*
  //     FROM DriverRequest dr
  //     INNER JOIN (
  //       SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
  //       FROM DriverRequest
  //       GROUP BY userUniqueId
  //     ) latestRequest
  //       ON dr.userUniqueId = latestRequest.userUniqueId
  //       AND dr.requestTime = latestRequest.latestRequestTime
  //     INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //     INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
  //     INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
  //     WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4)
  //       AND ursc.statusId = 1
  //       AND ur.roleId = 2
  //       AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  //     ORDER BY dr.requestTime DESC
  //     LIMIT ? OFFSET ?
  //   `;
  //   const [data] = await pool.query(sql, [
  //     wildcardQuery,
  //     wildcardQuery,
  //     wildcardQuery,
  //     limit,
  //     offset,
  //   ]);

  //   return {
  //     message: "success",
  //     pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  //     data,
  //   };
  // },

  // getOnlineDrivers: async (req) => {
  //   const { query, page = 1, limit = 10 } = req.query;
  //   const offset = (page - 1) * limit;

  //   // Base WHERE conditions
  //   let whereClause = `
  //   WHERE dr.journeyStatusId IN (1, 2, 3, 4, 5)
  //   AND r.roleId = 2
  // `;

  //   const params = [];

  //   // Add search conditions if query exists
  //   if (query && query.trim() !== "") {
  //     const wildcardQuery = `%${query.trim()}%`;
  //     whereClause += `
  //     AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)
  //   `;
  //     params.push(wildcardQuery, wildcardQuery, wildcardQuery);
  //   }

  //   // Count query
  //   const countSql = `
  //   SELECT COUNT(*) AS total
  //   FROM DriverRequest dr
  //   INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //   INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
  //   INNER JOIN Roles r ON ur.roleId = r.roleId
  //   INNER JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
  //   INNER JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
  //   INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
  //   ${whereClause}
  // `;

  //   const [countRows] = await pool.query(countSql, params);
  //   const total = countRows[0].total;

  //   // Data query
  //   const dataSql = `
  //   SELECT
  //     dr.*,
  //     u.*,
  //     vo.*,
  //     v.*,
  //     vt.*,
  //     r.roleName
  //   FROM DriverRequest dr
  //   INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
  //   INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
  //   INNER JOIN Roles r ON ur.roleId = r.roleId
  //   INNER JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
  //   INNER JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
  //   INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
  //   ${whereClause}
  //   ORDER BY dr.requestTime DESC
  //   LIMIT ? OFFSET ?
  // `;

  //   const dataParams = [...params, parseInt(limit), parseInt(offset)];
  //   const [data] = await pool.query(dataSql, dataParams);

  //   return {
  //     message: "success",
  //     pagination: {
  //       total,
  //       page: parseInt(page),
  //       limit: parseInt(limit),
  //       totalPages: Math.ceil(total / limit),
  //     },
  //     data,
  //   };
  // },

  getOfflineDrivers: async (req) => {
    const {
      page = 1,
      limit = 10,
      search, // General search across multiple fields
      name, // Filter by driver name
      email, // Filter by email
      phone, // Filter by phone number
      vehicleType, // Filter by vehicle type
      journeyStatus, // Filter by journey status (excluded statuses)
      status, // Additional status filter
    } = req.query;

    const offset = (page - 1) * limit;

    // Base WHERE conditions for offline drivers
    let whereClause = `
    WHERE dr.journeyStatusId NOT IN (1, 2, 3, 4, 5)
    AND ursc.statusId = 1
    AND ur.roleId = 2
    `;

    const params = [];

    // General search across multiple fields
    if (search && search.trim() !== "") {
      const wildcardSearch = `%${search.trim()}%`;
      whereClause += `
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? OR v.licensePlate LIKE ? OR vt.vehicleTypeName LIKE ?)
        `;
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch
      );
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

    // Filter by journey status (if you want to customize excluded statuses)
    if (journeyStatus) {
      if (Array.isArray(journeyStatus)) {
        // Multiple journey statuses to exclude
        const placeholders = journeyStatus.map(() => "?").join(",");
        whereClause += ` AND dr.journeyStatusId NOT IN (${placeholders})`;
        params.push(...journeyStatus);
      } else {
        // Single journey status to exclude
        whereClause += ` AND dr.journeyStatusId != ?`;
        params.push(journeyStatus);
      }
    } else {
      // Default excluded statuses (1,2,3,4,5) - online statuses
      whereClause += ` AND dr.journeyStatusId NOT IN (1, 2, 3, 4, 5)`;
    }

    // Additional status filter
    if (status && status.trim() !== "") {
      whereClause += ` AND ursc.statusId = ?`;
      params.push(status.trim());
    }

    // Count query
    const countSql = `
    SELECT COUNT(*) AS total
    FROM (
        SELECT DISTINCT dr.userUniqueId
        FROM DriverRequest dr
        INNER JOIN (
            SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latestRequest ON dr.userUniqueId = latestRequest.userUniqueId AND dr.requestTime = latestRequest.latestRequestTime
        INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
        INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
        INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
        LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
        LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
        LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
        ${whereClause}
    ) as sub
    `;

    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    // Data query with comprehensive driver information
    const dataSql = `
    SELECT 
        dr.*, 
        u.*, 
        ur.*, 
        ursc.*,
        vo.*,
        v.*,
        vt.*,
        r.roleName
    FROM DriverRequest dr
    INNER JOIN (
        SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
        FROM DriverRequest
        GROUP BY userUniqueId
    ) latestRequest ON dr.userUniqueId = latestRequest.userUniqueId AND dr.requestTime = latestRequest.latestRequestTime
    INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
    INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY dr.requestTime DESC
    LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parseInt(limit), parseInt(offset)];
    const [data] = await pool.query(dataSql, dataParams);

    return {
      message: "success",
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      data,
      filters: {
        search,
        name,
        email,
        phone,
        vehicleType,
        journeyStatus: journeyStatus || [1, 2, 3, 4, 5], // Show which statuses are excluded
        status,
      },
    };
  },

  getOnlineDrivers: async (req) => {
    const {
      page = 1,
      limit = 10,
      search, // General search across multiple fields
      name, // Filter by driver name
      email, // Filter by email
      phone, // Filter by phone number
      vehicleType, // Filter by vehicle type
      journeyStatus, // Filter by journey status
      status, // Additional status filter if needed
    } = req.query;

    const offset = (page - 1) * limit;

    // Base WHERE conditions
    let whereClause = `
    WHERE dr.journeyStatusId IN (1, 2, 3, 4, 5)
    AND r.roleId = 2
    `;

    const params = [];

    // General search across multiple fields
    if (search && search.trim() !== "") {
      const wildcardSearch = `%${search.trim()}%`;
      whereClause += `
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? OR vt.vehicleTypeName LIKE ?)
        `;
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch
      );
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
    }

    // Additional status filter (if you have other status fields)
    if (status && status.trim() !== "") {
      whereClause += ` AND dr.status = ?`;
      params.push(status.trim());
    }

    // Count query
    const countSql = `
    SELECT COUNT(*) AS total
    FROM DriverRequest dr
    INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
    INNER JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    `;

    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    // Data query
    const dataSql = `
    SELECT 
        dr.*, 
        u.*, 
        vo.*, 
        v.*, 
        vt.*,
        r.roleName
    FROM DriverRequest dr
    INNER JOIN Users u ON dr.userUniqueId = u.userUniqueId
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId
    INNER JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY dr.requestTime DESC
    LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parseInt(limit), parseInt(offset)];
    const [data] = await pool.query(dataSql, dataParams);

    return {
      message: "success",
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
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
        { table: "UserRole", on: "Users.userUniqueId = UserRole.userUniqueId" },
        { table: "Roles", on: "UserRole.roleId = Roles.roleId" },
      ],
      conditions: {
        "DriverRequest.journeyStatusId": [1, 2, 3, 4, 5],
        "Roles.roleId": 2,
      },
    });
    return { message: "success", data };
  },

  getUnauthorizedDriver: async () => {
    const sql = `
      SELECT Users.*, UserRole.*, UserRoleStatusCurrent.*, Roles.* ,Statuses.*
      FROM Users JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
      JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId JOIN Roles ON UserRole.roleId = Roles.roleId JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId WHERE UserRoleStatusCurrent.statusId != ? and  UserRoleStatusCurrent.statusId != ? and Roles.roleId =?
    `;
    // 6 is a status code to banned driver, 1  is a status code to active driver, 2 is a role code to driver user
    const [unauthorizedUsers] = await pool.query(sql, [1, 6, 2]);

    const usersWithDocuments = await Promise.all(
      unauthorizedUsers.map(async (user) => {
        const userUniqueId = user.userUniqueId;
        // const documents = await getAttachedDocumentsByUser(userUniqueId);
        const documents = await driversDocumentVehicleRequirement({
          ownerUserUniqueId: userUniqueId,
          user: user,
        });

        return documents;
      })
    );

    return {
      message: "success",
      data: usersWithDocuments,
    };
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
    WHERE UserRoleStatusCurrent.statusId NOT IN (?, ?)
      AND Roles.roleId = ?
      ORDER BY Users.createdAt DESC
      LIMIT ? OFFSET ?
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
      unauthorizedUsers.map(async (user) =>
        driversDocumentVehicleRequirement({
          ownerUserUniqueId: user.userUniqueId,
          user,
        })
      )
    );
    return { message: "success", data: usersWithDocuments };
  },
};

module.exports = adminServices;
