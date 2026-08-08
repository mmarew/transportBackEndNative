const { getUserDeposit } = require("../UserDeposit");
const { getTransferByUniqueId } = require("../UserBalanceTransfer.service");
const AppError = require("../../Utils/AppError");

const {
  getUserSubscriptionsWithFilters,
} = require("../UserSubscription");
const { getAllCommissions } = require("../Commission.service");

const { pool } = require("../../Middleware/Database.config");
const logger = require("../../Utils/logger");
const { transactionStorage } = require("../../Utils/TransactionContext");

/**
 * Fetch Commission by transactionUniqueId with fallbacks.
 * UserBalance.transactionUniqueId for Commission-type rows may be commissionUniqueId,
 * paymentUniqueId, or journeyDecisionUniqueId (legacy). Try each until one returns a row.
 */
async function getCommissionByTransactionUniqueId(transactionUniqueId) {
  logger.info(
    "@transactionUniqueId in getCommissionByTransactionUniqueId " +
      transactionUniqueId,
  );
  if (!transactionUniqueId) {return null;}
  let result = await getAllCommissions({
    commissionUniqueId: transactionUniqueId,
    limit: 1,
  });
  logger.info(
    "@result in getCommissionByTransactionUniqueId",
    JSON.stringify(result),
  );
  if (result?.data?.[0]) {return result.data[0];}
  result = await getAllCommissions({
    paymentUniqueId: transactionUniqueId,
    limit: 1,
  });
  if (result?.data?.[0]) {return result.data[0];}
  result = await getAllCommissions({
    journeyDecisionUniqueId: transactionUniqueId,
    limit: 1,
  });
  return result?.data?.[0] || null;
}

// enrichUserBalanceRecord.js
const enrichUserBalanceRecord = async (balance) => {
  const { transactionType, transactionUniqueId } = balance;
  let transactionDetails = null;

  try {
    if (transactionType === "Deposit") {
      transactionDetails = await getUserDeposit({
        userDepositUniqueId: transactionUniqueId,
      });
    } else if (transactionType === "Commission") {
      transactionDetails =
        await getCommissionByTransactionUniqueId(transactionUniqueId);
    } else if (transactionType === "Transfer") {
      transactionDetails = await getTransferByUniqueId(transactionUniqueId);
    } else if (transactionType === "Refund") {
      const executor = transactionStorage.getStore() || pool;
      // Direct SQL query to avoid circular dependency with UserRefund.service
      const [refundResult] = await executor.query(
        "SELECT * FROM UserRefund WHERE userRefundUniqueId = ?",
        [transactionUniqueId],
      );
      transactionDetails = refundResult[0] || null;
    } else if (transactionType === "Subscription") {
      const result = await getUserSubscriptionsWithFilters({
        userSubscriptionUniqueId: transactionUniqueId,
        limit: 1,
      });
      transactionDetails = result?.data?.[0] || null;
    } else if (transactionType === "CommissionReversal") {
      transactionDetails = { reversedCommissionId: transactionUniqueId };
    } else if (transactionType === "CommissionAdjustment") {
      const result = await getAllCommissions({
        commissionUniqueId: transactionUniqueId,
        limit: 1,
      });
      transactionDetails = result?.data?.[0]
        ? { ...result.data[0], _adjustmentForCommissionId: transactionUniqueId }
        : { commissionUniqueId: transactionUniqueId };
    }

    return {
      ...balance,
      transactionDetails,
    };
  } catch (err) {
    // If details fail to load, we still want the balance record
    return {
      ...balance,
      transactionDetails: null,
      enrichmentError: err.message,
    };
  }
};

const getAlluserBalances = async () => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM UserBalance ORDER BY userBalanceId DESC`;
  const [results] = await executor.query(sql);
  const enrichedResults = await Promise.all(
    results.map(enrichUserBalanceRecord),
  );

  return { message: "User balances fetched successfully", data: enrichedResults };
};

// Get a driver balance record by ID
const getuserBalanceById = async (userBalanceUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM UserBalance WHERE userBalanceUniqueId = ?`;
  const [result] = await executor.query(sql, [userBalanceUniqueId]);

  if (result.length === 0) {
    throw new AppError("Driver balance not found", AppError.NOT_FOUND);
  }

  return { message: "User balance fetched successfully", data: result[0] };
};

