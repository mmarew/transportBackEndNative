// const { getData, insertData, updateData, deleteData } = require("../");

const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");

// Service to create UserStatus
const createUserStatus = async (body) => {
  const { userUniqueId, statusId } = body;

  // Check if user status already exists to prevent redundancy
  const existingUserStatus = await getData({
    tableName: "UserStatuses",
    conditions: { userUniqueId, statusId },
  });

  if (existingUserStatus.length) {
    return { message: "error", error: "UserStatus already exists" };
  }

  const userStatusUniqueId = uuidv4();
  const result = await insertData({
    tableName: "UserStatuses",
    colAndVal: { userStatusUniqueId, userUniqueId, statusId },
  });

  return { message: "success", data: result };
};

// Service to get UserStatus by ID
const getUserStatusById = async (id) => {
  const result = await getData({
    tableName: "UserStatuses",
    conditions: { userStatusId: id },
  });

  if (!result.length) {
    return { message: "error", error: "UserStatus not found" };
  }

  return { message: "success", data: result[0] };
};

// Service to update UserStatus
const updateUserStatus = async (id, updateValues) => {
  const result = await updateData({
    tableName: "UserStatuses",
    conditions: { userStatusId: id },
    updateValues,
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to update UserStatus" };
  }

  return { message: "success", data: "UserStatus updated successfully" };
};

// Service to delete UserStatus
const deleteUserStatus = async (id) => {
  const result = await deleteData({
    tableName: "UserStatuses",
    conditions: { userStatusId: id },
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to delete UserStatus" };
  }

  return { message: "success", data: "UserStatus deleted successfully" };
};

module.exports = {
  createUserStatus,
  getUserStatusById,
  updateUserStatus,
  deleteUserStatus,
};
