const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const {} = require("./VehicleOwnership.service");

const adminServices = {
  getAllActiveDrivers: async (req) => {
    const {
      page = 1,
      limit = 10,
      search, // General search across multiple fields
      name, // Filter by driver name
      email, // Filter by email
      phone, // Filter by phone number
      vehicleType, // Filter by vehicle type
      licensePlate, // Filter by license plate
      status, // Filter by specific status
      sortBy = "createdAt", // Sorting field
      sortOrder = "DESC", // Sorting order
    } = req.query;

    const offset = (page - 1) * limit;

    // Base WHERE conditions for active drivers
    let whereClause = `
    WHERE ursc.statusId = 1 
    AND ur.roleId = 2
    `;

    const params = [];

    // General search across multiple fields
    if (search && search.trim() !== "") {
      const wildcardSearch = `%${search.trim()}%`;
      whereClause += `
        AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? 
             OR v.licensePlate LIKE ? OR vt.vehicleTypeName LIKE ?)
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
    const validSortFields = [
      "createdAt",
      "fullName",
      "email",
      "phoneNumber",
      "licensePlate",
      "vehicleTypeName",
      "statusCreatedAt",
    ];
    const validSortOrders = ["ASC", "DESC"];

    const sortField = validSortFields.includes(sortBy) ? sortBy : "u.createdAt";
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

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

    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    // Data query with comprehensive driver information
    const dataSql = `
    SELECT 
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.createdAt,
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
    ORDER BY ${
      sortField === "createdAt"
        ? "u.createdAt"
        : sortField === "fullName"
        ? "u.fullName"
        : sortField === "email"
        ? "u.email"
        : sortField === "phoneNumber"
        ? "u.phoneNumber"
        : sortField === "licensePlate"
        ? "v.licensePlate"
        : sortField === "vehicleTypeName"
        ? "vt.vehicleTypeName"
        : "ursc.userRoleStatusCreatedAt"
    } ${sortDirection}
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
        licensePlate,
        status: status || 1, // Default active status
        sortBy: sortField,
        sortOrder: sortDirection,
      },
    };
  },
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
};

module.exports = adminServices;
