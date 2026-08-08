const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
const { PAGINATION } = require("../Utils/Constants");

const query = async (sql, values = []) => {
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  return result;
};

const createDelinquencyType = async (data) => {
  const {
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints,
    defaultSeverity,
    applicableRoles,
    user,
  } = data;
  const userUniqueId = user?.userUniqueId;
  // validations
  if (!delinquencyTypeName) {
    throw new AppError("Delinquency type name is required", AppError.BAD_REQUEST);
  }

  if (!applicableRoles) {
    throw new AppError("Applicable roles is required", AppError.BAD_REQUEST);
  }

  // resolve applicableRoles to roleUniqueId if a role name is provided
  let applicableRoleUniqueId = applicableRoles;
  const uuidLike =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  const executor = transactionStorage.getStore() || pool;

  if (!uuidLike.test(applicableRoles)) {
    const [roleRows] = await executor.query(
      "SELECT roleUniqueId FROM Roles WHERE LOWER(roleName) = LOWER(?) LIMIT 1",
      [applicableRoles],
    );
    if (roleRows.length === 0) {
      throw new AppError(
        "Invalid applicableRoles: role not found. Provide a valid role name or roleUniqueId",
        AppError.BAD_REQUEST,
      );
    }
    applicableRoleUniqueId = roleRows[0].roleUniqueId;
  }

  // idempotent existence check to avoid duplicate inserts
  // If schema enforces uniqueness on name only, name check is sufficient.
  // If later extended to (name, applicableRoles), the WHERE includes both.
  const [existing] = await executor.query(
    `SELECT delinquencyTypeUniqueId FROM DelinquencyTypes 
     WHERE delinquencyTypeName = ?`,
    [delinquencyTypeName],
  );
  if (existing.length > 0) {
    return {
      message: "Delinquency type already exists",
      data: null,
      delinquencyTypeUniqueId: existing[0].delinquencyTypeUniqueId,
      existed: true,
    };
  }

  const delinquencyTypeUniqueId = uuidv4();

  const sql = `
    INSERT INTO DelinquencyTypes (
      delinquencyTypeUniqueId, delinquencyTypeName, delinquencyTypeDescription,
      defaultPoints, defaultSeverity, applicableRoles, delinquencyTypeCreatedAt,
      delinquencyTypeCreatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    delinquencyTypeUniqueId,
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints || 1,
    defaultSeverity || "MEDIUM",
    applicableRoleUniqueId,
    currentDate(),
    userUniqueId || null,
  ];

  await query(sql, values);

  return {
    message: "Delinquency type created successfully",
    data: null,
    delinquencyTypeUniqueId,
  };
};
const getDelinquencyTypes = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.delinquencyTypeUniqueId) {
    clauses.push("dt.delinquencyTypeUniqueId = ?");
    params.push(filters.delinquencyTypeUniqueId);
  }

  if (filters.delinquencyTypeName) {
    clauses.push("dt.delinquencyTypeName LIKE ?");
    params.push(`%${String(filters.delinquencyTypeName).trim()}%`);
  }

  if (filters.delinquencyTypeDescription) {
    clauses.push("dt.delinquencyTypeDescription LIKE ?");
    params.push(`%${String(filters.delinquencyTypeDescription).trim()}%`);
  }

  if (filters.defaultSeverity) {
    clauses.push("dt.defaultSeverity = ?");
    params.push(filters.defaultSeverity);
  }

  if (filters.applicableRoles) {
    clauses.push("dt.applicableRoles = ?");
    params.push(filters.applicableRoles);
  }

  if (filters.isActive !== undefined) {
    clauses.push("dt.isActive = ?");
    params.push(
      filters.isActive === true || filters.isActive === "true" ? 1 : 0,
    );
  }

  if (filters.createdAt) {
    clauses.push("DATE(dt.delinquencyTypeCreatedAt) = DATE(?)");
    params.push(filters.createdAt);
  }

  const whereClause = clauses.length ? clauses.join(" AND ") : "1 = 1";

  const sortableMap = {
    delinquencyTypeUniqueId: "dt.delinquencyTypeUniqueId",
    delinquencyTypeName: "dt.delinquencyTypeName",
    defaultPoints: "dt.defaultPoints",
    defaultSeverity: "dt.defaultSeverity",
    isActive: "dt.isActive",
    createdAt: "dt.delinquencyTypeCreatedAt",
  };
  const safeSortBy =
    sortableMap[filters.sortBy] || "dt.delinquencyTypeCreatedAt";
  const safeSortOrder =
    String(filters.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const dataSql = `
    SELECT 
      dt.delinquencyTypeUniqueId,
      dt.delinquencyTypeName,
      dt.delinquencyTypeDescription,
      dt.defaultPoints,
      dt.defaultSeverity,
      dt.applicableRoles,
      dt.isActive,
      dt.delinquencyTypeCreatedAt,
      r.roleName
    FROM DelinquencyTypes dt
    LEFT JOIN Roles r ON dt.applicableRoles = r.roleUniqueId
    WHERE ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM DelinquencyTypes dt
    WHERE ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  if (!rows || rows.length === 0) {
    return {
      message: "No delinquency types found",
      data: [],
      pagination: {
        currentPage: page,
        limit,
        totalItems: 0,
        totalPages: 0,
      },
    };
  }

  return {
    message: "Delinquency types fetched successfully",
    data: rows,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const updateDelinquencyType = async (delinquencyTypeUniqueId, data) => {
  try {
    const userUniqueId = data.user?.userUniqueId;
    const { applicableRoles } = data;
    logger.debug(
      "updateDelinquencyType ~ applicableRoles:",
      applicableRoles,
    );

    let applicableRoleUniqueId = applicableRoles;
    const executor = transactionStorage.getStore() || pool;

    const [existing] = await executor.query(
      "SELECT delinquencyTypeUniqueId FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ?",
      [delinquencyTypeUniqueId],
    );
    if (!existing || existing.length === 0) {
      throw new AppError("Delinquency type not found", AppError.NOT_FOUND);
    }

    // Resolve applicableRoles (if provided) before building SET clause
    if (applicableRoles !== undefined) {
      const uuidLike =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (uuidLike.test(applicableRoles)) {
        const [roleRows] = await executor.query(
          "SELECT roleUniqueId FROM Roles WHERE roleUniqueId = ? LIMIT 1",
          [applicableRoles],
        );
        if (roleRows.length === 0) {
          throw new AppError(
            "Invalid applicableRoles: role not found. Provide a valid role name or roleUniqueId",
            AppError.BAD_REQUEST,
          );
        }
        applicableRoleUniqueId = roleRows[0].roleUniqueId;
      } else {
        const [roleRows] = await executor.query(
          "SELECT roleUniqueId FROM Roles WHERE LOWER(roleName) = LOWER(?) LIMIT 1",
          [applicableRoles],
        );
        if (roleRows.length === 0) {
          throw new AppError(
            "Invalid applicableRoles: role not found. Provide a valid role name or roleUniqueId",
            AppError.BAD_REQUEST,
          );
        }
        applicableRoleUniqueId = roleRows?.[0].roleUniqueId;
      }
    }

    const setParts = [];
    const values = [];

    if (data.delinquencyTypeName !== undefined) {
      setParts.push("delinquencyTypeName = ?");
      values.push(data.delinquencyTypeName);
    }

    if (data.delinquencyTypeDescription !== undefined) {
      setParts.push("delinquencyTypeDescription = ?");
      values.push(data.delinquencyTypeDescription);
    }

    if (data.defaultPoints !== undefined) {
      setParts.push("defaultPoints = ?");
      values.push(data.defaultPoints);
    }

    if (data.defaultSeverity !== undefined) {
      setParts.push("defaultSeverity = ?");
      values.push(data.defaultSeverity);
    }

    if (applicableRoles !== undefined) {
      setParts.push("applicableRoles = ?");
      values.push(applicableRoleUniqueId);
    }

    if (setParts.length === 0) {
      throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
    }

    // Add audit columns
    setParts.push("delinquencyTypeUpdatedBy = ?");
    values.push(userUniqueId);
    setParts.push("delinquencyTypeUpdatedAt = ?");
    values.push(currentDate());

    const sql = `UPDATE DelinquencyTypes SET ${setParts.join(", ")} WHERE delinquencyTypeUniqueId = ?`;
    values.push(delinquencyTypeUniqueId);

    const result = await query(sql, values);

    if (result.affectedRows > 0) {
      return {
        message: "Delinquency type updated successfully",
        data: null,
      };
    } else {
      throw new AppError("Delinquency type update failed", AppError.INTERNAL_SERVER_ERROR);
    }
  } catch (error) {
    logger.debug("updateDelinquencyType ~ error:", error);
    logger.error("error on update delinquency types error", error);
  }
};

const deleteDelinquencyType = async (delinquencyTypeUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const executor = transactionStorage.getStore() || pool;

  const [existing] = await executor.query(
    "SELECT delinquencyTypeUniqueId FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ?",
    [delinquencyTypeUniqueId],
  );
  if (!existing || existing.length === 0) {
    throw new AppError("Delinquency type not found", AppError.NOT_FOUND);
  }

  const checkSql =
    "SELECT COUNT(*) as count FROM UserDelinquency WHERE delinquencyTypeUniqueId = ?";
  const [checkResult] = await executor.query(checkSql, [
    delinquencyTypeUniqueId,
  ]);

  if (checkResult[0].count > 0) {
    return {
      message: "Delinquency type is in use — delete skipped",
      data: null,
    };
  }

  const sql = `UPDATE DelinquencyTypes SET delinquencyTypeDeletedAt = ?, delinquencyTypeDeletedBy = ? WHERE delinquencyTypeUniqueId = ?`;
  const result = await query(sql, [
    currentDate(),
    userUniqueId,
    delinquencyTypeUniqueId,
  ]);

  if (result.affectedRows > 0) {
    return {
      message: "Delinquency type deleted successfully",
      data: null,
    };
  } else {
    throw new AppError("Delinquency type delete failed", AppError.INTERNAL_SERVER_ERROR);
  }
};

const getDelinquencyTypesByRole = async (roleUniqueId, pagination = {}) => {
  const { page = 1, limit = 10 } = pagination;
  const offset = (page - 1) * limit;

  const sql = `
    SELECT SQL_CALC_FOUND_ROWS 
      dt.*,
      r.roleName
    FROM DelinquencyTypes dt
    LEFT JOIN Roles r ON dt.applicableRoles = r.roleUniqueId
    WHERE dt.applicableRoles = ? AND dt.isActive = TRUE
    ORDER BY dt.delinquencyTypeName ASC
    LIMIT ? OFFSET ?
  `;

  const executor = transactionStorage.getStore() || pool;
  const [results] = await executor.query(sql, [roleUniqueId, limit, offset]);
  const [totalCountResult] = await executor.query(
    "SELECT FOUND_ROWS() as total",
  );
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    message: "Delinquency types fetched successfully",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: totalCount,
      limit: parseInt(limit),
    },
  };
};

const toggleDelinquencyTypeActive = async (delinquencyTypeUniqueId) => {
  const sql = `
    UPDATE DelinquencyTypes 
    SET isActive = NOT isActive 
    WHERE delinquencyTypeUniqueId = ?
  `;

  const result = await query(sql, [delinquencyTypeUniqueId]);

  if (result.affectedRows > 0) {
    // Get updated status
    const [updated] = await query(
      "SELECT isActive FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ?",
      [delinquencyTypeUniqueId],
    );
    return {
      message: `Delinquency type ${
        updated[0].isActive ? "activated" : "deactivated"
      } successfully`,
      data: null,
      isActive: updated[0].isActive,
    };
  }

  throw new AppError("Failed to toggle delinquency type status", AppError.INTERNAL_SERVER_ERROR);
};

module.exports = {
  createDelinquencyType,
  getDelinquencyTypes,
  updateDelinquencyType,
  deleteDelinquencyType,
  getDelinquencyTypesByRole,
  toggleDelinquencyTypeActive,
};
