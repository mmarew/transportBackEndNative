const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new payment status
exports.createPaymentStatus = async ({ paymentStatus }) => {
  const paymentStatusUniqueId = uuidv4();
  const createdAt = new Date();
  const sql = `INSERT INTO PaymentStatus (paymentStatusUniqueId, paymentStatus, createdAt) VALUES (?, ?, ?)`;
  const values = [paymentStatusUniqueId, paymentStatus, createdAt];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: {
      paymentStatusUniqueId,
      paymentStatus,
      createdAt,
      paymentStatusId: result.insertId,
    },
  };
};

// Get all payment statuses
exports.getAllPaymentStatuses = async () => {
  const sql = `SELECT * FROM PaymentStatus WHERE deletedAt IS NULL`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific payment status by ID
exports.getPaymentStatusById = async (paymentStatusId) => {
  const sql = `SELECT * FROM PaymentStatus WHERE paymentStatusId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [paymentStatusId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Payment status not found" };
};

// Update a specific payment status by ID
exports.updatePaymentStatus = async (paymentStatusId, paymentStatus) => {
  const sql = `UPDATE PaymentStatus SET paymentStatus = ? WHERE paymentStatusId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [paymentStatus, paymentStatusId]);

  if (result.affectedRows > 0) {
    return { message: "success", data: { paymentStatusId, paymentStatus } };
  } else {
    return { message: "error", data: "Failed to update payment status" };
  }
};

// Soft delete a specific payment status by ID
exports.deletePaymentStatus = async (paymentStatusId) => {
  const deletedAt = new Date();
  const sql = `UPDATE PaymentStatus SET deletedAt = ? WHERE paymentStatusId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [deletedAt, paymentStatusId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Payment status with ID ${paymentStatusId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete payment status" };
  }
};
