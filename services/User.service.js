// services/userService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

const { updateData } = require("../CRUD/Update/Data.update");
const { sendOtpViaWebSocket } = require("../Utils/WsServerResponder");
const createJWT = require("../Utils/createJWT");
const currentDate = require("../Utils/currentDate");
const { insertData } = require("../CRUD/Create/CreateData");

const createUser = async (body) => {
  const { fullName, phoneNumber, email, roleId, statusId } = body;
  if (!fullName || !phoneNumber || !email || !roleId || !statusId) {
    return {
      message: "error",
      data: "All fields are required",
    };
  }
  console.log("body", body);
  const OTP = Math.floor(100000 + Math.random() * 900000);
  try {
    // Check if the user already exists
    const savedUser = await getData({
      tableName: "Users",
      conditions: { phoneNumber, email },
      operator: "OR",
    });
    console.log("savedUser", savedUser);

    if (savedUser.length > 0) {
      if (
        email !== savedUser[0].email ||
        phoneNumber !== savedUser[0].phoneNumber
      ) {
        return {
          message: "error",
          data: "Invalid email or phone number",
        };
      }

      const verifyUsersRoleStatus = await getData({
        tableName: "UserRoleStatuses",
        conditions: {
          roleId,
          userUniqueId: savedUser[0].userUniqueId,
        },
      });
      console.log("verifyUsersRoleStatus============>", verifyUsersRoleStatus);
      if (verifyUsersRoleStatus.length == 0) {
        const insertedRoleMessage = await insertData({
          tableName: "UserRoleStatuses",
          colAndVal: {
            userRoleStatusUniqueId: uuidv4(),
            userUniqueId: savedUser[0].userUniqueId,
            roleId,
            statusId,
          },
        });

        if (insertedRoleMessage.affectedRows <= 0) {
          return {
            message: "error",
            error: "Unable to update user role status",
          };
        }
      }

      const updateOtpResult = await updateData({
        tableName: "usersCredential",
        updateValues: {
          OTP: OTP,
        },
        conditions: { userUniqueId: savedUser[0].userUniqueId },
      });

      if (updateOtpResult.affectedRows > 0) {
        const smsResult = await sendOtpViaWebSocket(phoneNumber, OTP);
        console.log("smsResult", smsResult);
        if (smsResult.message === "success")
          return {
            message: "success",
            messageDetail: "user created successfully, OTP sent successfully",
          };
        else {
          return smsResult;
        }
      } else {
        return {
          message: "error",
          error: "Unable to update  OTP",
        };
      }
    }

    // Generate unique ids for user and credentials
    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();

    const insertToUsers = await insertData({
      tableName: "Users",
      colAndVal: {
        userUniqueId,
        fullName,
        phoneNumber,
        email,
        createdAt: currentDate(),
      },
    });

    const insertToCredentials = await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId,
        userUniqueId,
        OTP,
      },
    });

    const insertToUserRoleStatuses = await insertData({
      tableName: "UserRoleStatuses",
      colAndVal: {
        userRoleStatusUniqueId: uuidv4(),
        statusId,
        roleId,
        userUniqueId,
      },
    });

    if (
      insertToUserRoleStatuses.affectedRows > 0 &&
      insertToCredentials.affectedRows > 0 &&
      insertToUsers.affectedRows > 0
    ) {
      const smsResult = await sendOtpViaWebSocket(phoneNumber, OTP);
      if (smsResult.message === "success") {
        return {
          message: "success",
          messageDetail: "User created successfully, OTP sent successfully",
        };
      } else {
        return smsResult;
      }
    } else {
      return {
        message: "error",
        data: "An error occurred during user creation",
      };
    }
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during user creation" };
  }
};
// 0911288817
const verifyUserByOTP = async (req) => {
  try {
    console.log("first");
    const { OTP, phoneNumber } = req.query;
    const verifyUserExistance = await getData({
      tableName: "Users",
      conditions: {
        phoneNumber,
      },
    });

    if (verifyUserExistance.length == 0) {
      return { message: "error", error: "user not found" };
    }
    const { userUniqueId, fullName, email } = verifyUserExistance[0];

    const token = createJWT({
      userUniqueId,
      fullName,
      phoneNumber,
      email,
    });
    const selectResult = await getData({
      tableName: "usersCredential",
      conditions: {
        userUniqueId,
      },
    });
    console.log("selectResult", selectResult);
    if (selectResult[0].OTP == OTP) {
      return { token, message: "success", data: "OTP verified successfully" };
    } else {
      return { message: "error", error: "OTP verification failed" };
    }
  } catch (error) {
    console.error("Error in verifyDriverByOTP:", error.message);
    return { message: "error", error: "Unable to verify user" };
  }
};

const getUser = async (id) => {
  const sql = `SELECT * FROM Users WHERE userId = ?`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "User not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the user",
    };
  }
};

const deleteUser = async (id) => {
  const sql = `DELETE FROM Users WHERE userId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "User deleted successfully" };
    }
    return { message: "error", data: "User deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during user deletion" };
  }
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
    console.error("Error:", error);
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
      data: "userUniqueId is required",
    };
  }

  // Optional fields for update
  const updateValues = {};
  if (fullName) updateValues.fullName = fullName;
  if (phoneNumber) updateValues.phoneNumber = phoneNumber;
  if (email) updateValues.email = email;

  console.log("body", body);

  try {
    // Check if the user exists
    const savedUser = await getData({
      tableName: "Users",
      conditions: { userUniqueId },
    });

    if (savedUser.length <= 0) {
      return {
        message: "error",
        data: "User not found",
      };
    }

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
    if (roleId || statusId) {
      const existingRoleStatus = await getData({
        tableName: "UserRoleStatuses",
        conditions: {
          userUniqueId,
        },
      });

      if (existingRoleStatus.length > 0) {
        // Update the role or status if needed
        const updateRoleStatusResult = await updateData({
          tableName: "UserRoleStatuses",
          updateValues: {
            ...(roleId && { roleId }),
            ...(statusId && { statusId }),
          },
          conditions: { userUniqueId },
        });

        if (updateRoleStatusResult.affectedRows <= 0) {
          return {
            message: "error",
            data: "Failed to update user role/status",
          };
        }
      } else {
        // If no existing role/status, insert new one
        const insertRoleStatusResult = await insertData({
          tableName: "UserRoleStatuses",
          colAndVal: {
            userRoleStatusUniqueId: uuidv4(),
            userUniqueId,
            ...(roleId && { roleId }),
            ...(statusId && { statusId }),
          },
        });

        if (insertRoleStatusResult.affectedRows <= 0) {
          return {
            message: "error",
            data: "Failed to create user role/status",
          };
        }
      }
    }

    return {
      message: "success",
      data: "User updated successfully",
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user update",
    };
  }
};

module.exports = {
  updateUser,
  verifyUserByOTP,
  createUser,
  getUser,
  deleteUser,
  getAllUsers,
};
