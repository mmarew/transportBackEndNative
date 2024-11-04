const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new payment
exports.createPayment = async (
  journeyUniqueId,
  amount,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  paymentTime
) => {
  const existedPayment = await getData({
    tableName: "Payments",
    conditions: { journeyUniqueId: journeyUniqueId },
  });
  if (existedPayment.length > 0) {
    return {
      message: "error",
      error: "Payment already exists for this journey",
      data: existedPayment?.[0],
    };
  }
  const paymentUniqueId = uuidv4();
  const sql = `INSERT INTO Payments (paymentUniqueId,journeyUniqueId, amount, paymentMethodUniqueId, paymentStatusUniqueId, paymentTime) VALUES (?, ?, ?, ?, ?,?)`;
  const values = [
    paymentUniqueId,
    journeyUniqueId,
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    new Date(),
  ];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: {
      paymentUniqueId,
      journeyUniqueId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
      paymentId: result.insertId,
    },
  };
};

// Get all payments
exports.getAllPayments = async () => {
  const sql = `SELECT * FROM Payments LIMIT 30`; // Retrieve only the last 30 entries
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific payment by ID
exports.getPaymentById = async (paymentId) => {
  const sql = `SELECT * FROM Payments WHERE paymentId = ?`;
  const [result] = await pool.query(sql, [paymentId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Payment not found" };
};

// Update a specific payment by ID
exports.updatePayment = async (
  paymentId,
  amount,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  paymentTime
) => {
  const sql = `UPDATE Payments SET amount = ?, paymentMethodUniqueId = ?, paymentStatusUniqueId = ?, paymentTime = ? WHERE paymentId = ?`;
  const values = [
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    paymentTime,
    paymentId,
  ];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: {
        paymentId,
        amount,
        paymentMethodUniqueId,
        paymentStatusUniqueId,
        paymentTime,
      },
    };
  } else {
    return { message: "error", data: "Failed to update payment" };
  }
};

// Delete a specific payment by ID
exports.deletePayment = async (paymentId) => {
  const sql = `DELETE FROM Payments WHERE paymentId = ?`;
  const [result] = await pool.query(sql, [paymentId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Payment with ID ${paymentId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete payment" };
  }
};
