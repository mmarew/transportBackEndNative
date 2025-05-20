const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { prepareAndCreateNewBalance } = require("./DriverBalance.service");

// Create
const createDriverDeposit = async (data) => {
  const driverDepositUniqueId = uuidv4();
  const {
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
  } = data;
  console.log("@prepareAndCreateNewBalance", prepareAndCreateNewBalance);
  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "add",
    amount: depositAmount,
    driverUniqueId,
    transactionType: "Deposit",
    transactionUniqueId: driverDepositUniqueId,
  });
  if (newBalance.message == "error") return newBalance;
  const sql = `
    INSERT INTO DriverDeposit (
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      accountUniqueId,
      depositTime
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  await pool.query(sql, [
    driverDepositUniqueId,
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
  ]);

  return {
    message: "success",
    data: {
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      accountUniqueId,
      depositTime,
    },
  };
};
// Get all data
const getAllDriverDepositData = async () => {
  const sql = `select * from DriverDeposit`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};
// Get All (with account + source info)
const getDriverDepositsWithAccountInfo = async (driverUniqueId) => {
  let sql = `
    SELECT 
      d.driverDepositId,
      d.driverDepositUniqueId,
      d.driverUniqueId,
      d.depositAmount,
      d.depositSourceUniqueId,
      d.accountUniqueId,
      d.depositTime,
      d.createdAt,

      a.institutionName,
      a.accountHolderName,
      a.accountNumber,
      a.accountType,

      s.sourceKey,
      s.sourceLabel

    FROM DriverDeposit d
    LEFT JOIN FinancialInstitutionAccounts a ON d.accountUniqueId = a.accountUniqueId
    LEFT JOIN DepositSource s ON d.depositSourceUniqueId = s.depositSourceUniqueId
  `;

  const values = [];
  if (driverUniqueId) {
    sql += ` WHERE d.driverUniqueId = ?`;
    values.push(driverUniqueId);
  }

  sql += ` ORDER BY d.depositTime DESC`;

  const [result] = await pool.query(sql, values);
  return { message: "success", data: result };
};

// Get by ID
const getDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Deposit not found" };
};

// Update
const updateDriverDepositByUniqueId = async (driverDepositUniqueId, data) => {
  const {
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
  } = data;

  const sql = `
    UPDATE DriverDeposit SET
      driverUniqueId = ?,
      depositAmount = ?,
      depositSourceUniqueId = ?,
      accountUniqueId = ?,
      depositTime = ?
    WHERE driverDepositUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
    driverDepositUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: { driverDepositUniqueId, ...data },
      }
    : { message: "error", error: "Update failed or deposit not found" };
};

// Delete
const deleteDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `DELETE FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: `Deleted: ${driverDepositUniqueId}` }
    : { message: "error", error: "Delete failed or deposit not found" };
};

module.exports = {
  getAllDriverDepositData,
  createDriverDeposit,
  getDriverDepositsWithAccountInfo,
  getDriverDepositByUniqueId,
  updateDriverDepositByUniqueId,
  deleteDriverDepositByUniqueId,
};
