"use strict";

const { pool } = require("../../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");

const {
  sendSocketIONotificationToAdmin,
} = require("../../Utils/Notifications");
const { getData } = require("../../CRUD/Read/ReadData");
const AppError = require("../../Utils/AppError");

const { transactionStorage } = require("../../Utils/TransactionContext");
const messageTypes = require("../../Utils/MessageTypes");

// Create

// Create
const createUserDeposit = async (data) => {
  const {
    userDepositUniqueId: provideduserDepositUniqueId,
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    accountUniqueId,
    depositTime,
    depositURL,
    depositStatus,
    userDepositCreatedBy,
  } = data;

  // Use provided userDepositUniqueId if available, otherwise generate a new one
  const userDepositUniqueId = provideduserDepositUniqueId || uuidv4();
  const isAutomatic = depositStatus === "PENDING";

  // Check if required fields are provided
  if (!driverUniqueId || !depositAmount || !depositSourceUniqueId) {
    throw new AppError("Missing required fields to create deposit", AppError.BAD_REQUEST);
  }

  // For manual deposits: accountUniqueId and depositTime are REQUIRED
  if (!isAutomatic) {
    if (!accountUniqueId) {
      throw new AppError(
        "accountUniqueId is required for manual deposits",
        AppError.BAD_REQUEST,
      );
    }
    if (!depositTime) {
      throw new AppError("depositTime is required for manual deposits", AppError.BAD_REQUEST);
    }
  }

  // Validate depositAmount
  if (isNaN(depositAmount) || depositAmount <= 0) {
    throw new AppError("Invalid deposit amount", AppError.BAD_REQUEST);
  }

  // Validate depositTime (required for manual, optional for automatic)
  if (depositTime && isNaN(new Date(depositTime).getTime())) {
    throw new AppError("Invalid deposit time", AppError.BAD_REQUEST);
  }
  // Validate depositURL
  if (depositURL && typeof depositURL !== "string") {
    throw new AppError("Invalid deposit URL", AppError.BAD_REQUEST);
  }
  // Validate driverUniqueId
  if (typeof driverUniqueId !== "string" || driverUniqueId.length === 0) {
    throw new AppError("Invalid driver unique ID", AppError.BAD_REQUEST);
  }
  // Validate depositSourceUniqueId
  if (
    typeof depositSourceUniqueId !== "string" ||
    depositSourceUniqueId.length === 0
  ) {
    throw new AppError("Invalid deposit source unique ID", AppError.BAD_REQUEST);
  }
  // Validate accountUniqueId
  if (
    accountUniqueId &&
    (typeof accountUniqueId !== "string" || accountUniqueId.length === 0)
  ) {
    throw new AppError("Invalid account unique ID", AppError.BAD_REQUEST);
  }

  // check if depositURL existed before
  if (depositURL) {
    const existedURL = await getData({
      tableName: "UserDeposit",
      conditions: {
        depositURL: depositURL,
      },
    });
    if (existedURL?.length > 0) {
      return { message: "Deposit URL already exists", data: null };
      // throw new AppError("Deposit URL already exists", AppError.BAD_REQUEST);
    }
  }

  // Default depositStatus to "requested" for manual cases
  const finalDepositStatus = depositStatus || "requested";
  const finalAccountUniqueId = isAutomatic
    ? accountUniqueId || null
    : accountUniqueId;
  const finalDepositTime = isAutomatic
    ? depositTime || currentDate()
    : depositTime;

  // Prepare SQL query
  const sql = `
    INSERT INTO UserDeposit (
      userDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      accountUniqueId,
      depositTime,
      depositURL,
      depositStatus,
      userDepositCreatedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const executor = transactionStorage.getStore() || pool;
  const [insertResult] = await executor.query(sql, [
    userDepositUniqueId,
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    finalAccountUniqueId,
    finalDepositTime,
    depositURL,
    finalDepositStatus,
    userDepositCreatedBy || driverUniqueId,
  ]);
  if (!insertResult.affectedRows) {
    throw new AppError("Failed to insert deposit data", AppError.INTERNAL_SERVER_ERROR);
  }

  // Fetch inserted row via consolidated getter
  const fullData = await getUserDeposit({
    userDepositUniqueId,
    driverUniqueId,
    limit: 1,
  });
  const result = Array.isArray(fullData?.data)
    ? fullData.data[0]
    : fullData?.data;
  sendSocketIONotificationToAdmin({
    message: {
      message: "Deposit created by driver",
      messageType: messageTypes?.create_deposit_By_driver,
      data: result,
    },
  });
  return {
    message: "Deposit created successfully",
    data: result,
  };
};

// Removed specialized GET helpers in favor of consolidated getUserDeposit

module.exports = {
  createUserDeposit,
};

const { getUserDeposit } = require("./read.service");
