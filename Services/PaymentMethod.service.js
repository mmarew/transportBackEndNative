const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new payment method
exports.createPaymentMethod = async ({ paymentMethod }) => {
  const existedPaymentMethodes = await getData({
    tableName: "PaymentMethod",
    conditions: { paymentMethod },
  });
  if (existedPaymentMethodes.length > 0)
    return { message: "error", error: "Payment method already existed" };
  const paymentMethodUniqueId = uuidv4();
  const createdAt = new Date();
  const sql = `INSERT INTO PaymentMethod (paymentMethodUniqueId, paymentMethod, createdAt) VALUES (?, ?, ?)`;
  const values = [paymentMethodUniqueId, paymentMethod, createdAt];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: "payment methodes created successfully",
  };
};

// Get all payment methods
exports.getAllPaymentMethods = async () => {
  const sql = `SELECT * FROM PaymentMethod`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific payment method by ID
exports.getPaymentMethodById = async (paymentMethodUniqueId) => {
  const sql = `SELECT * FROM PaymentMethod WHERE paymentMethodUniqueId = ?`;
  const [result] = await pool.query(sql, [paymentMethodUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Payment method not found" };
};

// Update a specific payment method by ID
exports.updatePaymentMethod = async (paymentMethodUniqueId, paymentMethod) => {
  const sql = `UPDATE PaymentMethod SET paymentMethod = ? WHERE paymentMethodUniqueId = ?`;
  const values = [paymentMethod, paymentMethodUniqueId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: { paymentMethodUniqueId, paymentMethod },
    };
  } else {
    return { message: "error", error: "Failed to update payment method" };
  }
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (paymentMethodUniqueId) => {
  console.log("paymentMethodUniqueId", paymentMethodUniqueId);
  const sql = `DELETE FROM PaymentMethod WHERE paymentMethodUniqueId = ?`;
  const [result] = await pool.query(sql, [paymentMethodUniqueId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Payment method deleted successfully`,
    };
  } else {
    return { message: "error", error: "Failed to delete payment method" };
  }
};
