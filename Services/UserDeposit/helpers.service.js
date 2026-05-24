"use strict";

const {
  pool
} = require("../../Middleware/Database.config");





const AppError = require("../../Utils/AppError");




// Create

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
async function fetchDepositData(userDepositUniqueId) {
  const depositFetch = await getUserDeposit({
    userDepositUniqueId,
    limit: 1
  });
  const depositData = Array.isArray(depositFetch?.data) ? depositFetch.data[0] : depositFetch?.data;
  if (!depositData) {
    throw new AppError("Deposit not found", 404);
  }
  return depositData;
}

/**
 * Extract allowed update fields and build the SET clause. Throws if no updatable fields.
 */

/**
 * Extract allowed update fields and build the SET clause. Throws if no updatable fields.
 */
function getUpdateFields(data) {
  const excludedFields = ["userDepositUniqueId", "userDepositId", "userDepositCreatedBy", "userDepositCreatedAt"];
  const allowedFields = Object.keys(data).filter(key => !excludedFields.includes(key));
  if (allowedFields.length === 0) {
    throw new AppError("No valid fields to update", 400);
  }
  const setClause = allowedFields.map(field => `${field} = ?`).join(", ");
  const values = allowedFields.map(field => data[field]);
  return {
    setClause,
    values
  };
}

module.exports = {
  fetchDepositData,
  getUpdateFields
};
