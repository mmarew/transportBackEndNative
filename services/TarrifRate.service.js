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
      createdBy,
      createdAt
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
  return { message: "Tariff rate created successfully", data: result };
};

// Get all tariff rates
exports.getAllTarrifRates = async () => {
  const sql = `SELECT * FROM TarrifRate`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a tariff rate by ID
exports.getTarrifRateById = async (id) => {
  const sql = `SELECT * FROM TarrifRate WHERE tarrifRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a tariff rate by ID
exports.updateTarrifRate = async (id, data) => {
  const sql = `
    UPDATE TarrifRate
    SET standingTarrifRate = ?, journeyTarrifRate = ?, timingTarrifRate = ?,
        tarifRateDescription = ?, createdBy = ?
    WHERE tarrifRateId = ?
  `;
  const values = [
    data.standingTarrifRate,
    data.journeyTarrifRate,
    data.timingTarrifRate,
    data.tarifRateDescription,
    data.createdBy,
    id,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "Tariff rate updated successfully", data: result };
};

// Delete a tariff rate by ID
exports.deleteTarrifRate = async (id) => {
  const sql = `DELETE FROM TarrifRate WHERE tarrifRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return { message: "Tariff rate deleted successfully", data: result };
};
