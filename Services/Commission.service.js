const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");

// Create a new commission record
exports.createCommission = async ({
  paymentUniqueId,
  commissionRateUniqueId,
  commissionAmount,
}) => {
  try {
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
  } catch (error) {
    return { message: "error", error: error.message };
  }
};

// Get all commission records
exports.getAllCommissions = async () => {
  try {
    const sql = `SELECT * FROM Commission ORDER BY commissionId DESC`;
    const [result] = await pool.query(sql);
    return result;
  } catch (error) {
    return { message: "error", error: error.message };
  }
};

exports.getCommissionsByCommissionUniqueId = async (commissionUniqueId) => {
  try {
    const sql = `SELECT * FROM Commission where commissionUniqueId=?`;
    const [result] = await pool.query(sql, [commissionUniqueId]);
    return { message: "success", data: result };
  } catch (error) {
    return { message: "error", error: error.message };
  }
};

// Get a commission record by ID
exports.getCommissionByUserUniqueId = async (driverUniqueId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "Payments",
      joins: [
        {
          table: "Commission",
          on: "Commission.paymentUniqueId = Payments.paymentUniqueId",
        },
      ],
      conditions: { driverUniqueId: driverUniqueId },
    });
    console.log("@getCommissionByUserUniqueId result is ", result);

    return { message: "success", data: result };
  } catch (error) {
    return { message: "error", error: error.message };
  }
};

// Update a commission record by ID
exports.updateCommission = async (id, data) => {
  try {
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
  } catch (error) {
    return { message: "error", error: error.message };
  }
};

// Delete a commission record by ID
exports.deleteCommission = async (id) => {
  try {
    const sql = `DELETE FROM Commission WHERE commissionId = ?`;
    const [result] = await pool.query(sql, [id]);
    return { message: "Commission record deleted successfully", data: result };
  } catch (error) {
    return { message: "error", error: error.message };
  }
};
