const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");

// Service to create UserStatus
const createUserStatus = async (body) => {
  const { userUniqueId, statusId } = body;

  // Check if user status already exists to prevent redundancy
  const existingUserStatus = await getData({
    tableName: "UserStatuses",
    conditions: { userUniqueId, statusId },
  });

  if (existingUserStatus.length) {
    throw new AppError("User status already exists", 400);
  }

  const userStatusUniqueId = uuidv4();
  const result = await insertData({
    tableName: "UserStatuses",
    colAndVal: { userStatusUniqueId, userUniqueId, statusId },
  });

  return { message: "Statuses list fetched", data: result };
};

// Service to get UserStatuses by filter
const getUserStatuses = async (query) => {
  const results = await getData({
    tableName: "UserStatuses",
    conditions: query,
  });
  return { message: "Statuses list fetched", data: results };
};

// Service to get UserStatus by unique ID
const getUserStatusById = async (userStatusUniqueId) => {
  const results = await getData({
    tableName: "UserStatuses",
    conditions: { userStatusUniqueId },
  });

  if (!results.length) {
    throw new AppError("UserStatus not found", 404);
  }

  return { message: "Statuses list fetched", data: results[0] };
};

// Service to update UserStatus
const updateUserStatus = async (userStatusUniqueId, updateValues) => {
  const result = await updateData({
    tableName: "UserStatuses",
    conditions: { userStatusUniqueId },
    updateValues,
  });

  if (result.affectedRows === 0) {
    throw new AppError(
      "Failed to update UserStatus or UserStatus not found",
      404,
    );
  }

  return { message: "Statuses list fetched", data: null };
};

// Service to delete UserStatus
const deleteUserStatus = async (userStatusUniqueId) => {
  const result = await deleteData({
    tableName: "UserStatuses",
    conditions: { userStatusUniqueId },
  });

  if (result.affectedRows === 0) {
    throw new AppError(
      "Failed to delete UserStatus or UserStatus not found",
      404,
    );
  }

  return { message: "Statuses list fetched", data: null };
};

module.exports = {
  createUserStatus,
  getUserStatuses,
  getUserStatusById,
  updateUserStatus,
  deleteUserStatus,
};
