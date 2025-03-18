const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  getDriverLastBalanceByUserUniqueId,
  createDriverBalance,
} = require("./DriverBalance.service");

// Create a new driver deposit record
exports.createDriverDeposit = async (data) => {
  try {
    const userUniqueId = data.user.userUniqueId;
    const clientSideRequestId = data.clientSideRequestId;
    // verify if clientSideRequestId existed in DriverDeposit table and if it does not exist, create a new record
    const sql = `INSERT INTO DriverDeposit (
        driverDepositUniqueId,
        driverUniqueId,
        depositAmount,
        depositTime
      ) VALUES (?, ?, ?, ?) `;
    const depositAmount = data.depositAmount;
    const driverDepositUniqueId = uuidv4();
    const values = [
      driverDepositUniqueId,
      userUniqueId,
      depositAmount,
      new Date(),
    ];
    const [result] = await pool?.query(sql, values);
    const lastDriverBalance = await getDriverLastBalanceByUserUniqueId(
      userUniqueId
    );
    const previousNetBalance = lastDriverBalance?.data?.netBalance;
    const currnetNetBalance =
      parseFloat(previousNetBalance ? previousNetBalance : 0) +
      parseFloat(data.depositAmount);

    const balanceData = {
      userUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: driverDepositUniqueId,
      netBalance: currnetNetBalance,
    };

    await createDriverBalance(balanceData);

    return {
      message: "success",
      data: { currnetNetBalance },
    };
  } catch (error) {
    console.error("Error in createDriverDeposit:", error);
    return { message: "error", error };
  }
};

// Get all driver deposit records
exports.getAllDriverDeposits = async () => {
  try {
    const sql = `SELECT * FROM DriverDeposit ORDER BY driverDepositId DESC`;
    const [result] = await pool.query(sql);
    return { message: "success", data: result };
  } catch (error) {
    console.error("Error in getAllDriverDeposits:", error);
    return { message: "error", error };
  }
};

exports.getDriverDepositByUserUniquId = async (userUniqueId) => {
  try {
    const sql = `select * from  DriverDeposit where driverUniqueId=?`;
    const [result] = await pool.query(sql, [userUniqueId]);
    return { message: "success", data: result };
  } catch (error) {
    console.error("Error in getDriverDepositByUserUniquId:", error);
    return { message: "error", error };
  }
};

// Get a driver deposit record by ID
exports.getDriverDepositByDriverDepositUniqueId = async (
  driverDepositUniqueId
) => {
  try {
    const sql = `SELECT * FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
    const [result] = await pool.query(sql, [driverDepositUniqueId]);
    return { message: "success", data: result };
  } catch (error) {
    console.error("Error in getDriverDepositById:", error);
    return { message: "error", error };
  }
};

// Update a driver deposit record by ID
exports.updateDriverDeposit = async (driverDepositUniqueId, data) => {
  try {
    const sql = `
      UPDATE DriverDeposit
      SET driverUniqueId = ?, amount = ?, commissionId = ?, depositTime = ?
      WHERE driverDepositId = ?
    `;
    const values = [
      data.driverUniqueId,
      data.amount,
      data.commissionId,
      data.depositTime,
      driverDepositUniqueId,
    ];
    const [result] = await pool.query(sql, values);
    return { message: "success", data: result };
  } catch (error) {
    console.error("Error in updateDriverDeposit:", error);
    return { message: "error", error };
  }
};

// Delete a driver deposit record by ID
exports.deleteDriverDeposit = async (id) => {
  try {
    const sql = `DELETE FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
    const [result] = await pool.query(sql, [id]);
    return { message: "success", data: result };
  } catch (error) {
    console.error("Error in deleteDriverDeposit:", error);
    return { message: "error", error };
  }
};
