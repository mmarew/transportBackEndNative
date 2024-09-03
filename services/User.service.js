// services/userService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { verifyExistanceOfData } = require("../CRUD/Read/ReadData");

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
    const savedUser = await verifyExistanceOfData({
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

      const verifyUsersRoleStatus = await verifyExistanceOfData({
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

const verifyUserByOTP = async (req) => {
  try {
    console.log("first");
    const { OTP, phoneNumber } = req.query;
    const verifyUserExistance = await verifyExistanceOfData({
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
    const selectResult = await verifyExistanceOfData({
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

module.exports = {
  verifyUserByOTP,
  createUser,
  getUser,
  deleteUser,
  getAllUsers,
};
