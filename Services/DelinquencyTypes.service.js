const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

const createDelinquencyType = async (data) => {
  const {
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints,
    defaultSeverity,
    applicableRoles,
  } = data;
  // validations
  if (!delinquencyTypeName) {
    return {
      message: "error",
      error: "Delinquency type name is required",
    };
  }

  if (!applicableRoles) {
    return {
      message: "error",
      error: "Applicable roles is required",
    };
  }

  const delinquencyTypeUniqueId = uuidv4();

  const sql = `
    INSERT INTO DelinquencyTypes (
      delinquencyTypeUniqueId, delinquencyTypeName, delinquencyTypeDescription,
      defaultPoints, defaultSeverity, applicableRoles
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    delinquencyTypeUniqueId,
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints || 1,
    defaultSeverity || "MEDIUM",
    applicableRoles,
  ];

  await query(sql, values);

  return {
    message: "success",
    data: "Delinquency type created successfully",
    delinquencyTypeUniqueId,
  };
};

const getDelinquencyTypes = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    delinquencyTypeName,
    defaultSeverity,
    isActive,
    sortBy = "delinquencyTypeId",
    sortOrder = "DESC",
  } = filters;

  const offset = (page - 1) * limit;

  let whereConditions = ["1 = 1"];
  let queryParams = [];

  if (delinquencyTypeName) {
    whereConditions.push("dt.delinquencyTypeName LIKE ?");
    queryParams.push(`%${delinquencyTypeName}%`);
  }

  if (defaultSeverity) {
    whereConditions.push("dt.defaultSeverity = ?");
    queryParams.push(defaultSeverity);
  }

  if (isActive !== undefined) {
    whereConditions.push("dt.isActive = ?");
    queryParams.push(isActive === "true" ? 1 : 0);
  }

  const baseQuery = `
    SELECT 
      dt.*,
      r.*
    FROM DelinquencyTypes dt
    LEFT JOIN Roles r ON dt.applicableRoles = r.roleUniqueId
    WHERE ${whereConditions.join(" AND ")}
  `;

  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_table`;
  const dataQuery = `
    ${baseQuery}
    ORDER BY dt.${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}
    LIMIT ? OFFSET ?
  `;
  console.log("@createDelinquencyType dataQuery", dataQuery);
  // return;

  const dataQueryParams = [...queryParams, parseInt(limit), offset];

  const [countResult] = await pool.query(countQuery, queryParams);
  const [results] = await pool.query(dataQuery, dataQueryParams);

  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit);

  return {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    filters,
  };
};

const getDelinquencyTypeById = async (delinquencyTypeUniqueId) => {
  const sql = `
    SELECT 
      dt.*,
      r.roleName
    FROM DelinquencyTypes dt
    LEFT JOIN Roles r ON dt.applicableRoles = r.roleUniqueId
    WHERE dt.delinquencyTypeUniqueId = ?
  `;

  const result = await query(sql, [delinquencyTypeUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Delinquency type not found" };
};

const updateDelinquencyType = async (delinquencyTypeUniqueId, data) => {
  const {
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints,
    defaultSeverity,
    applicableRoles,
  } = data;

  const sql = `
    UPDATE DelinquencyTypes 
    SET delinquencyTypeName = ?, delinquencyTypeDescription = ?, 
        defaultPoints = ?, defaultSeverity = ?, applicableRoles = ?
    WHERE delinquencyTypeUniqueId = ?
  `;

  const values = [
    delinquencyTypeName,
    delinquencyTypeDescription,
    defaultPoints,
    defaultSeverity,
    applicableRoles,
    delinquencyTypeUniqueId,
  ];

  const result = await query(sql, values);

  return result.affectedRows > 0
    ? { message: "success", data: "Delinquency type updated successfully" }
    : { message: "error", error: "Failed to update delinquency type" };
};

const deleteDelinquencyType = async (delinquencyTypeUniqueId) => {
  // Check if this type is being used
  const checkSql =
    "SELECT COUNT(*) as count FROM UserDelinquency WHERE delinquencyTypeUniqueId = ?";
  const [checkResult] = await pool.query(checkSql, [delinquencyTypeUniqueId]);

  if (checkResult[0].count > 0) {
    return {
      message: "error",
      error:
        "Cannot delete delinquency type as it is being used in user delinquencies",
    };
  }

  const sql = "DELETE FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ?";
  const result = await query(sql, [delinquencyTypeUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "Delinquency type deleted successfully" }
    : { message: "error", error: "Failed to delete delinquency type" };
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

  const [results] = await pool.query(sql, [roleUniqueId, limit, offset]);
  const [totalCountResult] = await pool.query("SELECT FOUND_ROWS() as total");
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    message: "success",
    data: results,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
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
      [delinquencyTypeUniqueId]
    );
    return {
      message: "success",
      data: `Delinquency type ${
        updated[0].isActive ? "activated" : "deactivated"
      } successfully`,
      isActive: updated[0].isActive,
    };
  }

  return {
    message: "error",
    error: "Failed to toggle delinquency type status",
  };
};

module.exports = {
  createDelinquencyType,
  getDelinquencyTypes,
  getDelinquencyTypeById,
  updateDelinquencyType,
  deleteDelinquencyType,
  getDelinquencyTypesByRole,
  toggleDelinquencyTypeActive,
};
