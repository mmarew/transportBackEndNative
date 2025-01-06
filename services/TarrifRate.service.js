const { v4: uuidv4 } = require("uuid");

const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new tariff rate
exports.createTarrifRate = async (data) => {
  const {
    standingTarrifRate,
    journeyTarrifRate,
    timingTarrifRate,
    tarifRateDescription,
  } = data;
  // validate if all  tariff rate exists
  if (!standingTarrifRate || !journeyTarrifRate || !timingTarrifRate) {
    return {
      message: "error",
      error: "All tariff rates are required",
    };
  }
  const existedTariffRate = await getData({
    tableName: "TarrifRate",
    conditions: { standingTarrifRate, journeyTarrifRate, timingTarrifRate },
  });
  if (existedTariffRate?.length > 0) {
    return {
      message: "error",
      error: "Tariff rate already exists",
    };
  }
  const sql = `
    INSERT INTO TarrifRate (
      tarrifRateUniqueId,
      standingTarrifRate,
      journeyTarrifRate,
      timingTarrifRate,
      tarifRateDescription,
      tarrifRateCreatedBy,
      tarrifRateCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;
  const user = data.user;
  const userUniqueId = user.userUniqueId;
  const values = [
    uuidv4(),
    standingTarrifRate,
    journeyTarrifRate,
    timingTarrifRate,
    tarifRateDescription,
    userUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "success", data: "Tariff rate created successfully" };
};

// Get all tariff rates
exports.getAllTarrifRates = async () => {
  const sql = `SELECT * FROM TarrifRate`;
  const [result] = await pool.query(sql);
  // return result;
    return { message: "success", data: result };
};

// Get a tariff rate by ID
exports.getTarrifRateById = async (tarrifRateUniqueId) => {
  const sql = `SELECT * FROM TarrifRate WHERE tarrifRateUniqueId = ?`;
  const [result] = await pool.query(sql, [tarrifRateUniqueId]);
  return { message: "success", data: result[0] };
};

// Update a tariff rate by ID
exports.updateTarrifRate = async (tarrifRateUniqueId, data) => {
  const sql = `
    UPDATE TarrifRate
    SET standingTarrifRate = ?, journeyTarrifRate = ?, timingTarrifRate = ?,
        tarifRateDescription = ?
    WHERE tarrifRateUniqueId = ?
  `;
  const values = [
    data.standingTarrifRate,
    data.journeyTarrifRate,
    data.timingTarrifRate,
    data.tarifRateDescription,
    tarrifRateUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "success", data: "Tariff rate updated successfully" };
};

// Delete a tariff rate by ID
exports.deleteTarrifRate = async (id) => {
  const sql = `DELETE FROM TarrifRate WHERE tarrifRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return { message: "success", data: "Tariff rate deleted successfully" };
};
