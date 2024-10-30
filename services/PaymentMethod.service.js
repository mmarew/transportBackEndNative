const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new payment method
exports.createPaymentMethod = async (paymentMethod) => {
  const paymentMethodUniqueId = uuidv4();
  const createdAt = new Date();
  const sql = `INSERT INTO PaymentMethod (paymentMethodUniqueId, paymentMethod, createdAt) VALUES (?, ?, ?)`;
  const values = [paymentMethodUniqueId, paymentMethod, createdAt];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: {
      paymentMethodUniqueId,
      paymentMethod,
      createdAt,
      paymentMethodId: result.insertId,
    },
  };
};

// Get all payment methods
exports.getAllPaymentMethods = async () => {
  const sql = `SELECT * FROM PaymentMethod`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific payment method by ID
exports.getPaymentMethodById = async (paymentMethodId) => {
  const sql = `SELECT * FROM PaymentMethod WHERE paymentMethodId = ?`;
  const [result] = await pool.query(sql, [paymentMethodId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Payment method not found" };
};

// Update a specific payment method by ID
exports.updatePaymentMethod = async (paymentMethodId, paymentMethod) => {
  const sql = `UPDATE PaymentMethod SET paymentMethod = ? WHERE paymentMethodId = ?`;
  const values = [paymentMethod, paymentMethodId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return { message: "success", data: { paymentMethodId, paymentMethod } };
  } else {
    return { message: "error", data: "Failed to update payment method" };
  }
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (paymentMethodId) => {
  const sql = `DELETE FROM PaymentMethod WHERE paymentMethodId = ?`;
  const [result] = await pool.query(sql, [paymentMethodId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Payment method with ID ${paymentMethodId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete payment method" };
  }
};
