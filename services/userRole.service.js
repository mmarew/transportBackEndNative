const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");

// Service to create UserRole
const createUserRole = async (body) => {
  const { userUniqueId, roleId } = body;

  // Check if user role already exists to prevent redundancy
  const existingUserRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId },
  });

  if (existingUserRole.length) {
    return { message: "error", error: "User role already exists" };
  }

  const userRoleUniqueId = uuidv4();
  const result = await insertData({
    tableName: "UserRole",
    colAndVal: { userRoleUniqueId, userUniqueId, roleId },
  });

  return { message: "success", data: result };
};

// Service to get UserRole by ID
const getUserRoleByUserUniqueId = async (UserUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "UserRole",
    joins: [
      {
        table: "Users",
        on: "UserRole.userUniqueId = Users.userUniqueId",
      },
      {
        table: "Roles",
        on: "UserRole.roleId = Roles.roleId",
      },
    ],
    conditions: { "Users.userUniqueId": UserUniqueId },
  });

  if (!result.length) {
    return { message: "error", error: "UserRole not found" };
  }

  return { message: "success", data: result[0] };
};

// Service to update UserRole
const updateUserRole = async (id, updateValues) => {
  const result = await updateData({
    tableName: "UserRole",
    conditions: { userRoleId: id },
    updateValues,
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to update UserRole" };
  }

  return { message: "success", data: "UserRole updated successfully" };
};

// Service to delete UserRole
const deleteUserRole = async (id) => {
  const result = await deleteData({
    tableName: "UserRole",
    conditions: { userRoleId: id },
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to delete UserRole" };
  }

  return { message: "success", data: "UserRole deleted successfully" };
};

module.exports = {
  createUserRole,
  getUserRoleByUserUniqueId,
  updateUserRole,
  deleteUserRole,
};
