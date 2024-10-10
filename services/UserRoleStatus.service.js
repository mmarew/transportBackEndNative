const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
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
const getUserRoleStatus = async (body) => {
  console.log("body", body);
  const { phoneNumber, fullName, email } = body;
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatus",
        on: "UserRole.roleId = UserRoleStatus.userRoleId",
      },
    ],
    conditions: {
      isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  console.log("userData", userData);
  return userData;
};

// Update UserRoleStatus
const updateUserRoleStatus = async (updateDataValues) => {
  try {
    const {
      user,
      userRoleStatusUniqueId,
      userRoleId,
      statusId,
      userRoleStatusDescription,
      phoneNumber,
    } = updateDataValues;
    const userUniqueId = user?.data?.userUniqueId;
    // Check if the UserRoleStatus exists by userRoleStatusUniqueId
    const existingUserRoleStatus = await getData({
      tableName: "UserRoleStatus",
      conditions: { userRoleStatusUniqueId },
    });

    if (existingUserRoleStatus.length === 0) {
      return { message: "error", data: "UserRoleStatus not found" };
    }

    // Ensure no duplicate active status for the same role and user combination
    const activeUserRoleStatus = await getData({
      tableName: "UserRoleStatus",
      conditions: {
        userRoleId,
        isUserRoleStatusActive: true,
        statusId: statusId,
      },
    });

    if (activeUserRoleStatus.length > 0) {
      return {
        message: "error",
        data: "UserRoleStatus with the same status already exists",
      };
    }

    // Deactivate the previous active status (if any) and update the 'updatedAt' field
    await updateData({
      tableName: "UserRoleStatus",
      conditions: { userRoleId },
      updateValues: {
        userRoleStatusUpdatedAt: new Date(),
        isUserRoleStatusActive: false,
        userRoleStatusUpdatedBy: userUniqueId,
      },
    });

    // Create a new UserRoleStatus entry with the new status
    const newUserRoleStatus = {
      userRoleStatusUniqueId: uuidv4(), // New UUID
      statusId: statusId,
      userRoleId,
      userRoleStatusDescription: userRoleStatusDescription,
      userRoleStatusCreatedAt: new Date(),
      isUserRoleStatusActive: true, // Mark new status as active
      userRoleStatusCreatedBy: userUniqueId,
    };

    // Insert the new status record into the database
    await insertData({
      tableName: "UserRoleStatus",
      colAndVal: newUserRoleStatus,
    });

    // Optionally, send a notification to the driver if a phone number is provided
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
      data: newUserRoleStatus,
    };
  } catch (error) {
    console.error("Error in updateUserRoleStatus:", error);
    return {
      message: "error",
      error: "An error occurred while updating UserRoleStatus",
    };
  }
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
const userRoleStatusByPhone = async (phoneNumber) => {
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatus",
        on: "UserRole.roleId = UserRoleStatus.userRoleId",
      },
    ],
    conditions: {
      isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  console.log("userData", userData);
  return userData;
};
module.exports = {
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
