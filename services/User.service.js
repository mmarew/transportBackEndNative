// services/userService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { sendOtpViaWebSocket } = require("../Utils/WsServerResponder");
const createJWT = require("../Utils/createJWT");
const currentDate = require("../Utils/currentDate");
const { insertData } = require("../CRUD/Create/CreateData");
const { sendNotificationToAdmin } = require("../Utils/Notifications");
const bcrypt = require("bcrypt");
const verifyPassword = require("../Utils/VerifyPassword");

const createUserSystem = async (body) => {
  const fullName = "system",
    phoneNumber = "0922112480",
    email = "system@system.com",
    roleId = 5,
    statusId = 1,
    userRoleStatusDescription =
      "this can manage things by itself based on written programs";
  return await createUser({
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
  });
};

const handleExistingUser = async ({
  requestedFrom,
  user,
  roleId,
  statusId,
  userRoleStatusDescription = "no description",
}) => {
  // Generate OTP
  const OTP = Math.floor(100000 + Math.random() * 900000);
  const userUniqueId = user.userUniqueId;
  const credential = await getData({
    tableName: "usersCredential",
    conditions: { userUniqueId },
  });
  // create new credential if it does not exist
  if (credential.length === 0) {
    //create new credential by hashing OTP
    await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId: uuidv4(),
        userUniqueId,
        OTP: await bcrypt.hash(String(OTP), 10),
      },
    });
  }
  // Handle existing user: Insert/Update roles and statuses
  await handleUserRoleStatus(
    user.userUniqueId,
    roleId,
    statusId,
    userRoleStatusDescription
  );
  console.log("to be hashed otp ", OTP); //to be hashed otp  615949
  const hashedOTP = await bcrypt.hash(String(OTP), 10);
  console.log("hashedOTP", hashedOTP);
  if (requestedFrom == "street") {
    return {
      message: "success",
      dataOfPassenger: user,
    };
  }
  // Update OTP for existing user

  const otpUpdated = await updateOtpForUser({
    userUniqueId: user.userUniqueId,
    hashedOTP: hashedOTP,
    phoneNumber: user.phoneNumber,
    OTP,
  });
  return otpUpdated;
};
const createUser = async (body) => {
  // requestedFrom means where is this request comming from passenger using the front end app or driver street pickup or others like admin
  const requestedFrom = body.requestedFrom || "user",
    fullName = body?.fullName,
    phoneNumber = body?.phoneNumber,
    email = body?.email,
    roleId = body?.roleId,
    statusId = body?.statusId,
    userRoleStatusDescription = body?.userRoleStatusDescription;
  console.log("@createUser body", body);
  // Validate input data
  if (!phoneNumber || !roleId || !statusId) {
    return {
      message: "error",
      error: "All fields are required to create a user",
    };
  }

  // Generate OTP
  const OTP = Math.floor(100000 + Math.random() * 900000);

  try {
    // Check if the user already exists
    const savedUser = await getData({
      tableName: "Users",
      conditions: { phoneNumber },
    });
    console.log("@savedUser", savedUser);

    // If the user does not exist, create new user, credentials, role, and status
    const registerNewUser = async () => {
      const userUniqueId = uuidv4();
      const credentialUniqueId = uuidv4();
      const dataOfPassenger = {
        userUniqueId,
        fullName,
        phoneNumber,
        email,
        createdAt: currentDate(),
      };
      const userCreationSuccess = await Promise.all([
        // register users profile
        await insertData({
          tableName: "Users",
          colAndVal: {
            ...dataOfPassenger,
          },
        }),
        // register users credential
        await insertData({
          tableName: "usersCredential",
          colAndVal: {
            credentialUniqueId,
            userUniqueId,
            OTP: await bcrypt.hash(String(OTP), 10),
          },
        }),
      ]);

      if (userCreationSuccess.every((result) => result.affectedRows > 0)) {
        // Insert UserRole and UserRoleStatus
        await handleUserRoleStatus(
          userUniqueId,
          roleId,
          statusId,
          userRoleStatusDescription
        );
        if (requestedFrom == "user") {
          // Send OTP to the user
          const smsResult = await sendOtpViaWebSocket(phoneNumber, OTP);
          if (smsResult.message === "success") {
            return {
              message: "success",
              messageDetail: "User created successfully, OTP sent successfully",
            };
          }
        }
        return {
          message: "success",
          messageDetail: "User created successfully",
          dataOfUser: dataOfPassenger,
        };
      }

      return {
        message: "error",
        data: "An error occurred during user creation",
      };
    };
    if (savedUser.length > 0) {
      return handleExistingUser({
        user: savedUser[0],
        roleId,
        statusId,
        userRoleStatusDescription,
      });
    }

    return await registerNewUser();
  } catch (error) {
    console.log("Error in createUser:", error);
    return {
      message: "error",
      data: "An error occurred during user creation",
    };
  }
};
const handleUserRoleStatus = async (
  userUniqueId,
  roleId,
  statusId,
  userRoleStatusDescription
) => {
  try {
    // Check if the UserRole already exists
    const userRole = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId },
    });
    let userRoleId = null;
    // if user is not found in this role, register new user role
    if (userRole.length === 0) {
      const insertUserRole = await insertData({
        tableName: "UserRole",
        colAndVal: {
          userRoleUniqueId: uuidv4(),
          userUniqueId,
          roleId,
          userRoleCreatedAt: currentDate(),
          userRoleCreatedBy: userUniqueId,
        },
      });

      if (insertUserRole.affectedRows > 0) {
        userRoleId = insertUserRole.insertId;
      }
    } else {
      userRoleId = userRole[0].userRoleId;
    }

    // Check if the UserRole is in UserRoleStatus already exists
    const userRoleStatus = await getData({
      tableName: "UserRoleStatusCurrent",
      conditions: { userRoleId },
    });
    const colAndVal = {
      userRoleStatusUniqueId: uuidv4(),
      userRoleStatusCreatedBy: userUniqueId,
      userRoleId,
      userRoleStatusDescription,
      // if role is 2, user is a driver, then statusId will be 2 for driver because drivers data must be active after aproval by admin
      statusId: roleId == 2 ? 2 : statusId,
      userRoleStatusCreatedAt: currentDate(),
    };
    console.log("colAndVal ============> ", colAndVal);
    if (userRoleStatus.length === 0) {
      // Insert new UserRoleStatus if not found
      await insertData({
        tableName: "UserRoleStatusCurrent",
        colAndVal,
      });
      const newUser = await performJoinSelect({
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
        conditions: { "Users.userUniqueId": userUniqueId },
      });
      // if user is driver send notification to admin to verify its account using driver license etc
      if (roleId == 2) {
        const message = {
          type: "unauthorizedDriver",
          ...newUser[0],
        };
        await sendNotificationToAdmin({
          message,
        });
      }
      return {
        message: "success",
        data: { ...newUser[0] },
      };
    } else {
      return {
        message: "success",
      };
    }
  } catch (error) {
    console.log("Error in handleUserRoleStatus:", error);
    throw error;
  }
};
const getUserByUserUniqueIdAndroleUniqueId = async (
  userUniqueId,
  roleUniqueId
) => {
  const rows = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "UserRole.userUniqueId=Users.userUniqueId",
      },
      {
        table: "Roles",
        on: "UserRole.roleId=Roles.roleId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId=UserRoleStatusCurrent.userRoleId",
      },
      {
        table: "Statuses",
        on: "UserRoleStatusCurrent.statusId=Statuses.statusId",
      },
    ],
    conditions: {
      "Roles.roleUniqueId": roleUniqueId,
      "Users.userUniqueId": userUniqueId,
    },
  });
  return {
    message: "success",
    data: rows,
  };
};
// Helper function to update OTP and send notification
const updateOtpForUser = async ({
  userUniqueId,
  OTP,
  phoneNumber,
  hashedOTP,
}) => {
  const updateOtpResult = await updateData({
    tableName: "usersCredential",
    updateValues: { OTP: hashedOTP },
    conditions: { userUniqueId },
  });

  if (updateOtpResult.affectedRows > 0) {
    const smsResult = await sendOtpViaWebSocket(phoneNumber, OTP);
    if (smsResult.message === "success") {
      return {
        message: "success",
        messageDetail: "OTP updated and sent successfully",
      };
    } else {
      return smsResult;
    }
  } else {
    return {
      message: "error",
      error: "Unable to update OTP",
    };
  }
};

