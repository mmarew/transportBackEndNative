const { pool } = require("../../Middleware/Database.config");
const { sendOtpViaWebSocket } = require("../../Utils/WsServerResponder");

const updateuserJourneyStatus = async (requestUniqueId, status) => {
  const sql = `update PassengerRequest set status = '${status}' where  requestUniqueId=?`;
  const value = [requestUniqueId];
  const [rows] = await pool.query(sql, value);
  console.log("rows", rows);
  return rows;
};
const updateDecisionStatus = async (decisionUniqueId, status) => {
  const sqlToUpdateDecision = `update journeyDecisions set decision = '${status}' where   decisionUniqueId=?`;
  const value = [decisionUniqueId];
  const [rows] = await pool.query(sqlToUpdateDecision, value);
  return rows;
};
const updateDriverWaittingStatus = async (waitUniqueId, status) => {
  const sql = `update driverWaits set status = '${status}' where  waitUniqueId=? `;
  const value = [waitUniqueId];
  const [rows] = await pool.query(sql, value);
  return rows;
};
const updateJourneyStatus = async (journeyUniqueId, status) => {
  const sql = `update journeys set status = '${status}' where  journeyUniqueId=? `;
  const value = [journeyUniqueId];
  const [rows] = await pool.query(sql, value);
  return rows;
};
async function updateOTPToUsersCredentials({ userUniqueId, OTP, phoneNumber }) {
  const updateSql = `UPDATE usersCredential SET OTP = ? WHERE userUniqueId = ?`;
  let [updateResult] = await pool.query(updateSql, [OTP, userUniqueId]);
  if (updateResult.affectedRows > 0) {
    return sendOtpViaWebSocket(phoneNumber, OTP);
  } else return "fail to create OTP";
}

const updateUserRole = async (savedUser, newRoleId) => {
  try {
    let updatedRoleId = null;
    const savedRoleId = parseInt(savedUser.userRoleId);
    newRoleId = parseInt(newRoleId);
    updatedRoleId = newRoleId;
    // Validate newRoleId to be between 1 and 3
    if (newRoleId < 1 || newRoleId > 3 || isNaN(newRoleId)) {
      return {
        message: "error",
        messageDetail:
          "Invalid user role. The role ID must be 1 (Passenger), 2 (Driver), or 3 (Admin).",
      };
    }

    // If the role is already set to the desired new role
    if (savedRoleId === newRoleId) {
      return {
        message: "success",
        messageDetail: "User role is already set to the requested role.",
      };
    }

    // Determine the correct updatedRoleId based on savedRoleId and newRoleId
    switch (savedRoleId) {
      case 1: // Passenger
        if (newRoleId === 2) {
          updatedRoleId = 4; // Add Driver -> Driver and Passenger
        } else if (newRoleId === 3) {
          updatedRoleId = 5; // Add Admin -> Admin and Passenger
        }
        break;
      case 2: // Driver
        if (newRoleId === 1) {
          updatedRoleId = 4; // Add Passenger -> Driver and Passenger
        } else if (newRoleId === 3) {
          updatedRoleId = 6; // Add Admin -> Admin and Driver
        }
        break;
      case 3: // Admin
        if (newRoleId === 1) {
          updatedRoleId = 5; // Add Passenger -> Admin and Passenger
        } else if (newRoleId === 2) {
          updatedRoleId = 6; // Add Driver -> Admin and Driver
        }
        break;
      case 4: // Driver and Passenger
        if (newRoleId === 3) {
          updatedRoleId = 7; // Add Admin -> Admin, Driver, and Passenger
        }
        break;
      case 5: // Admin and Passenger
        if (newRoleId === 2) {
          updatedRoleId = 7; // Add Driver -> Admin, Driver, and Passenger
        }
        break;
      case 6: // Admin and Driver
        if (newRoleId === 1) {
          updatedRoleId = 7; // Add Passenger -> Admin, Driver, and Passenger
        }
        break;
      case 7: // Admin, Driver, and Passenger
        updatedRoleId = 7; // Already has all roles
        break;
      default:
        return {
          message: "error",
          messageDetail: "Invalid current role ID.",
        };
    }

    console.log("updatedRoleId", updatedRoleId);

    // If no valid role combination was found, return an error
    if (!updatedRoleId) {
      return { message: "error", data: "Invalid role update operation." };
    }

    // Update the user role in the database
    const sql = `UPDATE Users SET userRoleId = ? WHERE userId = ?`;
    const values = [updatedRoleId, savedUser.userId];
    const [result] = await pool.query(sql, values);

    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "User role updated successfully.",
      };
    } else {
      return { message: "error", data: "User role update failed." };
    }
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      error: "Unable to update user role.",
    };
  }
};
const updateData = async ({
  tableName,
  updateValues,
  conditions,
  operator = "AND",
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the SET clause dynamically based on the updateValues object
  const setColumns = Object.keys(updateValues);
  const setValues = Object.values(updateValues);

  const setClause = setColumns.map((col) => `${col} = ?`).join(", ");

  // Build the WHERE clause dynamically based on the conditions object
  const conditionColumns = Object.keys(conditions);
  const conditionValues = Object.values(conditions);

  const whereClause = conditionColumns
    .map((col) => `${col} = ?`)
    .join(` ${operator} `);

  const sqlQuery = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;

  try {
    const [result] = await pool.query(sqlQuery, [
      ...setValues,
      ...conditionValues,
    ]);
    return result; // Return the result object containing affectedRows, etc.
  } catch (error) {
    console.error("Error updating data:", error);
    throw error;
  }
};

// // Example usage
// const updateResult = await updateData({
//   tableName: "Users",
//   updateValues: {
//     fullName: "John Doe Updated",
//     email: "newemail@example.com",
//   },
//   conditions: {
//     userId: 1,
//   },
//   operator: "AND", // Use 'OR' or 'AND' depending on your needs
// });

// console.log("Update Result:", updateResult);

module.exports = {
  updateData,
  updateUserRole,
  updateOTPToUsersCredentials,
  updateJourneyStatus,
  updateuserJourneyStatus,
  updateDecisionStatus,
  updateDriverWaittingStatus,
};
