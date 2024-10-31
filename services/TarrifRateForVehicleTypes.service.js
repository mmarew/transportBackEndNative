const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new tariff rate for a vehicle type
exports.createTarrifRateForVehicleType = async (data) => {
  const sql = `
    INSERT INTO TarrifRateForVehcleTypes (
      tarrifRateForVehcleTypeUniqueId,
      vehicleTypeUniqueId,
      tarrifRateId
    ) VALUES (?, ?, ?)
  `;
  const values = [uuidv4(), data.vehicleTypeUniqueId, data.tarrifRateId];
  const [result] = await pool.query(sql, values);
  return {
    message: "Tariff rate for vehicle type created successfully",
    data: result,
  };
};

// Get all tariff rates for vehicle types
exports.getAllTarrifRatesForVehicleTypes = async () => {
  const sql = `
    SELECT 
      trv.*, vt.vehicleTypeName, tr.standingTarrifRate, tr.journeyTarrifRate, tr.timingTarrifRate
    FROM TarrifRateForVehcleTypes AS trv
    JOIN VehicleType AS vt ON trv.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    JOIN TarrifRate AS tr ON trv.tarrifRateId = tr.tarrifRateId
  `;
  const [result] = await pool.query(sql);
  return result;
};

// Get a tariff rate for vehicle type by ID
exports.getTarrifRateForVehicleTypeById = async (id) => {
  const sql = `
    SELECT 
      trv.*, vt.vehicleTypeName, tr.standingTarrifRate, tr.journeyTarrifRate, tr.timingTarrifRate
    FROM TarrifRateForVehcleTypes AS trv
    JOIN VehicleType AS vt ON trv.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    JOIN TarrifRate AS tr ON trv.tarrifRateId = tr.tarrifRateId
    WHERE trv.tarrifRateForVehcleTypeId = ?
  `;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a tariff rate for vehicle type by ID
exports.updateTarrifRateForVehicleType = async (id, data) => {
  const sql = `
    UPDATE TarrifRateForVehcleTypes
    SET vehicleTypeUniqueId = ?, tarrifRateId = ?
    WHERE tarrifRateForVehcleTypeId = ?
  `;
  const values = [data.vehicleTypeUniqueId, data.tarrifRateId, id];
  const [result] = await pool.query(sql, values);
  return {
    message: "Tariff rate for vehicle type updated successfully",
    data: result,
  };
};

// Delete a tariff rate for vehicle type by ID
exports.deleteTarrifRateForVehicleType = async (id) => {
  const sql = `DELETE FROM TarrifRateForVehcleTypes WHERE tarrifRateForVehcleTypeId = ?`;
  const [result] = await pool.query(sql, [id]);
  return {
    message: "Tariff rate for vehicle type deleted successfully",
    data: result,
  };
};