// Get the last driver balance record by userUniqueId
const getDriverLastBalanceByUserUniqueId = async (userUniqueId) => {
  const sql = `
    SELECT * FROM UserBalance 
    WHERE userUniqueId = ? 
    ORDER BY userBalanceId DESC 
    LIMIT 1
  `;
  const executor = transactionStorage.getStore() || pool;
  const [results] = await executor.query(sql, [userUniqueId]);

  if (results.length === 0) {
    throw new AppError("Driver balance not found", AppError.NOT_FOUND);
  }

  // Enrich the last balance record using the same logic as getuserBalanceByDateRange
  const record = results[0];
  let TransactionData = { ...record };
  const transactionUniqueId = record?.transactionUniqueId;

  try {
    if (record.transactionType === "Deposit") {
      const { getUserDeposit } = require("../UserDeposit");
      const result = await getUserDeposit({
        userDepositUniqueId: transactionUniqueId,
      });
      if (result) {
        TransactionData = { ...record, ...result?.data?.[0] };
      }
    } else if (record.transactionType === "Commission") {
      const commissionRow = await getCommissionByTransactionUniqueId(
        record.transactionUniqueId,
      );
      if (commissionRow) {
        TransactionData = { ...record, ...commissionRow };
      }
    } else if (record.transactionType === "Subscription") {
      const SubscriptionData = await getUserSubscriptionsWithFilters({
        userSubscriptionUniqueId: record?.transactionUniqueId,
        limit: 1,
      });
      if (SubscriptionData?.data?.[0]) {
        TransactionData = { ...record, ...SubscriptionData.data[0] };
      }
    } else if (record.transactionType === "Transfer") {
      const transferData = await getTransferByUniqueId(
        record.transactionUniqueId,
      );
      if (transferData) {
        TransactionData = { ...record, ...transferData };
      }
    } else if (record.transactionType === "Refund") {
      // Direct SQL query to avoid circular dependency
      const [refundResult] = await (transactionStorage.getStore() || pool).query(
        "SELECT * FROM UserRefund WHERE userRefundUniqueId = ?",
        [transactionUniqueId],
      );
      if (refundResult[0]) {
        TransactionData = { ...record, ...refundResult[0] };
      }
    } else if (record.transactionType === "CommissionReversal") {
      TransactionData = {
        ...record,
        reversedCommissionId: transactionUniqueId,
      };
    } else if (record.transactionType === "CommissionAdjustment") {
      const commissionResult = await getAllCommissions({
        commissionUniqueId: record.transactionUniqueId,
        limit: 1,
      });
      TransactionData = commissionResult?.data?.[0]
        ? {
          ...record,
          ...commissionResult.data[0],
          _adjustmentForCommissionId: transactionUniqueId,
        }
        : { ...record, commissionUniqueId: transactionUniqueId };
    }
  } catch {
    // If enrichment fails, return base record
  }

  return { message: "User balance fetched successfully", data: TransactionData };
};

const getuserBalanceByDateRange = async ({
  fromDate,
  toDate,
  userUniqueId,
  offset = 0, // Add offset parameter with default 0
}) => {
  let results = null;
  if (fromDate === "lastTen" && toDate === "lastTen") {
    const sql = `SELECT * FROM UserBalance WHERE userUniqueId=? ORDER BY userBalanceId DESC LIMIT 10`;
    const executor2 = transactionStorage.getStore() || pool;
    results = (await executor2.query(sql, [userUniqueId]))[0];
  } else {
    const sql2 = `SELECT * FROM UserBalance WHERE transactionTime BETWEEN ? AND ? AND userUniqueId=? ORDER BY userBalanceId DESC LIMIT 30 OFFSET ?`;
    const values = [fromDate, toDate, userUniqueId, Number(offset)];
    const executor3 = transactionStorage.getStore() || pool;
    results = (await executor3.query(sql2, values))[0];
  }

  const fullData = await Promise.all(
    results.map(async (record) => {
      let TransactionData = { ...record };
      const transactionType = record?.transactionType;
      const transactionUniqueId = record?.transactionUniqueId;
      try {
        if (transactionType === "Deposit") {
          const result = await getUserDeposit({
            userDepositUniqueId: transactionUniqueId,
          });
          if (result) {
            TransactionData = { ...record, ...result?.data?.[0] };
          }
        } else if (transactionType === "Commission") {
          const commissionRow = await getCommissionByTransactionUniqueId(
            record.transactionUniqueId,
          );
          if (commissionRow) {
            TransactionData = { ...record, ...commissionRow };
          }
        } else if (transactionType === "Subscription") {
          const SubscriptionData = await getUserSubscriptionsWithFilters({
            userSubscriptionUniqueId: record?.transactionUniqueId,
            limit: 1,
          });
          if (SubscriptionData?.data?.[0]) {
            TransactionData = { ...record, ...SubscriptionData.data[0] };
          }
        } else if (transactionType === "Transfer") {
          const transferData = await getTransferByUniqueId(
            record.transactionUniqueId,
          );
          if (transferData) {
            TransactionData = { ...record, ...transferData };
          }
        } else if (transactionType === "CommissionReversal") {
          TransactionData = {
            ...record,
            reversedCommissionId: transactionUniqueId,
          };
        } else if (transactionType === "CommissionAdjustment") {
          const commissionResult = await getAllCommissions({
            commissionUniqueId: record.transactionUniqueId,
            limit: 1,
          });
          TransactionData = commissionResult?.data?.[0]
            ? {
              ...record,
              ...commissionResult.data[0],
              _adjustmentForCommissionId: transactionUniqueId,
            }
            : { ...record, commissionUniqueId: transactionUniqueId };
        }
      } catch {
        // Continue with record as is if enrichment fails
      }
      return TransactionData;
    }),
  );

  return { message: "User balance records fetched successfully", data: fullData };
};

