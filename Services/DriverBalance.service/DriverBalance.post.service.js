const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const currentDate = require("../../Utils/CurrentDate");

const getDriverLastBalance = async (driverUniqueId) => {
  const sql = `
    SELECT *
    FROM DriverBalance
    WHERE userUniqueId = ?
    ORDER BY transactionTime DESC
    LIMIT 1
  `;
  const [result] = await pool.query(sql, [driverUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "No balance record found" };
};
const prepareAndCreateNewBalance = async ({
  amount,
  addOrDeduct,
  driverUniqueId,
  transactionUniqueId,
  transactionType,
}) => {
  //  validation to all incoming args
  if (
    !amount ||
    !addOrDeduct ||
    !driverUniqueId ||
    !transactionUniqueId ||
    !transactionType
  ) {
    return { message: "error", error: "All balance inputs are required" };
  }
  const currentBalance = await getDriverLastBalance(driverUniqueId);
  let netBalance = currentBalance?.data?.netBalance;

  if (!netBalance) netBalance = 0;
  netBalance = Number(netBalance);

  // check if there is enough balance to be deducted before deduct if addOrDeduct is deduct
  if (addOrDeduct === "deduct") {
    if (netBalance < Number(amount) || netBalance == 0)
      return {
        message: `error`,
        error: `no enough balance`,
        details: `user don't have enough balance to deduct`,
      };
  }
  const newBalance =
    addOrDeduct === "add"
      ? netBalance + Number(amount)
      : netBalance - Number(amount);
  if (addOrDeduct === "add" && newBalance <= 0) {
    return {
      message: `error`,
      error: `no enough balance`,
      details: `user balance is not added correctly`,
    };
  }
  const newNetBalanceData = {
    userUniqueId: driverUniqueId,
    transactionType,
    transactionUniqueId,
    netBalance: newBalance,
  };
  return await createDriverBalance(newNetBalanceData);
};
const createDriverBalance = async (data) => {
  try {
    console.log("@createDriverBalance data is ", data);
    // Verify existence of data transactionUniqueId in DriverBalance
    const transactionTime = currentDate();
    const sqlToGetData = `
      SELECT * FROM DriverBalance 
      WHERE transactionUniqueId = ? AND transactionType = ?
    `;
    const targetedTransactionType = data?.transactionType;
    const [existingRecords] = await pool.query(sqlToGetData, [
      data.transactionUniqueId,
      targetedTransactionType,
    ]);
    console.log(
      "@targetedTransactionType",
      targetedTransactionType,
      "@existingRecords",
      existingRecords
    );
    // return;
    if (targetedTransactionType === "Transfer") {
      if (existingRecords.length >= 2) {
        return {
          message: "success",
          // error: "Driver balance record already exists",
          data: existingRecords?.[0],
          details: "already existed data",
        };
      }
    } else if (existingRecords.length > 0) {
      return {
        message: "success",
        // error: "Driver balance record already exists",
        data: existingRecords?.[0],
        details: "already existed data",
      };
    }

    const sqlInsert = `
      INSERT INTO DriverBalance (
        driverBalanceUniqueId, userUniqueId, transactionType, 
        transactionUniqueId, transactionTime, netBalance
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    const driverBalanceUniqueId = uuidv4();
    const userUniqueId = data?.userUniqueId;
    const transactionType = data?.transactionType;
    const transactionUniqueId = data?.transactionUniqueId;
    const netBalance = data?.netBalance;
    const values = [
      driverBalanceUniqueId,
      userUniqueId,
      transactionType,
      transactionUniqueId,
      transactionTime,
      netBalance,
    ];
    const responseData = {
      driverBalanceUniqueId,
      userUniqueId,
      transactionType,
      transactionUniqueId,
      transactionTime,
      netBalance,
    };
    const [insertResult] = await pool.query(sqlInsert, values);

    return {
      message: "success",
      data: responseData,
    };
  } catch (error) {
    console.error("Error in createDriverBalance:", error);
    return { message: "error", error: "Unable to create driver balance" };
  }
};
module.exports = { createDriverBalance, prepareAndCreateNewBalance };
