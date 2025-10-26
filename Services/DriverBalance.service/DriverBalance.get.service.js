const {
  getDriverDepositByUniqueId,
  getDriverDeposit,
} = require("../DriverDeposit.service");
const { getTransferByUniqueId } = require("../DriverBalanceTransfer.service");
const { getRefundByUniqueId } = require("../DriverRefund.service");
const {
  getDriverSubscriptionByUniqueId,
} = require("../DriverSubscription.service");
const {
  getCommissionsByCommissionUniqueId,
} = require("../CommissionRates.service");
const {
  getFreeGiftToDriverByUniqueId,
} = require("../FreeGiftToDriver.service");
const { pool } = require("../../Middleware/Database.config");
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
    return { message: "error", error: "Unable to get driver last balance" };
  }
};
const getDriverBalanceByDateRange = async ({
  fromDate,
  toDate,
  userUniqueId,
  offset = 0, // Add offset parameter with default 0
}) => {
  try {
    let results = null;
    if (fromDate == "lastTen" && toDate == "lastTen") {
      const sql = `SELECT * FROM DriverBalance WHERE DriverBalance.userUniqueId=? ORDER BY driverBalanceId DESC LIMIT 10`;
      results = (await pool.query(sql, userUniqueId))[0];
    } else {
      const sql = `SELECT * FROM DriverBalance WHERE transactionTime BETWEEN ? AND ? AND DriverBalance.userUniqueId=? ORDER BY driverBalanceId DESC LIMIT 30 OFFSET ?`;
      const values = [fromDate, toDate, userUniqueId, Number(offset)];
      results = (await pool.query(sql, values))[0];
    }

    const fullData = await Promise.all(
      results.map(async (record) => {
        let TransactionData = { ...record };
        const transactionType = record?.transactionType;
        console.log("@transactionType", transactionType);
        const transactionUniqueId = record?.transactionUniqueId;
        if (transactionType === "Deposit") {
          const result = await getDriverDeposit({
            driverDepositUniqueId: transactionUniqueId,
          });
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
        } else if (transactionType == "freeGift") {
          const freeGiftData = await getFreeGiftToDriverByUniqueId(
            record?.transactionUniqueId
          );
          console.log("@freeGiftData", freeGiftData);
          if (freeGiftData.message == "success") {
            TransactionData = { ...record, ...freeGiftData?.data };
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
// const getDriverBalanceByFilterServices = async (query) => {
//   console.log("@query", query);
//   return { message: "success", data: {} };
// };

const getDriverBalanceByFilterServices = async (query) => {
  try {
    const {
      driverBalanceUniqueId,
      userUniqueId,
      transactionType,
      transactionUniqueId,
      startDate,
      endDate,
      minBalance,
      maxBalance,
      page = 1,
      limit = 10,
    } = query;

    const offset = (page - 1) * limit;
    const whereClauses = [];
    const params = [];

    if (driverBalanceUniqueId) {
      whereClauses.push(`driverBalanceUniqueId = ?`);
      params.push(driverBalanceUniqueId);
    }

    if (userUniqueId) {
      whereClauses.push(`userUniqueId = ?`);
      params.push(userUniqueId);
    }

    if (transactionType) {
      whereClauses.push(`transactionType = ?`);
      params.push(transactionType);
    }

    if (transactionUniqueId) {
      whereClauses.push(`transactionUniqueId = ?`);
      params.push(transactionUniqueId);
    }

    if (startDate && endDate) {
      whereClauses.push(`transactionTime BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    } else if (startDate) {
      whereClauses.push(`transactionTime >= ?`);
      params.push(startDate);
    } else if (endDate) {
      whereClauses.push(`transactionTime <= ?`);
      params.push(endDate);
    }

    if (minBalance) {
      whereClauses.push(`netBalance >= ?`);
      params.push(minBalance);
    }

    if (maxBalance) {
      whereClauses.push(`netBalance <= ?`);
      params.push(maxBalance);
    }

    // Combine filters into WHERE SQL
    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Paginated data query
    const dataSql = `
      SELECT *
      FROM DriverBalance
      ${whereSql}
      ORDER BY transactionTime DESC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));

    // Count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM DriverBalance
      ${whereSql}
    `;

    const [dataRows] = await pool.query(dataSql, params);
    const [countRows] = await pool.query(countSql, params.slice(0, -2)); // exclude limit+offset

    const total = countRows[0]?.total || 0;

    return {
      message: "success",
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
      data: dataRows,
    };
  } catch (error) {
    console.error("Error in getDriverBalanceByFilterServices:", error);
    return { message: "error", error: error.message };
  }
};

module.exports = {
  getDriverBalanceByFilterServices,
  getDriverBalanceByDateRange,
  getDriverLastBalanceByUserUniqueId,
  getDriverBalanceById,
  getAllDriverBalances,
};
