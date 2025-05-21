const updateDriverBalance = async (driverBalanceUniqueId, data) => {
  try {
    const sql = `
      UPDATE DriverBalance
      SET userUniqueId = ?, transactionType = ?, 
          transactionUniqueId = ?, transactionTime = ?, netBalance = ?
      WHERE driverBalanceUniqueId = ?
    `;
    const values = [
      data.userUniqueId,
      data.transactionType,
      data.transactionUniqueId,
      data.transactionTime,
      data.netBalance,
      driverBalanceUniqueId,
    ];

    const [result] = await pool.query(sql, values);

    if (result.affectedRows === 0) {
      return { message: "error", error: "Driver balance not found" };
    }

    return {
      message: "Driver balance record updated successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in updateDriverBalance:", error);
    return { message: "error", error: "Unable to update driver balance" };
  }
};
module.exports = { updateDriverBalance };