const getUserBalanceByFilterServices = async (query, connection) => {
  const {
    userBalanceUniqueId,
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

  if (userBalanceUniqueId) {
    whereClauses.push(`userBalanceUniqueId = ?`);
    params.push(userBalanceUniqueId);
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
    FROM UserBalance
    ${whereSql}
    ORDER BY userBalanceId DESC
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, Number(limit), Number(offset)];

  // Count query
  const countSql = `
    SELECT COUNT(*) AS total
    FROM UserBalance
    ${whereSql}
  `;

  const executor = transactionStorage.getStore() || connection || pool;
  const [dataRows] = await executor.query(dataSql, dataParams);
  const [countRows] = await executor.query(countSql, params);
  logger.info("@dataRows", dataRows);
  const total = countRows[0]?.total || 0;

  // Enrich each balance record with transaction details
  const enrichedData = await Promise.all(
    dataRows.map(async (record) => {
      const transactionType = record?.transactionType;
      const transactionUniqueId = record?.transactionUniqueId;
      let transactionDetails = null;

      try {
        if (transactionType === "Deposit") {
          const result = await getUserDeposit({
            userDepositUniqueId: transactionUniqueId,
          });
          if (result?.data) {
            transactionDetails = result.data?.[0];
          }
        } else if (transactionType === "Commission") {
          transactionDetails =
            await getCommissionByTransactionUniqueId(transactionUniqueId);
          logger.info(
            "@transactionUniqueId in Commission in getUserBalanceByFilterServices" +
              transactionUniqueId,
          );
          logger.info(
            "@transactionDetails in Commission " +
              JSON.stringify(transactionDetails),
          );
        } else if (transactionType === "Subscription") {
          const subscriptionData = await getUserSubscriptionsWithFilters({
            userSubscriptionUniqueId: transactionUniqueId,
            limit: 1,
          });
          if (subscriptionData?.data?.[0]) {
            transactionDetails = subscriptionData.data?.[0];
          }
        } else if (transactionType === "Transfer") {
          const transferData = await getTransferByUniqueId(transactionUniqueId);
          if (transferData) {
            transactionDetails = transferData;
          }
        } else if (transactionType === "Refund") {
          const executor = transactionStorage.getStore() || pool;
          // Direct SQL query to avoid circular dependency
          const [refundResult] = await executor.query(
            "SELECT * FROM UserRefund WHERE userRefundUniqueId = ?",
            [transactionUniqueId],
          );
          if (refundResult.length > 0) {
            transactionDetails = refundResult[0];
          }
        } else if (transactionType === "CommissionReversal") {
          transactionDetails = { reversedCommissionId: transactionUniqueId };
        } else if (transactionType === "CommissionAdjustment") {
          const commissionResult = await getAllCommissions({
            commissionUniqueId: transactionUniqueId,
            limit: 1,
          });
          transactionDetails = commissionResult?.data?.[0]
            ? {
              ...commissionResult.data[0],
              _adjustmentForCommissionId: transactionUniqueId,
            }
            : { commissionUniqueId: transactionUniqueId };
        }
      } catch {
        // enrichment details null
      }

      // Return structured format: balance + transaction details as separate objects
      return {
        Balance: record,
        [transactionType]: transactionDetails,
      };
    }),
  );

  return {
    message: "User balances fetched successfully",
    data: enrichedData,

    pagination: {
      currentPage: Number(page),
      limit: Number(limit),
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

module.exports = {
  getUserBalanceByFilterServices,
  getuserBalanceByDateRange,
  getDriverLastBalanceByUserUniqueId,
  getuserBalanceById,
  getAlluserBalances,
};
