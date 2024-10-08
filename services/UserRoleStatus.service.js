const { v4: uuidv4 } = require("uuid");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { sendNotificationToDriver } = require("../Utils/Notifications");
const currentDate = require("../Utils/currentDate");
const { insertData } = require("../CRUD/Create/CreateData");

// Create UserRoleStatus
const createUserRoleStatus = async (body) => {
  const { statusId, userRoleId, userRoleStatusDescription } = body;

  // Check if UserRoleStatus already exists
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatus",
    conditions: { statusId, userRoleId },
  });

  if (existingUserRoleStatus.length > 0) {
    return { message: "error", data: "UserRoleStatus already exists" };
  }

  // Insert new UserRoleStatus
  const userRoleStatusUniqueId = uuidv4();
  const newUserRoleStatus = {
    userRoleStatusUniqueId,
    statusId,
    userRoleId,
    userRoleStatusDescription,
    userRoleStatusCreatedAt: new Date(),
  };

  const result = await insertData({
    tableName: "UserRoleStatus",
    colAndVal: newUserRoleStatus,
  });

  return {
    message: "success",
    data: "UserRoleStatus created successfully",
    result,
  };
};

// Get UserRoleStatus by unique ID
const getUserRoleStatusById = async (userRoleStatusUniqueId) => {
  const result = await getData({
    tableName: "UserRoleStatus",
    conditions: { userRoleStatusUniqueId },
  });

  if (result.length === 0) {
    return { message: "error", data: "UserRoleStatus not found" };
  }

  return { message: "success", data: result[0] };
};

// Update UserRoleStatus
const updateUserRoleStatus = async (
  userRoleStatusUniqueId,
  updateDataValues
) => {
  console.log("userRoleStatusUniqueId", userRoleStatusUniqueId);
  // Check if the UserRoleStatus exists
  userRoleStatusUniqueId = updateDataValues?.userRoleStatusUniqueId;
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatus",
    conditions: { userRoleStatusUniqueId },
  });
  console.log("existingUserRoleStatus", existingUserRoleStatus);
  if (existingUserRoleStatus?.length === 0) {
    return { message: "error", data: "UserRoleStatus not found" };
  }
  const phoneNumber = updateDataValues?.phoneNumber;
  const userRoleStatusDescription = updateDataValues.userRoleStatusDescription;
  const statusId = updateDataValues.statusId;
  // Update UserRoleStatus to inactive status and set time to it's updated date
  const result = await updateData({
    tableName: "UserRoleStatus",
    conditions: { userRoleStatusUniqueId },
    updateValues: {
      userRoleStatusUpdatedAt: new Date(),
      isUserRoleStatusActive: false,
    },
  });
  //check if user has active status in this role
  const activeUserRoleStatus = await getData({
    tableName: "UserRoleStatus",
    conditions: {
      userRoleId: existingUserRoleStatus[0].userRoleId,
      statusId: 1,
    },
  });
  console.log("activeUserRoleStatus", activeUserRoleStatus);
  if (activeUserRoleStatus.length > 0) {
    return { message: "error", data: "UserRoleStatus already exists" };
  }
  const insertNewUserRoleStatus = {
    userRoleStatusUniqueId: uuidv4(),
    statusId,
    userRoleId: existingUserRoleStatus[0].userRoleId,
    userRoleStatusDescription,
    userRoleStatusUpdatedAt: currentDate(),
  };
  await insertData({
    tableName: "UserRoleStatus",
    colAndVal: insertNewUserRoleStatus,
  });

  if (phoneNumber) {
    sendNotificationToDriver({
      message: {
        message: { from: "admin", message: userRoleStatusDescription },
      },
      phoneNumber,
    });
  }

  return {
    message: "success",
    data: "UserRoleStatus updated successfully",
    result,
  };
};

// Delete UserRoleStatus
const deleteUserRoleStatus = async (userRoleStatusUniqueId) => {
  // Check if the UserRoleStatus exists
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatus",
    conditions: { userRoleStatusUniqueId },
  });

  if (existingUserRoleStatus.length === 0) {
    return { message: "error", data: "UserRoleStatus not found" };
  }

  // Soft delete (update deletedAt field)
  const result = await updateData({
    tableName: "UserRoleStatus",
    conditions: { userRoleStatusUniqueId },
    updateValues: { userRoleStatusDeletedAt: new Date() },
  });

  return {
    message: "success",
    data: "UserRoleStatus deleted successfully",
    result,
  };
};

module.exports = {
  createUserRoleStatus,
  getUserRoleStatusById,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
