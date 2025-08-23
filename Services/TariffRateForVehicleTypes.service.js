const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");

// Create a new tariff rate for a vehicle type
exports.createTariffRateForVehicleType = async (data) => {
  // verify existence of data
  const existedData = await getData({
    tableName: "TariffRateForVehicleTypes",
    conditions: {
      vehicleTypeUniqueId: data.vehicleTypeUniqueId,
      tariffRateUniqueId: data.tariffRateUniqueId,
    },
  });

  if (existedData.length > 0) {
    return {
      message: "error",
      error: "Tariff rate for vehicle type already exists",
    };
  }
  const sql = `
    INSERT INTO TariffRateForVehicleTypes (
      tariffRateForVehicleTypeUniqueId,
      vehicleTypeUniqueId,
      tariffRateUniqueId 
    ) VALUES (?, ?, ?)
  `;
  const values = [uuidv4(), data.vehicleTypeUniqueId, data.tariffRateUniqueId];
  await pool.query(sql, values);
  return {
    message: "success",
    data: "Tariff rate for vehicle type created successfully",
  };
};

// Get all tariff rates for vehicle types
exports.getAllTariffRatesForVehicleTypes = async () => {
  const result = await performJoinSelect({
    baseTable: "TariffRateForVehicleTypes",
    joins: [
      {
        table: "VehicleTypes",
        on: "TariffRateForVehicleTypes.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
      {
        table: "TariffRate",
        on: "TariffRateForVehicleTypes.tariffRateUniqueId = TariffRate.tariffRateUniqueId",
      },
    ],
  });
  return {
    message: "success",
    data: result,
  };
};
// get tariff rate by vehicle type unique id
exports.getTariffRateByVehicleTypeUniqueId = async (vehicleTypeUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "TariffRateForVehicleTypes",
    joins: [
      {
        table: "TariffRate",
        on: "TariffRateForVehicleTypes.tariffRateUniqueId = TariffRate.tariffRateUniqueId",
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
exports.getTariffRateForVehicleTypeById = async (
  tariffRateForVehicleTypeId
) => {
  const result = await performJoinSelect({
    baseTable: "TariffRateForVehicleTypes",
    joins: [
      {
        table: "VehicleTypes",
        on: "TariffRateForVehicleTypes.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
      {
        table: "TariffRate",
        on: "TariffRateForVehicleTypes.tariffRateUniqueId = TariffRate.tariffRateUniqueId",
      },
    ],
    conditions: {
      tariffRateForVehicleTypeId: tariffRateForVehicleTypeId,
    },
  });

  return { message: "success", data: result };
};

// Update a tariff rate for vehicle type by ID
exports.updateTariffRateForVehicleType = async (
  tariffRateForVehicleTypeUniqueId,
  data
) => {
  const sql = `
    UPDATE TariffRateForVehicleTypes
    SET vehicleTypeUniqueId = ?, tariffRateUniqueId = ?
    WHERE tariffRateForVehicleTypeUniqueId = ?
  `;
  const values = [
    data.vehicleTypeUniqueId,
    data.tariffRateUniqueId,
    tariffRateForVehicleTypeUniqueId,
  ];
  await pool.query(sql, values);
  return {
    message: "success",
    data: "Tariff rate for vehicle type updated successfully",
  };
};

// Delete a tariff rate for vehicle type by ID
exports.deleteTariffRateForVehicleType = async (
  tariffRateForVehicleTypeUniqueId
) => {
  const sql = `DELETE FROM TariffRateForVehicleTypes WHERE tariffRateForVehicleTypeUniqueId = ?`;
  await pool.query(sql, [tariffRateForVehicleTypeUniqueId]);
  return {
    message: "success",
    data: "Tariff rate for vehicle type deleted successfully",
  };
};
