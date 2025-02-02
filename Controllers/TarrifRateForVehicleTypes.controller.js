const tarrifRateForVehicleTypesService = require("../Services/TarrifRateForVehicleTypes.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new tariff rate for a vehicle type
exports.createTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.createTarrifRateForVehicleType(
        req.body
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@createTarrifRateForVehicleType error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create tariff rate for vehicle type",
    });
  }
};

// Get all tariff rates for vehicle types
exports.getAllTarrifRatesForVehicleTypes = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.getAllTarrifRatesForVehicleTypes();
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllTarrifRatesForVehicleTypes", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tariff rates for vehicle types",
    });
  }
};

// Get a tariff rate for vehicle type by ID
exports.getTarrifRateForVehicleTypeById = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.getTarrifRateForVehicleTypeById(
        req.params.id
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("getTarrifRateForVehicleTypeById", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tariff rate for vehicle type",
    });
  }
};

// Update a tariff rate for vehicle type by ID
exports.updateTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.updateTarrifRateForVehicleType(
        req.params.tarrifRateForVehicleTypeUniqueId,
        req.body
      );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to update tariff rate for vehicle type",
    });
  }
};

// Delete a tariff rate for vehicle type by ID
exports.deleteTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.deleteTarrifRateForVehicleType(
        req.params.tarrifRateForVehicleTypeUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete tariff rate for vehicle type",
    });
  }
};
