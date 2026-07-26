"use strict";

const { pool } = require("../../Middleware/Database.config");

const { fetchDepositData } = require("./helpers.service");
const { currentDate } = require("../../Utils/CurrentDate");
const {
  prepareAndCreateNewBalance,
} = require("../UserBalance.service/UserBalance.post.service");

const AppError = require("../../Utils/AppError");

const { transactionStorage } = require("../../Utils/TransactionContext");

// Create

const deleteUserDepositByUniqueId = async (
  userDepositUniqueId,
  userDepositDeletedBy,
) => {
  if (!userDepositUniqueId || !userDepositDeletedBy) {
    throw new AppError("Missing deposit ID or deleted by", 400);
  }
  const depositData = await fetchDepositData(userDepositUniqueId);
  const { depositAmount, driverUniqueId, depositStatus } = depositData;
  const oldDepositAmount = Number(depositAmount);
  //use soft delete to delete the deposit
  const sql = `update UserDeposit SET userDepositDeletedAt = ?, userDepositDeletedBy = ?  WHERE userDepositUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [
    currentDate(),
    userDepositDeletedBy,
    userDepositUniqueId,
  ]);
  if (result.affectedRows === 0) {
    throw new AppError("Delete failed or deposit not found", 404);
  }
  //update the balance, by deduct the deposit amount if the deposit is approved before like depositStatus === "approved"
  if (depositStatus === "approved") {
    await prepareAndCreateNewBalance({
      addOrDeduct: "deduct",
      amount: oldDepositAmount,
      driverUniqueId,
      transactionType: "Deposit",
      transactionUniqueId: userDepositUniqueId,
      userBalanceAdjustmentType: "reversal",
      userBalanceCreatedBy: userDepositDeletedBy,
    });
  }
  return {
    message: `Deleted: ${userDepositUniqueId}`,
    data: null,
  };
};

/**
 * @function updateUserDepositStatusService
 * @description Updates the deposit status of a specific driver deposit record.
 *
 * @param {string} userDepositUniqueId - The unique ID of the deposit.
 * @param {"approved" | "rejected"} newStatus - The new status to set.
 * @returns {Promise<Object>} - A success or failure response.
 */
// const updateUserDepositStatusService = async ({
//   userDepositUniqueId,
//   newStatus,
//   acceptRejectReason,
// }) => {
//   const allowedStatuses = ["approved", "rejected"];
//   if (!allowedStatuses.includes(newStatus)) {
//     throw new AppError("Invalid deposit status", 400);
//   }

//   // Load deposit using consolidated getter
//   const depositFetch = await getUserDeposit({
//     userDepositUniqueId,
//     limit: 1,
//   });
//   const depositData = Array.isArray(depositFetch?.data)
//     ? depositFetch.data[0]
//     : depositFetch?.data;

//   if (!depositData) {
//     throw new AppError("Deposit not found", 404);
//   }
//   const depositStatus = depositData?.depositStatus;
//   if (newStatus === depositStatus && depositStatus === "approved") {
//     return depositData;
//   }
//   const depositAmount = depositData.depositAmount;
//   const driverUniqueId = depositData.driverUniqueId;

//   await executeInTransaction(async (connection) => {
//     // Only update balance if newStatus is 'approved'
//     if (newStatus === "approved") {
//       // Note: prepareAndCreateNewBalance now throws AppError
//       await prepareAndCreateNewBalance({
//         addOrDeduct: "add",
//         amount: depositAmount,
//         driverUniqueId,
//         transactionType: "Deposit",
//         transactionUniqueId: userDepositUniqueId,
//         userBalanceCreatedBy: driverUniqueId,
//       });
//     }

//     // Update deposit status
//     const sql = `UPDATE UserDeposit SET depositStatus = ?, acceptRejectReason = ? WHERE userDepositUniqueId = ?`;
//     const [updateResult] = await connection.query(sql, [
//       newStatus,
//       acceptRejectReason || "null",
//       userDepositUniqueId,
//     ]);

//     if (updateResult.affectedRows === 0) {
//       throw new AppError("Deposit not found or already updated", 404);
//     }
//   });

//   // Fetch updated deposit data with enriched fields
//   const updatedDepositFetch = await getUserDeposit({
//     userDepositUniqueId,
//     limit: 1,
//   });
//   return Array.isArray(updatedDepositFetch?.data)
//     ? updatedDepositFetch.data[0]
//     : updatedDepositFetch?.data;
// };

/**
 * Fetch a single deposit by its unique ID. Throws if not found.
 */

module.exports = {
  deleteUserDepositByUniqueId,
};
