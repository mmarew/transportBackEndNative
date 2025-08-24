const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
// Service to create UserRole
const createUserRole = async (body, user) => {
  const { userUniqueId, roleId } = body;
  if (!userUniqueId || !roleId) {
    return { message: "error", error: "Missing required fields" };
  }
  // Check if user role already exists to prevent redundancy
  const existingUserRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId },
  });

  if (existingUserRole.length) {
    return { message: "error", error: "User role already exists" };
  }

  const userRoleUniqueId = uuidv4();
  const userRoleCreatedBy = user.userUniqueId;
  const userRoleCreatedAt = currentDate();
  const result = await insertData({
    tableName: "UserRole",
    colAndVal: {
      userRoleUniqueId,
      userUniqueId,
      roleId,
      userRoleCreatedBy,
      userRoleCreatedAt,
    },
  });

  return { message: "success", data: "User role created successfully" };
};
const getUserRoleListByUserUniqueId = async (userUniqueId) => {
  const sql = `SELECT * FROM UserRole WHERE userUniqueId = ?`;
  const [rows] = await pool.query(sql, [userUniqueId]);
  return { message: "success", data: rows };
};
// Service to get UserRole by ID

// Service to update UserRole
const updateUserRole = async (userRoleUniqueId, updateValues) => {
  const result = await updateData({
    tableName: "UserRole",
    conditions: { userRoleUniqueId },
    updateValues,
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to update UserRole" };
  }

  return { message: "success", data: "UserRole updated successfully" };
};

// Service to delete UserRole
const deleteUserRole = async (userRoleUniqueId) => {
  const result = await deleteData({
    tableName: "UserRole",
    conditions: { userRoleUniqueId },
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to delete UserRole" };
  }

  return { message: "success", data: "UserRole deleted successfully" };
};

module.exports = {
  getUserRoleListByUserUniqueId,
  createUserRole,
  updateUserRole,
  deleteUserRole,
};
