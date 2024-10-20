const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendNotificationToDriver,
  sendNotificationToAdmin,
} = require("../Utils/Notifications");
const currentDate = require("../Utils/currentDate");
const { insertData } = require("../CRUD/Create/CreateData");

// Create UserRoleStatus
const createUserRoleStatus = async (body) => {
  const { statusId, userRoleId, userRoleStatusDescription, createdByUserId } =
    body;

  // Check if UserRoleStatus already exists in current
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleId },
  });

  if (existingUserRoleStatus.length > 0) {
    return { message: "error", data: "Active UserRoleStatus already exists" };
  }

  // Insert new UserRoleStatus into the current table
  const userRoleStatusUniqueId = uuidv4();
  const newUserRoleStatus = {
    userRoleStatusUniqueId,
    statusId,
    userRoleId,
    userRoleStatusDescription,
    userRoleStatusCreatedAt: new Date(),
    userRoleStatusCreatedBy: createdByUserId,
    isUserRoleStatusActive: true,
  };

  const result = await insertData({
    tableName: "UserRoleStatusCurrent",
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
  const { phoneNumber, roleId } = body;
  const userData = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
      {
        table: "Statuses",
        on: "UserRoleStatusCurrent.statusId = Statuses.statusId",
      },
    ],
    conditions: {
      "UserRole.roleId": roleId,
      isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  return userData;
};

// Update UserRoleStatus and move old status to history
const updateUserRoleStatus = async (updateDataValues) => {
  try {
    const {
      user,
      roleId,
      userRoleStatusUniqueId,
      userRoleId,
      statusId,
      userRoleStatusDescription,
      phoneNumber,
    } = updateDataValues;

    const userUniqueId = user?.userUniqueId;

    // Check if the UserRoleStatus exists in current
    const existingUserRoleStatus = await getData({
      tableName: "UserRoleStatusCurrent",
      conditions: { userRoleStatusUniqueId },
    });

    if (existingUserRoleStatus.length === 0) {
      return { message: "error", data: "Active user role status not found" };
    }

    // Move current status to history
    await insertData({
      tableName: "UserRoleStatusHistory",
      colAndVal: {
        ...existingUserRoleStatus[0],
        userRoleStatusUpdatedBy: userUniqueId,
        userRoleStatusUpdatedAt: new Date(),
      },
    });

    // Deactivate the current status in UserRoleStatusCurrent
    await updateData({
      tableName: "UserRoleStatusCurrent",
      conditions: { userRoleId },
      updateValues: {
        userRoleStatusUpdatedAt: new Date(),
        isUserRoleStatusActive: false,
        userRoleStatusUpdatedBy: userUniqueId,
      },
    });

    // Insert a new UserRoleStatus entry with the new status in current
    const newUserRoleStatusUniqueId = uuidv4();
    const newUserRoleStatus = {
      userRoleStatusUniqueId: newUserRoleStatusUniqueId,
      statusId,
      userRoleId,
      userRoleStatusDescription,
      userRoleStatusCreatedAt: new Date(),
      isUserRoleStatusActive: true,
      userRoleStatusCreatedBy: userUniqueId,
    };

    await insertData({
      tableName: "UserRoleStatusCurrent",
      colAndVal: newUserRoleStatus,
    });

    // Handle the responses after the new status is created
    return await handleUpdateResponces({
      roleId,
      statusId,
      phoneNumber,
      newUserRoleStatus,
    });
  } catch (error) {
    console.error("Error in updateUserRoleStatus:", error);
    return {
      message: "error",
      error: "An error occurred while updating UserRoleStatus",
    };
  }
};

// Handle responses when updating user role status
const handleUpdateResponces = async ({
  roleId,
  statusId,
  phoneNumber,
  newUserRoleStatus,
}) => {
  try {
    if (roleId == 2 && statusId == 3) {
      const driver = await getUserRoleStatus({ roleId, phoneNumber });
      await sendNotificationToAdmin({
        message: {
          message: "success",
          request: "approve or reject driver's document",
          driver,
        },
        phoneNumber,
      });
    } else if (roleId == 3) {
      if (statusId == 1) {
        await sendNotificationToDriver({
          message: "success",
          request: "User document approved by admin",
          phoneNumber,
        });
      } else if (statusId == 4) {
        await sendNotificationToDriver({
          message: "success",
          request: "User document rejected by admin",
          phoneNumber,
        });
      }
    }
    return { message: "success", userRoleStatus: newUserRoleStatus };
  } catch (error) {
    console.error("Error in handleUpdateResponces:", error);
    return {
      message: "error",
      error: "An error occurred while handling responses",
    };
  }
};

// Delete UserRoleStatus (soft delete by moving to history)
const deleteUserRoleStatus = async (userRoleStatusUniqueId) => {
  // Check if the UserRoleStatus exists in current
  const existingUserRoleStatus = await getData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
  });

  if (existingUserRoleStatus.length === 0) {
    return { message: "error", data: "UserRoleStatus not found" };
  }

  // Move current status to history before deletion
  await insertData({
    tableName: "UserRoleStatusHistory",
    colAndVal: {
      ...existingUserRoleStatus[0],
      userRoleStatusDeletedAt: new Date(),
    },
  });

  // Soft delete in current (deactivate status)
  const result = await updateData({
    tableName: "UserRoleStatusCurrent",
    conditions: { userRoleStatusUniqueId },
    updateValues: { isUserRoleStatusActive: false },
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
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
    ],
    conditions: {
      isUserRoleStatusActive: true,
      phoneNumber,
    },
  });
  return userData;
};

module.exports = {
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
