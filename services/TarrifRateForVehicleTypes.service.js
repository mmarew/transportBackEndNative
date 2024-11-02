const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

// Create a new tariff rate for a vehicle type
exports.createTarrifRateForVehicleType = async (data) => {
  // verify existance of data
  const existedData = await getData({
    tableName: "TarrifRateForVehcleTypes",
    conditions: {
      vehicleTypeUniqueId: data.vehicleTypeUniqueId,
      tarrifRateUniqueId: data.tarrifRateUniqueId,
    },
  });

  if (existedData.length > 0) {
    return {
      message: "error",
      error: "Tariff rate for vehicle type already exists",
    };
  }
  const sql = `
    INSERT INTO TarrifRateForVehcleTypes (
      tarrifRateForVehcleTypeUniqueId,
      vehicleTypeUniqueId,
      tarrifRateUniqueId 
    ) VALUES (?, ?, ?)
  `;
  const values = [uuidv4(), data.vehicleTypeUniqueId, data.tarrifRateUniqueId];
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