const verifyUserByOTP = async (req) => {
  try {
    console.log("req.query in verifyUserByOTP", req.query);
    if (!req.query || !req.query.OTP || !req.query.phoneNumber) {
      return { message: "error", error: "OTP and phoneNumber are required" };
    }

    const { OTP, phoneNumber } = req.query;
    const verifyUserExistance = await performJoinSelect({
      baseTable: "Users",
      joins: [
        {
          table: "usersCredential",
          on: "Users.userUniqueId = usersCredential.userUniqueId",
        },
      ],
      conditions: {
        phoneNumber,
      },
    });

    const roleId = req.query.roleId;
    if (!verifyUserExistance || verifyUserExistance.length === 0) {
      return { message: "error", error: "user not found" };
    }

    const { userUniqueId, fullName, email } = verifyUserExistance[0];
    const hashedOTP = verifyUserExistance[0].OTP;
    const verifyOTP = await verifyPassword({
      hashedPassword: hashedOTP,
      notHashedPassword: OTP,
    });
    console.log("verifyOTP", verifyOTP);
    if (verifyOTP.error) {
      return { message: "error", error: "OTP verification failed" };
    }
    console.log("userUniqueId", userUniqueId);
    console.log("roleId", roleId);
    const userInRoleId = await getData({
      tableName: "UserRole",
      conditions: { roleId, userUniqueId },
    });
    console.log("userInRoleId", userInRoleId);
    if (userInRoleId.length === 0) {
      return { message: "error", error: "user not found in this role" };
    }
    const JWTData = createJWT({
      userUniqueId,
      fullName,
      phoneNumber,
      email,
      roleId,
    });
    const resMessage = JWTData.message;
    if (resMessage === "error") {
      return JWTData;
    }

    const token = JWTData.token;
    return {
      token,
      message: "success",
      data: "OTP verified successfully",
    };
  } catch (error) {
    console.log("Error in verifyDriverByOTP:", error.message);
    return { message: "error", error: "Unable to verify user" };
  }
};
const getUserByUserUniqueId = async (userUniqueId) => {
  const user = await getData({
    tableName: "Users",
    conditions: { userUniqueId: userUniqueId },
  });
  if (!user || user.length === 0) {
    return { message: "error", error: "User not found" };
  }
  return { message: "success", data: user[0] };
};
const getUserByEmailOrNameOrPhoneNumber = async (data, roleId) => {
  let getUserQuery = `SELECT * FROM Users, UserRole, Roles WHERE   email LIKE ? OR phoneNumber LIKE ? OR fullName LIKE ? AND Roles.roleId = ${roleId} AND Users.userUniqueId = UserRole.userUniqueId AND UserRole.roleId = Roles.roleId`;
  if (!roleId) {
    getUserQuery = `SELECT * FROM Users WHERE   email LIKE ? OR phoneNumber LIKE ? OR fullName LIKE ?`;
  }

  try {
    const [rows] = await pool.query(getUserQuery, [
      data,
      `%${data}%`,
      `%${data}%`,
      `%${data}%`,
    ]);

    // if (rows.length > 0) {
      return { message: "success", data: rows };
    // }

    // return { message: "failed", error: "User not found" };
  } catch (error) {
    return {
      message: "error",
      data: "An error occurred while retrieving the user",
    };
  }
};
const getUsersByRoleUniqueId = async (roleUniqueId) => {
  const rows = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "UserRole",
        on: "UserRole.userUniqueId=Users.userUniqueId",
      },
      {
        table: "Roles",
        on: "UserRole.roleId=Roles.roleId",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId=UserRoleStatusCurrent.userRoleId",
      },
      {
        table: "Statuses",
        on: "UserRoleStatusCurrent.statusId=Statuses.statusId",
      },
    ],
    conditions: { "Roles.roleUniqueId": roleUniqueId },
  });
  return {
    message: "success",
    data: rows,
  };
};


