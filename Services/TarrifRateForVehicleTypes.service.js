const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");

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
    message: "success",
    data: "Tariff rate for vehicle type created successfully",
  };
};

// Get all tariff rates for vehicle types
exports.getAllTarrifRatesForVehicleTypes = async () => {
  const result = await performJoinSelect({
    baseTable: "TarrifRateForVehcleTypes",
    joins: [
      {
        table: "VehicleTypes",
        on: "TarrifRateForVehcleTypes.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
      {
        table: "TarrifRate",
        on: "TarrifRateForVehcleTypes.tarrifRateUniqueId = TarrifRate.tarrifRateUniqueId",
      },
    ],
  });
  return {
    message: "success",
    data: result,
  };
};
// get tarrif rate by vehicle type unique id
exports.getTarrifRateByVehicleTypeUniqueId = async (vehicleTypeUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "TarrifRateForVehcleTypes",
    joins: [
      {
        table: "TarrifRate",
        on: "TarrifRateForVehcleTypes.tarrifRateUniqueId = TarrifRate.tarrifRateUniqueId",
      },
    ],
    conditions: {
      vehicleTypeUniqueId: vehicleTypeUniqueId,
    },
  });
  return {
    message: "success",
    data: result,
  };
};
// Get a tariff rate for vehicle type by ID
exports.getTarrifRateForVehicleTypeById = async (tarrifRateForVehcleTypeId) => {
  const result = await performJoinSelect({
    baseTable: "TarrifRateForVehcleTypes",
    joins: [
      {
        table: "VehicleTypes",
        on: "TarrifRateForVehcleTypes.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
      {
        table: "TarrifRate",
        on: "TarrifRateForVehcleTypes.tarrifRateUniqueId = TarrifRate.tarrifRateUniqueId",
      },
    ],
    conditions: {
      tarrifRateForVehcleTypeId: tarrifRateForVehcleTypeId,
    },
  });

  return { message: "success", data: result };
};

// Update a tariff rate for vehicle type by ID
exports.updateTarrifRateForVehicleType = async (
  tarrifRateForVehicleTypeUniqueId,
  data
) => {
  const sql = `
    UPDATE TarrifRateForVehcleTypes
    SET vehicleTypeUniqueId = ?, tarrifRateUniqueId = ?
    WHERE tarrifRateForVehcleTypeUniqueId = ?
  `;
  const values = [
    data.vehicleTypeUniqueId,
    data.tarrifRateUniqueId,
    tarrifRateForVehicleTypeUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "success",
    data: "Tariff rate for vehicle type updated successfully",
  };
};

// Delete a tariff rate for vehicle type by ID
exports.deleteTarrifRateForVehicleType = async (
  tarrifRateForVehicleTypeUniqueId
) => {
  const sql = `DELETE FROM TarrifRateForVehcleTypes WHERE tarrifRateForVehcleTypeUniqueId = ?`;
  const [result] = await pool.query(sql, [tarrifRateForVehicleTypeUniqueId]);
  return {
    message: "success",
    data: "Tariff rate for vehicle type deleted successfully",
  };
};
