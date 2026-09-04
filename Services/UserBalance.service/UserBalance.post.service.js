const logger = require("../../Utils/logger");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");

const getDriverLastBalance = async (driverUniqueId, connection = null) => {
  const sql = `
    SELECT *
    FROM UserBalance
    WHERE userUniqueId = ?
    ORDER BY userBalanceId DESC
    LIMIT 1
  `;
  const executor = transactionStorage.getStore() || connection || pool;
  const [result] = await executor.query(sql, [driverUniqueId]);

  if (result.length === 0) {
    throw new AppError("No balance record found", AppError.NOT_FOUND);
  }

  return result[0];
};

// create new balance by adding or deducting amount from current balance
const prepareAndCreateNewBalance = async ({
  amount,
  addOrDeduct,
  driverUniqueId,
  transactionUniqueId,
  transactionType,
  isFree,
  userBalanceCreatedBy,
}) => {
  //  validation to all incoming args
  if (
    !amount ||
    !addOrDeduct ||
    !driverUniqueId ||
    !transactionUniqueId ||
    !transactionType
  ) {
    throw new AppError("All balance inputs are required", AppError.BAD_REQUEST);
  }

  let netBalance = 0;
  try {
    const currentBalance = await getDriverLastBalance(driverUniqueId);
    logger.debug(
      "prepareAndCreateNewBalance ~ currentBalance:",
      currentBalance,
    );
    netBalance = Number(currentBalance?.netBalance || 0);
  } catch {
    // If no previous balance, netBalance remains 0
  }

  // Deductions are allowed to drive the net balance negative (debt): 0 or
  // insufficient balance does NOT block a deduction (e.g. a commission). The
  // resulting deficit is a driver debt against the platform.
  const newBalance =
    addOrDeduct === "add"
      ? netBalance + Number(amount)
      : netBalance - Number(amount);

  if (addOrDeduct === "add" && newBalance <= 0 && Number(amount) > 0) {
    throw new AppError("User balance overflow or incorrect addition", AppError.BAD_REQUEST);
  }

  const newNetBalanceData = {
    userUniqueId: driverUniqueId,
    transactionType,
    transactionUniqueId,
    netBalance: newBalance,
    userBalanceCreatedBy,
  };
  return await createUserBalance(newNetBalanceData);
};

const createUserBalance = async (data, connection = null) => {
  logger.debug("createUserBalance ~ data:", data);
  const executor = transactionStorage.getStore() || connection || pool;
  // Verify existence of data transactionUniqueId in userBalance
  const transactionTime = currentDate();
  const sqlToGetData = `
    SELECT * FROM UserBalance 
    WHERE transactionUniqueId = ? AND transactionType = ?
  `;
  const targetedTransactionType = data?.transactionType;
  const [existingRecords] = await executor.query(sqlToGetData, [
    data.transactionUniqueId,
    targetedTransactionType,
  ]);

  if (targetedTransactionType === "Transfer") {
    // eslint-disable-next-line no-magic-numbers -- transfer matching requires both records
    if (existingRecords.length >= 2) {
      return existingRecords[0];
    }
  } else if (existingRecords.length > 0) {
    return existingRecords[0];
  }

  const adjustmentType = data?.userBalanceAdjustmentType || "creation";
  const sqlInsert = `
    INSERT INTO UserBalance (
      userBalanceUniqueId, userUniqueId, transactionType, 
      transactionUniqueId, transactionTime, netBalance,
      userBalanceAdjustmentType, userBalanceCreatedBy, userBalanceCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const userBalanceUniqueId = uuidv4();
  const userUniqueId = data?.userUniqueId;
  const transactionType = data?.transactionType;
  const transactionUniqueId = data?.transactionUniqueId;
  const netBalance = data?.netBalance;
  const userBalanceCreatedBy = data?.userBalanceCreatedBy || userUniqueId;
  const values = [
    userBalanceUniqueId,
    userUniqueId,
    transactionType,
    transactionUniqueId,
    transactionTime,
    netBalance,
    adjustmentType,
    userBalanceCreatedBy,
    currentDate(),
  ];

  await executor.query(sqlInsert, values);

  return {
    userBalanceUniqueId,
    userUniqueId,
    transactionType,
    transactionUniqueId,
    transactionTime,
    netBalance,
  };
};

module.exports = { createUserBalance, prepareAndCreateNewBalance };