const loginUser = async (phoneNumber, roleId, statusId) => {
  const data = await getUserByEmailOrNameOrPhoneNumber(phoneNumber);

  const userData = data?.data;
  console.log("userData", userData);
  // return;
  if (!userData)
    return {
      message: "error",
      error: "User not found",
    };
  const res = await handleExistingUser({
    user: userData,
    roleId,
    statusId,
  });
  return res;
};

const deleteUser = async (userUniqueId) => {
  // const result = await deleteData({
  //   tableName: "Users",
  //   conditions: { userUniqueId },
  // });
  // const deleteCredential = await deleteData({
  //   tableName: "usersCredential",
  //   conditions: { userUniqueId },
  // });

  //  delete requests of user

  //  delete requests of user
  return { message: "success", data: "user deleted successfully" };
};

const getAllUsers = async () => {
  const sql = `SELECT * FROM Users`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No users found" };
  } catch (error) {
    console.log("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving users",
    };
  }
};
const updateUser = async (body) => {
  const { userUniqueId, fullName, phoneNumber, email, roleId, statusId } = body;

  // Ensure required fields are provided
  if (!userUniqueId) {
    return {
      message: "error",
      error: "userUniqueId is required",
    };
  }

  // Optional fields for update
  const updateValues = {};
  if (fullName) updateValues.fullName = fullName;
  if (phoneNumber) updateValues.phoneNumber = phoneNumber;
  if (email) updateValues.email = email;

  try {
    // Update the user's information if there are any fields to update
    if (Object.keys(updateValues).length > 0) {
      const updateUserResult = await updateData({
        tableName: "Users",
        updateValues,
        conditions: { userUniqueId },
      });

      if (updateUserResult.affectedRows <= 0) {
        return {
          message: "error",
          data: "Failed to update user details",
        };
      }
    }

    // Check if roleId or statusId needs to be updated
    // if (roleId || statusId) {
    //   const existingRoleStatus = await getData({
    //     tableName: "UserRoleStatusCurrent",
    //     conditions: {
    //       userUniqueId,
    //     },
    //   });

    //   if (existingRoleStatus.length > 0) {
    //     // Update the role or status if needed
    //     const updateRoleStatusResult = await updateData({
    //       tableName: "UserRoleStatusCurrent",
    //       updateValues: {
    //         ...(roleId && { roleId }),
    //         ...(statusId && { statusId }),
    //       },
    //       conditions: { userUniqueId },
    //     });

    //     if (updateRoleStatusResult.affectedRows <= 0) {
    //       return {
    //         message: "error",
    //         data: "Failed to update user role/status",
    //       };
    //     }
    //   } else {
    //     // If no existing role/status, insert new one
    //     const insertRoleStatusResult = await insertData({
    //       tableName: "UserRoleStatuses",
    //       colAndVal: {
    //         userRoleStatusUniqueId: uuidv4(),
    //         userUniqueId,
    //         ...(roleId && { roleId }),
    //         ...(statusId && { statusId }),
    //       },
    //     });

    //     if (insertRoleStatusResult.affectedRows <= 0) {
    //       return {
    //         message: "error",
    //         data: "Failed to create user role/status",
    //       };
    //     }
    //   }
    // }
    const tokenData = createJWT({
      userUniqueId,
      fullName,
      phoneNumber,
      email,
      roleId,
    });

    return {
      token: tokenData.token,
      message: "success",
      data: "User updated successfully",
    };
  } catch (error) {
    console.log("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user update",
    };
  }
};

module.exports = {
  createUserSystem,
  getUserByUserUniqueId,
  getUsersByRoleUniqueId,
  getUserByUserUniqueIdAndroleUniqueId,
  updateUser,
  verifyUserByOTP,
  createUser,
  getUserByEmailOrNameOrPhoneNumber,
  deleteUser,
  getAllUsers,
  loginUser,

};
