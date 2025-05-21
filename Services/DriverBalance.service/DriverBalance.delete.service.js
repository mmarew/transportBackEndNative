const { pool } = require("../../Middleware/Database.config");

// Delete a driver balance record by ID
const deleteDriverBalance = async (driverBalanceUniqueId) => {
  try {
    const sql = `DELETE FROM DriverBalance WHERE driverBalanceUniqueId = ?`;
    const [result] = await pool.query(sql, [driverBalanceUniqueId]);

    if (result.affectedRows === 0) {
      return { message: "error", error: "Driver balance not found" };
    }

    return {
      message: "success",
      data: "Balance record deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteDriverBalance:", error);
    return { message: "error", error: "Unable to delete driver balance" };
  }
};
module.exports = { deleteDriverBalance };
