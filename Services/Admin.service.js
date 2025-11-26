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
      search,
      name,
      email,
      phone,
      vehicleType,
    } = req.query;

    const offset = (page - 1) * limit;

    // FIXED: Include drivers with NULL journeyStatus OR status NOT IN online statuses
    let whereClause = `
  WHERE ur.roleId = 2
  AND ursc.statusId = 1
  AND (dr.journeyStatusId IS NULL OR dr.journeyStatusId NOT IN (1, 2, 3, 4, 5))
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

    try {
      // Count query
      const countSql = `
    SELECT COUNT(DISTINCT u.userUniqueId) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = 2
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = 1
    LEFT JOIN (
        SELECT dr1.userUniqueId, dr1.journeyStatusId
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.requestTime = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    `;

      const [countRows] = await pool.query(countSql, params);
      const total = countRows[0]?.total || 0;
      console.log("Total offline drivers found:", total);

      // Data query
      const dataSql = `
    SELECT 
        u.userId,
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.createdAt,
        dr.driverRequestId,
        dr.driverRequestUniqueId,
        dr.journeyStatusId as currentJourneyStatus,
        dr.requestTime as lastRequestTime,
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
          WHEN dr.journeyStatusId = 6 THEN 'Completed'
          WHEN dr.journeyStatusId = 7 THEN 'Cancelled by passenger'
          WHEN dr.journeyStatusId = 8 THEN 'Rejected by passenger'
          WHEN dr.journeyStatusId = 9 THEN 'Cancelled by driver'
          WHEN dr.journeyStatusId = 10 THEN 'Cancelled by admin'
          WHEN dr.journeyStatusId = 11 THEN 'Completed by admin'
          WHEN dr.journeyStatusId = 12 THEN 'Cancelled by system'
          WHEN dr.journeyStatusId = 13 THEN 'No answer from driver'
          ELSE 'Unknown status'
        END as journeyStatusName
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = 2
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = 1
    LEFT JOIN (
        SELECT dr1.*
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.requestTime = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY dr.requestTime DESC, u.fullName ASC
    LIMIT ? OFFSET ?
    `;

      const dataParams = [...params, parseInt(limit), parseInt(offset)];
      const [data] = await pool.query(dataSql, dataParams);

      console.log("Found offline drivers:", data.length);
      console.log(
        "Sample driver statuses:",
        data.map((d) => ({
          name: d.fullName,
          journeyStatus: d.currentJourneyStatus,
          statusName: d.journeyStatusName,
        }))
      );

      return {
        message: data.length > 0 ? "success" : "No offline drivers found",
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
        data,
      };
    } catch (error) {
      console.error("Error in getOfflineDrivers:", error);
      return {
        message: "error",
        error: error.message,
        data: [],
      };
    }
  },

  // getOnlineDrivers: async (req) => {
  //   const {
  //     page = 1,
  //     limit = 10,
  //     search, // General search across multiple fields
  //     name, // Filter by driver name
  //     email, // Filter by email
  //     phone, // Filter by phone number
  //     vehicleType, // Filter by vehicle type
  //     journeyStatus, // Filter by journey status
  //     status, // Additional status filter if needed
  //   } = req.query;

  //   const offset = (page - 1) * limit;

  //   // Base WHERE conditions
  //   let whereClause = `
  //   WHERE dr.journeyStatusId IN (1, 2, 3, 4, 5)
  //   AND r.roleId = 2
  //   `;

  //   const params = [];

  //   // General search across multiple fields
  //   if (search && search.trim() !== "") {
  //     const wildcardSearch = `%${search.trim()}%`;
  //     whereClause += `
  //       AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ? OR vt.vehicleTypeName LIKE ?)
  //       `;
  //     params.push(
  //       wildcardSearch,
  //       wildcardSearch,
  //       wildcardSearch,
  //       wildcardSearch
  //     );
  //   }

  //   // Filter by driver name
  //   if (name && name.trim() !== "") {
  //     const wildcardName = `%${name.trim()}%`;
  //     whereClause += ` AND u.fullName LIKE ?`;
  //     params.push(wildcardName);
  //   }

  //   // Filter by email
  //   if (email && email.trim() !== "") {
  //     const wildcardEmail = `%${email.trim()}%`;
  //     whereClause += ` AND u.email LIKE ?`;
  //     params.push(wildcardEmail);
  //   }

  //   // Filter by phone number
  //   if (phone && phone.trim() !== "") {
  //     const wildcardPhone = `%${phone.trim()}%`;
  //     whereClause += ` AND u.phoneNumber LIKE ?`;
  //     params.push(wildcardPhone);
  //   }

  //   // Filter by vehicle type
  //   if (vehicleType && vehicleType.trim() !== "") {
  //     const wildcardVehicleType = `%${vehicleType.trim()}%`;
  //     whereClause += ` AND vt.vehicleTypeName LIKE ?`;
  //     params.push(wildcardVehicleType);
  //   }

  //   // Filter by journey status (single or multiple)
  //   if (journeyStatus) {
  //     if (Array.isArray(journeyStatus)) {
  //       // Multiple journey statuses
  //       const placeholders = journeyStatus.map(() => "?").join(",");
  //       whereClause += ` AND dr.journeyStatusId IN (${placeholders})`;
  //       params.push(...journeyStatus);
  //     } else {
  //       // Single journey status
  //       whereClause += ` AND dr.journeyStatusId = ?`;
  //       params.push(journeyStatus);
  //     }
  //   }

  //   // Additional status filter (if you have other status fields)
  //   if (status && status.trim() !== "") {
  //     whereClause += ` AND dr.status = ?`;
  //     params.push(status.trim());
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
  //   `;

  //   const [countRows] = await pool.query(countSql, params);
  //   const total = countRows[0].total;

  //   // Data query
  //   const dataSql = `
  //   SELECT
  //       dr.*,
  //       u.*,
  //       vo.*,
  //       v.*,
  //       vt.*,
  //       r.roleName
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
  //   `;

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
  getOnlineDrivers: async (req) => {
    const {
      page = 1,
      limit = 10,
      search,
      name,
      email,
      phone,
      vehicleType,
      journeyStatus,
    } = req.query;

    const offset = (page - 1) * limit;

    // Base WHERE conditions for online drivers
    let whereClause = `
  WHERE ur.roleId = 2
  AND ursc.statusId = 1
  AND dr.journeyStatusId IN (1, 2, 3, 4, 5)
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
      whereClause += ` AND dr.journeyStatusId IN (1, 2, 3, 4, 5)`;
    }

    try {
      // Count query - get latest request per driver
      const countSql = `
    SELECT COUNT(DISTINCT u.userUniqueId) AS total
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = 2
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = 1
    INNER JOIN (
        SELECT dr1.userUniqueId, dr1.journeyStatusId
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.requestTime = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    `;

      const [countRows] = await pool.query(countSql, params);
      const total = countRows[0]?.total || 0;
      console.log("Total online drivers found:", total);

      // Data query with comprehensive driver information
      const dataSql = `
    SELECT 
        u.userId,
        u.userUniqueId,
        u.fullName,
        u.phoneNumber,
        u.email,
        u.createdAt,
        dr.driverRequestId,
        dr.driverRequestUniqueId,
        dr.journeyStatusId as currentJourneyStatus,
        dr.requestTime as lastRequestTime,
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
          WHEN dr.journeyStatusId = 1 THEN 'Waiting'
          WHEN dr.journeyStatusId = 2 THEN 'Requested'
          WHEN dr.journeyStatusId = 3 THEN 'Accepted by driver'
          WHEN dr.journeyStatusId = 4 THEN 'Accepted by passenger'
          WHEN dr.journeyStatusId = 5 THEN 'Journey started'
          ELSE 'Unknown status'
        END as journeyStatusName
    FROM Users u
    INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId AND ur.roleId = 2
    INNER JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId AND ursc.statusId = 1
    INNER JOIN (
        SELECT dr1.*
        FROM DriverRequest dr1
        INNER JOIN (
            SELECT userUniqueId, MAX(requestTime) AS latestRequestTime
            FROM DriverRequest
            GROUP BY userUniqueId
        ) latest ON dr1.userUniqueId = latest.userUniqueId AND dr1.requestTime = latest.latestRequestTime
    ) dr ON u.userUniqueId = dr.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    LEFT JOIN VehicleOwnership vo ON u.userUniqueId = vo.userUniqueId AND vo.ownershipEndDate IS NULL
    LEFT JOIN Vehicle v ON vo.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${whereClause}
    ORDER BY dr.requestTime DESC, u.fullName ASC
    LIMIT ? OFFSET ?
    `;

      const dataParams = [...params, parseInt(limit), parseInt(offset)];
      const [data] = await pool.query(dataSql, dataParams);

      console.log("Found online drivers:", data.length);

      return {
        message: data.length > 0 ? "success" : "No online drivers found",
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
        data,
      };
    } catch (error) {
      console.error("Error in getOnlineDrivers:", error);
      return {
        message: "error",
        error: error.message,
        data: [],
      };
    }
  },
  getUnauthorizedDriver: async (query) => {
    const {
      page = 1,
      limit = 10,
      search, // General search
      name, // Filter by driver name
      email, // Filter by email
      phone, // Filter by phone number
      status, // Filter by specific status (excluding 1 and 6 by default)
      vehicleType, // Filter by vehicle type
      licensePlate, // Filter by license plate
      sortBy = "userRoleStatusCreatedAt", // Sorting field
      sortOrder = "DESC", // Sorting order
    } = query;

    const offset = (page - 1) * limit;

    // Base WHERE conditions for unauthorized drivers (excluding status 1 and 6, role 2)
    let whereClause = `
    WHERE UserRoleStatusCurrent.statusId NOT IN (1, 6) 
    AND Roles.roleId = 2
    `;

    const params = [];

    // General search across multiple fields
    if (search && search.trim() !== "") {
      const wildcardSearch = `%${search.trim()}%`;
      whereClause += `
        AND (Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ? 
             OR Vehicle.licensePlate LIKE ? OR VehicleTypes.vehicleTypeName LIKE ?)
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
      whereClause += ` AND Users.fullName LIKE ?`;
      params.push(wildcardName);
    }

    // Filter by email
    if (email && email.trim() !== "") {
      const wildcardEmail = `%${email.trim()}%`;
      whereClause += ` AND Users.email LIKE ?`;
      params.push(wildcardEmail);
    }

    // Filter by phone number
    if (phone && phone.trim() !== "") {
      const wildcardPhone = `%${phone.trim()}%`;
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
    const validSortFields = [
      "userRoleStatusCreatedAt",
      "fullName",
      "email",
      "phoneNumber",
      "createdAt",
      "statusName",
    ];
    const validSortOrders = ["ASC", "DESC"];

    const sortField = validSortFields.includes(sortBy)
      ? sortBy
      : "userRoleStatusCreatedAt";
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : "DESC";

    // Count query for pagination
    const countSql = `
    SELECT COUNT(DISTINCT Users.userUniqueId) AS total
    FROM Users 
    JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
    JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId 
    JOIN Roles ON UserRole.roleId = Roles.roleId 
    JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    LEFT JOIN VehicleOwnership ON Users.userUniqueId = VehicleOwnership.userUniqueId
    LEFT JOIN Vehicle ON VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId
    LEFT JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
    ${whereClause}
    `;

    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);
    const currentPage = parseInt(page);

    // Calculate pagination metadata
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    // Main data query with comprehensive joins
    const dataSql = `
    SELECT 
        Users.*, 
        UserRole.*, 
        UserRoleStatusCurrent.*, 
        Roles.*,
        Statuses.*,
        Vehicle.vehicleUniqueId,
        Vehicle.licensePlate,
        Vehicle.color,
        VehicleTypes.vehicleTypeName,
        VehicleTypes.vehicleTypeDescription,
        VehicleOwnership.ownershipUniqueId,
        VehicleOwnership.ownershipStartDate,
        VehicleOwnership.ownershipEndDate
    FROM Users 
    JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
    JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId 
    JOIN Roles ON UserRole.roleId = Roles.roleId 
    JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    LEFT JOIN VehicleOwnership ON Users.userUniqueId = VehicleOwnership.userUniqueId
    LEFT JOIN Vehicle ON VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId
    LEFT JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
    ${whereClause}
    GROUP BY Users.userUniqueId
    ORDER BY 
        ${
          sortField === "fullName"
            ? "Users.fullName"
            : sortField === "email"
            ? "Users.email"
            : sortField === "phoneNumber"
            ? "Users.phoneNumber"
            : sortField === "createdAt"
            ? "Users.createdAt"
            : sortField === "statusName"
            ? "Statuses.statusName"
            : "UserRoleStatusCurrent.userRoleStatusCreatedAt"
        } ${sortDirection}
    LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parseInt(limit), parseInt(offset)];
    const [unauthorizedUsers] = await pool.query(dataSql, dataParams);

    // Get documents for each user
    const usersWithDocuments = await Promise.all(
      unauthorizedUsers.map(async (user) => {
        const userUniqueId = user.userUniqueId;
        const documents = await driversDocumentVehicleRequirement({
          ownerUserUniqueId: userUniqueId,
          user: user,
        });

        return {
          ...user,
          documents: documents.data || documents, // Handle different response formats
        };
      })
    );

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
        previousPage: hasPrevious ? currentPage - 1 : null,
      },
      filters: {
        search,
        name,
        email,
        phone,
        status: status || "All except 1 and 6", // Show which statuses are included
        vehicleType,
        licensePlate,
        sortBy: sortField,
        sortOrder: sortDirection,
      },
      data: usersWithDocuments,
    };
  },
};

module.exports = adminServices;
