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
  const { phoneNumber, fullName, email, roleId } = body;
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
      {
        table: "Statuses",
        on: "UserRoleStatus.statusId = Statuses.statusId",
      },
    ],
    conditions: {
      "UserRole.roleId": roleId,
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
      roleId,
      userRoleStatusUniqueId,
      userRoleId,
      statusId, //new roleId
      userRoleStatusDescription,
      phoneNumber,
    } = updateDataValues;

    const userUniqueId = user?.userUniqueId;
    const currentUserRoleId = user?.roleId;
    console.log("currentUserRoleId=================>", currentUserRoleId);
    // Check if the UserRoleStatus exists by userRoleStatusUniqueId
    const existingUserRoleStatus = await getData({
      tableName: "UserRoleStatus",
      conditions: { userRoleStatusUniqueId },
    });

    if (existingUserRoleStatus.length === 0) {
      return { message: "error", data: "active user role status not found" };
    }

    // Check if current and saved status are the same, if so, handle responses directly
    if (
      existingUserRoleStatus[0].statusId === statusId &&
      existingUserRoleStatus[0].userRoleId === userRoleId
    ) {
      return await handleUpdateResponces({
        currentUserRoleId,
        roleId,
        statusId,
        phoneNumber,
        newUserRoleStatus: existingUserRoleStatus[0],
      });
    }

    // Ensure no duplicate active status for the same role and user combination
    const activeUserRoleStatus = await getData({
      tableName: "UserRoleStatus",
      conditions: {
        userRoleId,
        isUserRoleStatusActive: true,
        statusId,
      },
    });

    if (activeUserRoleStatus.length > 0) {
      // return existing user role status
      return await handleUpdateResponces({
        currentUserRoleId,
        roleId,
        statusId,
        phoneNumber,
        newUserRoleStatus: activeUserRoleStatus[0],
      });
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

    // Insert the new status record into the database
    await insertData({
      tableName: "UserRoleStatus",
      colAndVal: newUserRoleStatus,
    });

    // Handle the responses after the new status is created
    return await handleUpdateResponces({
      currentUserRoleId,
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

// Separated out the handleResponces function for better clarity
const handleUpdateResponces = async ({
  currentUserRoleId,
  roleId,
  statusId,
  phoneNumber,
  newUserRoleStatus,
}) => {
  try {
    // If the user is a driver and waiting for approval, send notification to admin
    if (currentUserRoleId == 2 && statusId == 3) {
      const driver = await getUserRoleStatus({ roleId, phoneNumber });
      newUserRoleStatus = driver[0];
      await sendNotificationToAdmin({
        message: {
          message: "success",
          request: "approve or reject drivers document",
          driver,
        },
        phoneNumber,
      });
    }
    // If the user is an admin, send notifications to the driver for approval/rejection
    else if (currentUserRoleId == 3) {
      if (statusId == 1) {
        await sendNotificationToDriver({
          message: {
            message: "success",
            request: "User document approved by admin",
          },
          phoneNumber,
        });
      } else if (statusId == 4) {
        await sendNotificationToDriver({
          message: {
            message: "success",
            request: "User document rejected by admin",
          },
          phoneNumber,
        });
      }
    }
    console.log("@handleUpdateResponces newUserRoleStatus", newUserRoleStatus);
    return {
      message: "success",
      userRoleStatus: newUserRoleStatus,
    };
  } catch (error) {
    console.error("Error in handleResponces:", error);
    return {
      message: "error",
      error: "An error occurred while handling responses",
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
