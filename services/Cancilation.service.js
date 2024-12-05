const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
// Function to add a cancellation reason
const addCancellationReason = async (body) => {
  try {
    const cancellationReasonTypeUniqueId = uuidv4();
    const roleId = body.roleId;
    const cancellationReason = body.cancellationReason;

    // Check if the reason already exists
    const isAvailable = await getData({
      tableName: "CancellationReasonsType",
      conditions: { cancellationReason, roleId },
    });
    if (isAvailable.length > 0)
      return { message: "error", error: "Cancellation reason already exists" };

    const sqlToAddReason = `
      INSERT INTO CancellationReasonsType 
      (cancellationReasonTypeUniqueId, cancellationReason, roleId) 
      VALUES (?, ?, ?)
    `;

    const reasonValues = [
      cancellationReasonTypeUniqueId,
      cancellationReason,
      roleId,
    ];

    const [registerResult] = await pool.query(sqlToAddReason, reasonValues);
    if (registerResult.affectedRows > 0) {
      return {
        message: "success",
        data: "Cancellation reason registered successfully",
      };
    } else {
      return {
        message: "error",
        data: "Cancellation reason registration failed",
      };
    }
  } catch (error) {
    console.log("Error adding cancellation reason:", error);
    return {
      message: "error",
      data: "Cancellation reason registration failed",
    };
  }
};
const getSingleCancellationReason = async (req, res) => {
  //cancellationReasonTypeUniqueId
  const cancellationReasonTypeUniqueId =
    req.params.cancellationReasonTypeUniqueId;
  const sqlToGetReason = `SELECT * FROM CancellationReasonsType WHERE cancellationReasonTypeUniqueId = '${cancellationReasonTypeUniqueId}'`;
  const [result] = await pool.query(sqlToGetReason);
  return { message: "success", data: result };
};
// Function to get all cancellation reasons
const getCancellationReasons = async (req) => {
  const user = req.user;
  const roleId = user.roleId;
  if (!roleId) {
    return { message: "error", error: "User not found" };
  }
  const sqlToGetAllReasons = `SELECT * FROM CancellationReasonsType where roleId = ${roleId}`;
  const [result] = await pool.query(sqlToGetAllReasons);
  return { message: "success", data: result };
};

// Function to delete a cancellation reason by unique ID
const deleteCancellationReason = async (req, res) => {
  const cancellationReasonTypeUniqueId =
    req.params.cancellationReasonTypeUniqueId;
  const sqlToDeleteReason = `
    DELETE FROM CancellationReasonsType 
    WHERE cancellationReasonTypeUniqueId = ?
  `;
  const reasonValues = [cancellationReasonTypeUniqueId];

  const [result] = await pool.query(sqlToDeleteReason, reasonValues);
  if (result.affectedRows > 0) {
    return { message: "success" };
  }
  return { message: "error", error: "Failed to delete cancellation reason" };
};

// Function to update a cancellation reason by unique ID
const updateCancellationReason = async (req, res) => {
  const sqlToUpdateReason = `
    UPDATE CancellationReasonsType 
    SET cancellationReason = ?, roleId = ? 
    WHERE cancellationReasonTypeUniqueId = ?
  `;
  const { reason, roleId, cancellationReasonTypeUniqueId } = req.body;
  const reasonValues = [reason, roleId, cancellationReasonTypeUniqueId];

  const [result] = await pool.query(sqlToUpdateReason, reasonValues);
  if (result.affectedRows > 0) {
    return { message: "success" };
  }
  return { message: "error", error: "Failed to update cancellation reason" };
};
const getAllCancellationReasons = async (req, res) => {
  const SqlTodetData = `SELECT * FROM CancellationReasonsType,Roles WHERE CancellationReasonsType.roleId = Roles.roleId`;
  const [result] = await pool.query(SqlTodetData);
  return { message: "success", data: result };
};

module.exports = {
  getSingleCancellationReason,
  getAllCancellationReasons,
  addCancellationReason,
  getCancellationReasons,
  deleteCancellationReason,
  updateCancellationReason,
};
