const { pool } = require("../Middleware/Database.config");
const { accountStatus } = require("./Account.service");
const {} = require("./VehicleOwnership.service");
const AppError = require("../Utils/AppError");
const {
  usersRoles,
  USER_STATUS,
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../Utils/ListOfSeedData");
const { transactionStorage } = require("../Utils/TransactionContext");

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
      sortBy = "userCreatedAt", // Sorting field
      sortOrder = "DESC", // Sorting order
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
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
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

    const sortField = validSortFields.includes(sortBy)
      ? sortBy
      : "u.userCreatedAt";
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
    ORDER BY ${
  sortField === "createdAt"
    ? "u.userCreatedAt"
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
    const [data] = await executor.query(dataSql, dataParams);

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
        status: status || USER_STATUS.ACTIVE, // Default active status
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
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
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
          WHEN dr.journeyStatusId = ${journeyStatusMap.cancelledByPassenger} THEN 'Cancelled by passenger'
          WHEN dr.journeyStatusId = ${journeyStatusMap.rejectedByPassenger} THEN 'Rejected by passenger'
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
          totalPages: Math.ceil(total / limit),
        },
        data,
      };
    } catch {
      throw new AppError("Failed to fetch offline drivers", 500);
    }
  },

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
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
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
          WHEN dr.journeyStatusId = ${journeyStatusMap.acceptedByPassenger} THEN 'Accepted by passenger'
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
          totalPages: Math.ceil(total / limit),
        },
        data,
      };
    } catch {
      throw new AppError("Failed to fetch online drivers", 500);
    }
  },

  /**
   * Fetches unauthorized drivers (those with statuses like pending documents, rejected, etc.).
   * Handles complex filtering, searching, and pagination.
   *
   * NOTE (FIXED): Previously, searching with the 'search' parameter would fail if not accompanied 
   * by 'vehicleType' or 'licensePlate' due to missing joins. The joins are now included whenever 
   * 'search' is present.
   *
   * @param {Object} query - The query parameters from the request
   * @param {number} [query.page=1] - Page number for pagination
   * @param {number} [query.limit=10] - Number of records per page
   * @param {string} [query.search] - Full-text search across name, email, phone, plate, and vehicle type
   * @param {string} [query.name] - Filter specifically by full name
   * @param {string} [query.email] - Filter specifically by email
   * @param {string} [query.phone] - Filter specifically by phone number
   * @param {number|number[]} [query.status] - Filter by specific status ID(s)
   * @param {string} [query.vehicleType] - Filter by vehicle type name
   * @param {string} [query.licensePlate] - Filter by license plate
   * @param {string} [query.sortBy] - Field to sort by
   * @param {string} [query.sortOrder] - Sort direction ('ASC' or 'DESC')
   * @returns {Promise<Object>} Paginated result with driver data and document status
   */
  getUnauthorizedDriver: async (query) => {
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
      sortOrder,
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
      params.push(
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
        wildcardSearch,
      );
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
      : "UserRoleStatusCurrent.userRoleStatusId";
    const sortDirection =
      sortOrder && validSortOrders.includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : "DESC";

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
    if (vehicleType || licensePlate || (search && search.trim() !== "")) {
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
        ${
  sortField === "fullName"
    ? "Users.fullName"
    : sortField === "email"
      ? "Users.email"
      : sortField === "phoneNumber"
        ? "Users.phoneNumber"
        : sortField === "createdAt"
          ? "Users.userCreatedAt"
          : sortField === "statusName"
            ? "Statuses.statusName"
            : "UserRoleStatusCurrent.userRoleStatusCreatedAt"
} ${sortDirection}
    LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parseInt(limit), parseInt(offset)];

    const [unauthorizedUsers] = await executor.query(
      dataSql,
      dataParams,
    );

    // Get documents and status for each user using the unified accountStatus service
    const usersWithDocuments = await Promise.all(
      unauthorizedUsers?.map(async (user) => {
        const userUniqueId = user?.userUniqueId;
        const statusResult = await accountStatus({
          ownerUserUniqueId: userUniqueId,
          user: user,
          body: { roleId: user.roleId },
        });
        return {
          ...statusResult,
        };
      }),
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
        status: status || `All except ${USER_STATUS.ACTIVE} (active) and ${USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN} (banned)`, // Show which statuses are included
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
