const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new payment (DEPRECATED - Use JourneyPayments.service.js instead)
exports.createPayment = async (
  journeyDecisionUniqueId,
  amount,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  paymentTime,
  user,
) => {
  const existedPayment = await getData({
    tableName: "JourneyPayments",
    conditions: { journeyDecisionUniqueId },
  });
  if (existedPayment.length > 0) {
    throw new AppError("Payment already exists for this journey", 400);
  }
  const paymentUniqueId = uuidv4();
  const journeyPaymentCreatedBy = user?.userUniqueId || "system";
  const now = currentDate();
  const sql = `INSERT INTO JourneyPayments (paymentUniqueId, journeyDecisionUniqueId, amount, paymentMethodUniqueId, paymentStatusUniqueId, paymentTime, journeyPaymentCreatedBy, journeyPaymentCreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    paymentUniqueId,
    journeyDecisionUniqueId,
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    now,
    journeyPaymentCreatedBy,
    now,
  ];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  return {
    message: "success",
    data: {
      paymentUniqueId,
      journeyDecisionUniqueId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
      paymentId: result.insertId,
    },
  };
};

// Get all payments (DEPRECATED - Use JourneyPayments.service.js instead)
exports.getAllPayments = async () => {
  const sql = `SELECT * FROM JourneyPayments LIMIT 30`; // Retrieve only the last 30 entries
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql);

  return { message: "success", data: result };
};

// Get a specific payment by ID (DEPRECATED - Use JourneyPayments.service.js instead)
exports.getPaymentById = async (paymentId) => {
  const sql = `SELECT * FROM JourneyPayments WHERE paymentUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [paymentId]);

  if (result.length === 0) {
    throw new AppError("Payment not found", 404);
  }

  return { message: "success", data: result[0] };
};

// Get payments by user (DEPRECATED - Use JourneyPayments.service with filters instead)
exports.getPaymentsByUserUniqueId = async (params, userUniqueId) => {
  const fromDate = params?.fromDate,
    toDate = params?.toDate;
  let sql = null,
    result = null,
    values = [];

  if (fromDate === "lastTen" && toDate === "lastTen") {
    // Get last 10 payments for driver via JOIN
    sql = `
      SELECT jp.* 
      FROM JourneyPayments jp
      JOIN JourneyDecisions jd ON jp.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      WHERE dr.userUniqueId = ? 
      ORDER BY jp.paymentId DESC 
      LIMIT 10
    `;
    values = [userUniqueId];
    const executor = transactionStorage.getStore() || pool;
    result = (await executor.query(sql, values))?.[0];
  } else {
    sql = `
      SELECT jp.* 
      FROM JourneyPayments jp
      JOIN JourneyDecisions jd ON jp.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      WHERE dr.userUniqueId = ? AND jp.paymentTime BETWEEN ? AND ? 
      ORDER BY jp.paymentId DESC
    `;
    values = [userUniqueId, fromDate, toDate];
    const executor = transactionStorage.getStore() || pool;
    result = (await executor.query(sql, values))?.[0];
  }

  return { message: "success", data: result || [] };
};

// Update a specific payment by ID (DEPRECATED - Use JourneyPayments.service.js instead)
exports.updatePayment = async (
  paymentId,
  amount,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  paymentTime,
) => {
  const setParts = [];
  const values = [];

  if (amount !== undefined) {
    setParts.push("amount = ?");
    values.push(amount);
  }
  if (paymentMethodUniqueId !== undefined) {
    setParts.push("paymentMethodUniqueId = ?");
    values.push(paymentMethodUniqueId);
  }
  if (paymentStatusUniqueId !== undefined) {
    setParts.push("paymentStatusUniqueId = ?");
    values.push(paymentStatusUniqueId);
  }
  if (paymentTime !== undefined) {
    setParts.push("paymentTime = ?");
    values.push(paymentTime);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  values.push(paymentId);
  const sql = `UPDATE JourneyPayments SET ${setParts.join(", ")} WHERE paymentUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update payment or payment not found", 404);
  }

  return {
    message: "success",
    data: {
      paymentId,
      ...(amount !== undefined && { amount }),
      ...(paymentMethodUniqueId !== undefined && { paymentMethodUniqueId }),
      ...(paymentStatusUniqueId !== undefined && { paymentStatusUniqueId }),
      ...(paymentTime !== undefined && { paymentTime }),
    },
  };
};

// Delete a specific payment by ID (DEPRECATED - Use JourneyPayments.service.js instead)
exports.deletePayment = async (paymentId) => {
  const sql = `DELETE FROM JourneyPayments WHERE paymentUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [paymentId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete payment or payment not found", 404);
  }

  return {
    message: "success",
    data: `Payment with ID ${paymentId} deleted successfully`,
  };
};
