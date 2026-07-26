"use strict";

const {
  pool
} = require("../../Middleware/Database.config");

const {
  currentDate
} = require("../../Utils/CurrentDate");
const {
  prepareAndCreateNewBalance
} = require("../UserBalance.service/UserBalance.post.service");


const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");


// Create

// Removed extra getters (with account info, by ID, etc.) to keep a single GET service

/**
 * Dynamically updates only the fields provided in the data object.
 * Excludes userDepositUniqueId and userDepositId from updates.
 * If depositStatus is being changed to 'approved', adds balance to user account.
 * @param {string} userDepositUniqueId - The unique ID of the deposit to update
 * @param {Object} data - Key-value pairs of columns to update
 * @returns {Object} Success or error message
 */
const updateUserDepositByUniqueId = async (userDepositUniqueId, data) => {
  if (!userDepositUniqueId || !data || Object.keys(data).length === 0) {
    throw new AppError("Missing deposit ID or update data", 400);
  }

  // Check if depositStatus is being changed to 'approved', it shows if user need to approve the deposit
  const isApproving = data.depositStatus === "approved";
  const userDepositCreatedOrUpdatedBy = data.userDepositCreatedOrUpdatedBy;
  // Get current deposit data to check status and get amount
  const depositFetch = await getUserDeposit({
    userDepositUniqueId,
    limit: 1
  });
  const depositData = Array.isArray(depositFetch?.data) ? depositFetch?.data?.[0] : depositFetch?.data;
  if (!depositData) {
    throw new AppError("Deposit not found", 404);
  }
  const oldDepositAmount = depositData?.depositAmount;
  const driverUniqueId = depositData?.driverUniqueId;
  const depositStatus = depositData?.depositStatus;
  const applyDepositUpdate = async (executor, updateData, uniqueId) => {
    const excludedFields = ["userDepositUniqueId", "userDepositId", "userDepositCreatedBy", "userDepositCreatedAt", "userDepositCreatedOrUpdatedBy" // not a DB column; used only for balance userBalanceCreatedBy
    ];
    const allowedFields = Object.keys(updateData).filter(key => !excludedFields.includes(key));
    if (allowedFields.length === 0) {
      throw new AppError("No valid fields to update", 400);
    }
    const setClause = allowedFields.map(field => `${field} = ?`).join(", ");
    const values = allowedFields.map(field => updateData[field]);
    const sql = `UPDATE UserDeposit SET ${setClause}, userDepositUpdatedAt = ? WHERE userDepositUniqueId = ?`;
    const [result] = await executor.query(sql, [...values, currentDate(), uniqueId]);
    if (result.affectedRows === 0) {
      throw new AppError("Deposit not found or update failed", 404);
    }
    return result;
  };

  //approve the deposit if it was not approved before and current request is to approve it
  if (isApproving && depositStatus !== "approved") {
    // When approving, use new amount from payload if provided so we add balance once with the final amount (avoids add old then deduct old + add new)
    const amountToAdd = data.depositAmount !== undefined && data.depositAmount !== null ? Number(data.depositAmount) : Number(oldDepositAmount);

    // 1. Add balance for approved deposit (single operation with correct amount)
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: amountToAdd,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
    // 2. Update deposit with provided data
    await applyDepositUpdate(transactionStorage.getStore() || pool, data, userDepositUniqueId);

    // Fetch updated deposit data
    const updatedDepositFetch = await getUserDeposit({
      userDepositUniqueId,
      limit: 1
    });
    const updatedData = Array.isArray(updatedDepositFetch?.data) ? updatedDepositFetch.data[0] : updatedDepositFetch?.data;
    return {
      message: "Deposit updated successfully",
      data: updatedData
    };
  }

  // Not approving, just do regular update
  await applyDepositUpdate(transactionStorage.getStore() || pool, data, userDepositUniqueId);

  //if depositAmount is changed, update the balance, by deduct the old amount and add the new amount
  const newDepositAmount = data.depositAmount;
  if (newDepositAmount && newDepositAmount !== oldDepositAmount) {
    // Reversal: deduct the old amount (undo original add). Adjustment: add the new amount.
    await prepareAndCreateNewBalance({
      addOrDeduct: "deduct",
      amount: oldDepositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceAdjustmentType: "reversal",
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: newDepositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceAdjustmentType: "adjustment",
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
  }

  // Fetch updated deposit data
  const updatedDepositFetch = await getUserDeposit({
    userDepositUniqueId,
    limit: 1
  });
  const updatedData = Array.isArray(updatedDepositFetch?.data) ? updatedDepositFetch.data[0] : updatedDepositFetch?.data;
  return {
    message: "Deposit updated successfully",
    data: updatedData
  };
};

const updateUserDepositStatusService = async (userDepositUniqueId, data) => {
  if (!userDepositUniqueId || !data || Object.keys(data).length === 0) {
    throw new AppError("Missing deposit ID or update data", 400);
  }
  if (data.depositAmount !== undefined && data.depositAmount < 0) {
    throw new AppError("Deposit amount cannot be negative", 400);
  }
  const oldDepositData = await fetchDepositData(userDepositUniqueId);
  const {
    depositAmount,
    driverUniqueId,
    depositStatus
  } = oldDepositData;
  let oldDepositStatus = depositStatus;
  let oldDepositAmount = Number(depositAmount);
  const isApproving = data.depositStatus === "approved" && oldDepositStatus !== "approved";
  const userDepositCreatedOrUpdatedBy = data.userDepositCreatedOrUpdatedBy;
  const {
    setClause,
    values
  } = getUpdateFields(data);
  const executor = transactionStorage.getStore() || pool;
  logger.info("Updating deposit", {
    userDepositUniqueId,
    oldAmount: oldDepositAmount,
    newAmount: data.depositAmount,
    status: data.depositStatus,
    isApproving
  });
  const updateSql = `UPDATE UserDeposit SET ${setClause}, userDepositUpdatedAt = ? WHERE userDepositUniqueId = ?`;
  const [updateResult] = await executor.query(updateSql, [...values, currentDate(), userDepositUniqueId]);
  if (updateResult.affectedRows === 0) {
    throw new AppError("Deposit not found or update failed", 404);
  }
  const newDepositAmount = Number(data.depositAmount);
  if (isApproving) {
    const amountToAdd = data.depositAmount !== undefined && data.depositAmount !== null ? Number(data.depositAmount) : Number(oldDepositAmount);
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: amountToAdd,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
    // update oldDepositStatus to approved
    oldDepositStatus = "approved";
  }
  //if there is a given depositAmount and it is changed, update the balance, by deduct the old amount and add the new amount
  else if (newDepositAmount !== undefined && newDepositAmount !== oldDepositAmount && oldDepositStatus === "approved") {
    await prepareAndCreateNewBalance({
      addOrDeduct: "deduct",
      amount: oldDepositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceAdjustmentType: "reversal",
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: newDepositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceAdjustmentType: "adjustment",
      userBalanceCreatedBy: userDepositCreatedOrUpdatedBy
    });
  }
  const updatedData = await fetchDepositData(userDepositUniqueId);
  return {
    message: "Deposit status updated successfully",
    data: updatedData
  };
};
/**
 * Initiates a payment process using the SantimPay service.
 * 
 * This service function:
 * 1. Ensures the "santimpay" deposit source exists.
 * 2. Creates a pending deposit record in the local database.
 * 3. Generates a signed payment URL from SantimPay using ES256 algorithm.
 * 4. Returns the payment URL for the client to redirect the user.
 * 
 * @param {Object} params - The initialization parameters.
 * @param {string} params.driverUniqueId - The unique ID of the driver making the deposit.
 * @param {number|string} params.depositAmount - The amount to deposit in ETB.
 * @param {string} [params.phoneNumber=""] - Optional phone number for the payment gateway.
 * @returns {Promise<Object>} - An object containing the transaction ID, payment URL, amount, and status.
 * @throws {AppError} - If deposit source creation fails or payment initiation fails.
 */

module.exports = {
  updateUserDepositByUniqueId,
  updateUserDepositStatusService
};


const { getUserDeposit } = require("./read.service");
const { fetchDepositData } = require("./read.service");
const { getUpdateFields } = require("./helpers.service");