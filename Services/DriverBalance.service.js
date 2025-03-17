const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new driver balance record
exports.createDriverBalance = async (data) => {
  try {
    console.log("@createDriverBalance data is ", data);
    // Verify existence of data transactionUniqueId in DriverBalance
    const sqlToGetData = `
      SELECT * FROM DriverBalance 
      WHERE transactionUniqueId = ? AND transactionType = ?
    `;
    const [existingRecords] = await pool.query(sqlToGetData, [
      data.transactionUniqueId,
      data.transactionType,
    ]);

    if (existingRecords.length > 0) {
      return {
        message: "error",
        error: "Driver balance record already exists",
        data: existingRecords,
      };
    }

    const sqlInsert = `
      INSERT INTO DriverBalance (
        driverBalanceUniqueId, userUniqueId, transactionType, 
        transactionUniqueId, transactionTime, netBalance
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [
      uuidv4(),
      data.userUniqueId,
      data.transactionType,
      data.transactionUniqueId,
      new Date(),
      data.netBalance,
    ];

    const [insertResult] = await pool.query(sqlInsert, values);

    return {
      message: "Driver balance record created successfully",
      data: insertResult,
    };
  } catch (error) {
    console.error("Error in createDriverBalance:", error);
    return { message: "error", error: "Unable to create driver balance" };
  }
};

// Get all driver balance records
exports.getAllDriverBalances = async () => {
  try {
    const sql = `SELECT * FROM DriverBalance ORDER BY driverBalanceId DESC`;
    const [result] = await pool.query(sql);
    return {
      message: "success",
      data: result,
    };
  } catch (error) {
    console.error("Error in getAllDriverBalances:", error);
    return { message: "error", error: "Unable to retrieve driver balances" };
  }
};

// Get a driver balance record by ID
exports.getDriverBalanceById = async (driverBalanceUniqueId) => {
  try {
    const sql = `SELECT * FROM DriverBalance WHERE driverBalanceUniqueId = ?`;
    const [result] = await pool.query(sql, [driverBalanceUniqueId]);

    if (result.length === 0) {
      return { message: "error", error: "Driver balance not found" };
    }

    return {
      message: "success",
      data: result[0],
    };
  } catch (error) {
    console.error("Error in getDriverBalanceById:", error);
    return { message: "error", error: "Unable to retrieve driver balance" };
  }
};

// Get the last driver balance record by userUniqueId
exports.getDriverLastBalanceByUserUniqueId = async (userUniqueId) => {
  try {
    const sql = `
      SELECT * FROM DriverBalance 
      WHERE userUniqueId = ? 
      ORDER BY driverBalanceId DESC 
      LIMIT 1
    `;
    const [result] = await pool.query(sql, [userUniqueId]);
    return {
      message: "success",
      data: result.length > 0 ? result[0] : null,
    };
  } catch (error) {
    console.error("Error in getDriverLastBalanceByUserUniqueId:", error);
    return { message: "error", error: "Unable to get driver balance" };
  }
};

// Update a driver balance record by ID
exports.updateDriverBalance = async (driverBalanceUniqueId, data) => {
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

// Delete a driver balance record by ID
exports.deleteDriverBalance = async (driverBalanceUniqueId) => {
  try {
    const sql = `DELETE FROM DriverBalance WHERE driverBalanceUniqueId = ?`;
    const [result] = await pool.query(sql, [driverBalanceUniqueId]);

    if (result.affectedRows === 0) {
      return { message: "error", error: "Driver balance not found" };
    }

    return {
      message: "Driver balance record deleted successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error in deleteDriverBalance:", error);
    return { message: "error", error: "Unable to delete driver balance" };
  }
};
