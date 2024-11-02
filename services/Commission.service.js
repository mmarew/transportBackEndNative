const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");

// Create a new commission record
exports.createCommission = async ({
  paymentUniqueId,
  commissionRateUniqueId,
  commissionAmount,
}) => {
  // ferst check existance of paymentUniqueId in Payment Commission
  const [existedCommission] = await pool.query(
    `SELECT * FROM Commission WHERE paymentUniqueId = ?`,
    [paymentUniqueId]
  );
  if (existedCommission.length > 0) {
    return {
      message: "error",
      error: "Payment already have commission",
      data: existedCommission[0],
    };
  }

  const commissionUniqueId = uuidv4();
  const values = {
    commissionUniqueId,
    paymentUniqueId,
    commissionRateUniqueId,
    commissionAmount,
  };
  const createCommissionData = await insertData({
    tableName: "Commission",
    colAndVal: { ...values },
  });
  const [commisionData] = await getData({
    tableName: "Commission",
    conditions: { commissionUniqueId: commissionUniqueId },
  });

  return {
    message: "success",
    data: { ...commisionData },
  };
};

// Get all commission records
exports.getAllCommissions = async () => {
  const sql = `SELECT * FROM Commission ORDER BY commissionId DESC`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a commission record by ID
exports.getCommissionById = async (id) => {
  const sql = `SELECT * FROM Commission WHERE commissionId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a commission record by ID
exports.updateCommission = async (id, data) => {
  const sql = `
    UPDATE Commission
    SET paymentId = ?, commissionRateId = ?, commissionAmount = ?
    WHERE commissionId = ?
  `;
  const values = [
    data.paymentId,
    data.commissionRateId,
    data.commissionAmount,
    id,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "Commission record updated successfully", data: result };
};

// Delete a commission record by ID
exports.deleteCommission = async (id) => {
  const sql = `DELETE FROM Commission WHERE commissionId = ?`;
  const [result] = await pool.query(sql, [id]);
  return { message: "Commission record deleted successfully", data: result };
};
