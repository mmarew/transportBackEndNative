const { pool } = require("../../Middleware/Database.config");
const { getDriverDepositByUniqueId } = require("../DriverDeposit.service");
const { getTransferByUniqueId } = require("../DriverBalanceTransfer.service");
const { getRefundByUniqueId } = require("../DriverRefund.service");
const {
  getDriverSubscriptionByUniqueId,
} = require("../DriverSubscription.service");
const {
  getCommissionsByCommissionUniqueId,
} = require("../CommissionRates.service");
// enrichDriverBalanceRecord.js
const enrichDriverBalanceRecord = async (balance) => {
  console.log("@balance", balance);
  const { transactionType, transactionUniqueId } = balance;
  let transactionDetails = null;

  try {
    if (transactionType === "Deposit") {
      transactionDetails = await getDriverDepositByUniqueId(
        transactionUniqueId
      );
    } else if (transactionType === "Commission") {
      transactionDetails = await getCommissionsByCommissionUniqueId(
        transactionUniqueId
      );
    } else if (transactionType === "Transfer") {
      transactionDetails = await getTransferByUniqueId(transactionUniqueId);
    } else if (transactionType === "Refund") {
      transactionDetails = await getRefundByUniqueId(transactionUniqueId);
    } else if (transactionType === "Subscription") {
      transactionDetails = await getDriverSubscriptionByUniqueId(
        transactionUniqueId
      );
    } else {
      console.warn(`Unknown transaction type: ${transactionType}`);
    }

    return {
      ...balance,
      transactionDetails,
    };
  } catch (err) {
    console.error(
      `Error enriching balance for ${transactionType} (${transactionUniqueId}):`,
      err.message
    );
    return {
      ...balance,
      transactionDetails: null,
      error: "Failed to load transaction details",
    };
  }
};

const getAllDriverBalances = async () => {
  try {
    const sql = `SELECT * FROM DriverBalance ORDER BY driverBalanceId DESC`;
    const [results] = await pool.query(sql);

    const enrichedResults = await Promise.all(
      results.map(enrichDriverBalanceRecord)
    );

    return {
      message: "success",
      data: enrichedResults,
    };
  } catch (error) {
    console.error("Error in getAllDriverBalances:", error);
    return {
      message: "error",
      error: "Unable to retrieve driver balances",
    };
  }
};

// Get a driver balance record by ID
const getDriverBalanceById = async (driverBalanceUniqueId) => {
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
const getDriverLastBalanceByUserUniqueId = async (userUniqueId) => {
  try {
    const sql = `
      SELECT * FROM DriverBalance 
      WHERE userUniqueId = ? 
      ORDER BY driverBalanceId DESC 
      LIMIT 1
    `;
    const [results] = await pool.query(sql, [userUniqueId]);

    if (results.length === 0) {
      return { message: "error", error: "Driver balance not found" };
    }

    // Enrich the last balance record using the same logic as getDriverBalanceByDateRange
    const record = results[0];
    let TransactionData = { ...record };
    const transactionUniqueId = record?.transactionUniqueId;

    if (record.transactionType === "Deposit") {
      const result = await getDriverDepositByUniqueId(transactionUniqueId);
      if (result?.message == "success" && typeof result?.data == "object")
        TransactionData = { ...record, ...result?.data };
    } else if (record.transactionType === "Commission") {
      const commissionData = await getCommissionsByCommissionUniqueId(
        record.transactionUniqueId
      );
      const data = commissionData?.data?.[0];
      if (commissionData?.message == "success" && typeof data == "object")
        TransactionData = { ...record, ...data };
    } else if (record.transactionType === "Subscription") {
      const SubscriptionData = await getDriverSubscriptionByUniqueId(
        record?.transactionUniqueId
      );
      if (
        SubscriptionData?.message == "success" &&
        typeof SubscriptionData?.data == "object"
      ) {
        TransactionData = { ...record, ...SubscriptionData?.data };
      }
    } else if (record.transactionType === "Transfer") {
      const transferData = await getTransferByUniqueId(
        record.transactionUniqueId
      );
      if (
        transferData?.message == "success" &&
        typeof transferData?.data == "object"
      ) {
        TransactionData = { ...record, ...transferData?.data };
      }
    } else if (record.transactionType === "Refund") {
      const refundData = await getRefundByUniqueId(record.transactionUniqueId);
      if (
        refundData?.message == "success" &&
        typeof refundData?.data == "object"
      ) {
        TransactionData = { ...record, ...refundData?.data };
      }
    }

    return {
      message: "success",
      data: TransactionData,
    };
  } catch (error) {
    console.error("Error in getDriverLastBalanceByUserUniqueId:", error);
    return { message: "error", error: "Unable to get driver balance" };
  }
};
const getDriverBalanceByDateRange = async ({
  fromDate,
  toDate,
  userUniqueId,
}) => {
  try {
    let results = null;
    if (fromDate == "lastTen" && toDate == "lastTen") {
      const sql = `SELECT * FROM DriverBalance order by driverBalanceId desc limit 10`;
      results = (await pool.query(sql))[0];
    } else {
      const sql = `SELECT * FROM DriverBalance WHERE transactionTime BETWEEN ? AND ?  order by driverBalanceId desc `;
      const values = [fromDate, toDate];
      results = (await pool.query(sql, values))[0];
    }

    const fullData = await Promise.all(
      results.map(async (record) => {
        let TransactionData = { ...record };
        const transactionType = record?.transactionType;
        console.log("@transactionType", transactionType);
        const transactionUniqueId = record?.transactionUniqueId;
        if (transactionType === "Deposit") {
          const result = await getDriverDepositByUniqueId(transactionUniqueId);
          if (result?.message == "success" && typeof result?.data == "object")
            TransactionData = { ...record, ...result?.data };
        } else if (transactionType === "Commission") {
          const commissionData = await getCommissionsByCommissionUniqueId(
            record.transactionUniqueId
          );
          const data = commissionData?.data?.[0];
          if (commissionData?.message == "success" && typeof data == "object")
            TransactionData = { ...record, ...data };
          else {
            console.log("@commissionData", commissionData);
          }
        } else if (transactionType === "Subscription") {
          const SubscriptionData = await getDriverSubscriptionByUniqueId(
            record?.transactionUniqueId
          );

          if (SubscriptionData?.message == "error") {
            console.log("@SubscriptionData", SubscriptionData);
          } else if (
            SubscriptionData?.message == "success" &&
            typeof SubscriptionData?.data == "object"
          ) {
            TransactionData = { ...record, ...SubscriptionData?.data };
          }
        }
        return TransactionData;
      })
    );

    return {
      message: "success",
      data: fullData,
      check: "56565656",
    };
  } catch (error) {
    console.log("@getDriverBalanceByRange error", error);
    return { message: "error", error: "Unable to get driver balance" };
  }
};
module.exports = {
  getDriverBalanceByDateRange,
  getDriverLastBalanceByUserUniqueId,
  getDriverBalanceById,
  getAllDriverBalances,
};
