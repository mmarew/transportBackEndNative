const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new payment status
exports.createPaymentStatus = async ({ paymentStatus }) => {
  // first check if paymentStatus is already exists
  const existedPaymentStatus = await getData({
    tableName: "PaymentStatus",
    conditions: { paymentStatus: paymentStatus },
  });
  if (existedPaymentStatus.length > 0) {
    return {
      message: "error",
      data: "Payment status already exists",
    };
  }
  console.log("existedPaymentStatus =============> ", existedPaymentStatus);
  // return;
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
exports.getPaymentStatusById = async (paymentStatusUniqueId) => {
  const sql = `SELECT * FROM PaymentStatus WHERE paymentStatusUniqueId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [paymentStatusUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Payment status not found" };
};

// Update a specific payment status by ID
exports.updatePaymentStatus = async (paymentStatusUniqueId, paymentStatus) => {
  const sql = `UPDATE PaymentStatus SET paymentStatus = ? WHERE paymentStatusUniqueId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [
    paymentStatus,
    paymentStatusUniqueId,
  ]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: { paymentStatusUniqueId, paymentStatus },
    };
  } else {
    return { message: "error", data: "Failed to update payment status" };
  }
};

// Soft delete a specific payment status by ID
exports.deletePaymentStatus = async (paymentStatusUniqueId) => {
  const deletedAt = new Date();
  const sql = `UPDATE PaymentStatus SET deletedAt = ? WHERE paymentStatusUniqueId = ? AND deletedAt IS NULL`;
  const [result] = await pool.query(sql, [deletedAt, paymentStatusUniqueId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Payment status with ID ${paymentStatusUniqueId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete payment status" };
  }
};
