const { v4: uuidv4 } = require("uuid");

const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new tariff rate
exports.createTariffRate = async (data) => {
  const {
    standingTariffRate,
    journeyTariffRate,
    timingTariffRate,
    tariffRateDescription,
  } = data;
  // validate if all  tariff rate exists
  if (!standingTariffRate || !journeyTariffRate || !timingTariffRate) {
    return {
      message: "error",
      error: "All tariff rates are required",
    };
  }
  const existedTariffRate = await getData({
    tableName: "TariffRate",
    conditions: { standingTariffRate, journeyTariffRate, timingTariffRate },
  });
  if (existedTariffRate?.length > 0) {
    return {
      message: "error",
      error: "Tariff rate already exists",
    };
  }
  const sql = `
    INSERT INTO TariffRate (
      tariffRateUniqueId,
      standingTariffRate,
      journeyTariffRate,
      timingTariffRate,
      tariffRateDescription,
      tariffRateCreatedBy,
      tariffRateCreatedAt,
      tariffRateEffectiveDate,tariffRateExpirationDate
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(),?,?)
  `;
  const user = data.user;
  const userUniqueId = user.userUniqueId;
  const tariffRateEffectiveDate = "2028-10-10";
  const tariffRateExpirationDate = "2028-10-10";
  const values = [
    uuidv4(),
    standingTariffRate,
    journeyTariffRate,
    timingTariffRate,
    tariffRateDescription,
    userUniqueId,
    tariffRateEffectiveDate,
    tariffRateExpirationDate,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "success", data: "Tariff rate created successfully" };
};

// Get all tariff rates
exports.getAllTariffRates = async () => {
  const sql = `SELECT * FROM TariffRate`;
  const [result] = await pool.query(sql);
  // return result;
  return { message: "success", data: result };
};

// Get a tariff rate by ID
exports.getTariffRateById = async (tariffRateUniqueId) => {
  const sql = `SELECT * FROM TariffRate WHERE tariffRateUniqueId = ?`;
  const [result] = await pool.query(sql, [tariffRateUniqueId]);
  return { message: "success", data: result[0] };
};

// Update a tariff rate by ID
exports.updateTariffRate = async (tariffRateUniqueId, data) => {
  const sql = `
    UPDATE TariffRate
    SET standingTariffRate = ?, journeyTariffRate = ?, timingTariffRate = ?,
        tariffRateDescription = ?
    WHERE tariffRateUniqueId = ?
  `;
  const values = [
    data.standingTariffRate,
    data.journeyTariffRate,
    data.timingTariffRate,
    data.tariffRateDescription,
    tariffRateUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return { message: "success", data: "Tariff rate updated successfully" };
};

// Delete a tariff rate by ID
exports.deleteTariffRate = async (id) => {
  const sql = `DELETE FROM TariffRate WHERE tariffRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return { message: "success", data: "Tariff rate deleted successfully" };
};
