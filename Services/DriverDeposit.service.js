const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  getDriverLastBalanceByUserUniqueId,
  createDriverBalance,
} = require("./DriverBalance.service");

// Create a new driver deposit record
exports.createDriverDeposit = async (data) => {
  const userUniqueId = data.user.userUniqueId;
  const clientSideRequestId = data.clientSideRequestId;
  // verify if clientSideRequestId existed in DriverDeposit table and if it does not exist, create a new record
  const sql = `
    INSERT INTO DriverDeposit (
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositTime
    ) VALUES (?, ?, ?, ?)
  `;
  const driverDepositUniqueId = uuidv4();
  const values = [
    driverDepositUniqueId,
    userUniqueId,
    data.depositAmount,
    new Date(),
  ];
  const [result] = await pool.query(sql, values);
  const lastDriverBalance = await getDriverLastBalanceByUserUniqueId(
    userUniqueId
  );
  const previousNetBalance = lastDriverBalance?.netBalance;
  const currnetNetBalance =
    parseFloat(previousNetBalance ? previousNetBalance : 0) +
    parseFloat(data.depositAmount);
  console.log("previousNetBalance", previousNetBalance);
  console.log("currnetNetBalance", currnetNetBalance);
  const balanceData = {
    userUniqueId,
    transactionType: "deposit",
    transactionUniqueId: driverDepositUniqueId,
    netBalance: currnetNetBalance,
  };
  await createDriverBalance(balanceData);
  return {
    message: "Driver deposit record created successfully",
    data: result,
  };
};

// Get all driver deposit records
exports.getAllDriverDeposits = async () => {
  const sql = `SELECT * FROM DriverDeposit ORDER BY driverDepositId DESC`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a driver deposit record by ID
exports.getDriverDepositById = async (driverDepositUniqueId) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);
  return result[0];
};

// Update a driver deposit record by ID
exports.updateDriverDeposit = async (driverDepositUniqueId, data) => {
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
  return {
    message: "Driver deposit record updated successfully",
    data: result,
  };
};

// Delete a driver deposit record by ID
exports.deleteDriverDeposit = async (id) => {
  const sql = `DELETE FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);
  return {
    message: "Driver deposit record deleted successfully",
    data: result,
  };
};
