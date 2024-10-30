const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
// Function to add a cancellation reason
const addCancellationReason = async (body) => {
  try {
    const cancellationReasonTypeUniqueId = uuidv4();
    const roleId = body.cancellationByRoleId;
    const cancellationReason = body.reason;

    // Check if the reason already exists
    const isAvailable = await getData({
      tableName: "CancellationReasonsType",
      conditions: { cancellationReason },
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
    console.error("Error adding cancellation reason:", error);
    return {
      message: "error",
      data: "Cancellation reason registration failed",
    };
  }
};

// Function to get all cancellation reasons
const getCancellationReasons = async () => {
  const sqlToGetAllReasons = `SELECT * FROM CancellationReasonsType`;
  const [result] = await pool.query(sqlToGetAllReasons);
  return { message: "success", data: result };
};

// Function to delete a cancellation reason by unique ID
const deleteCancellationReason = async (req, res) => {
  const sqlToDeleteReason = `
    DELETE FROM CancellationReasonsType 
    WHERE cancellationReasonTypeUniqueId = ?
  `;
  const cancellationReasonTypeUniqueId =
    req.body.cancellationReasonTypeUniqueId;
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

module.exports = {
  addCancellationReason,
  getCancellationReasons,
  deleteCancellationReason,
  updateCancellationReason,
};
