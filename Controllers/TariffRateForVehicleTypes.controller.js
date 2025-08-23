const tariffRateForVehicleTypesService = require("../Services/TariffRateForVehicleTypes.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new tariff rate for a vehicle type
exports.createTariffRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tariffRateForVehicleTypesService.createTariffRateForVehicleType(
        req.body
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@createTariffRateForVehicleType error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create tariff rate for vehicle type",
    });
  }
};

// Get all tariff rates for vehicle types
exports.getAllTariffRatesForVehicleTypes = async (req, res) => {
  try {
    const result =
      await tariffRateForVehicleTypesService.getAllTariffRatesForVehicleTypes();
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllTariffRatesForVehicleTypes", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tariff rates for vehicle types",
    });
  }
};

// Get a tariff rate for vehicle type by ID
exports.getTariffRateForVehicleTypeById = async (req, res) => {
  try {
    const result =
      await tariffRateForVehicleTypesService.getTariffRateForVehicleTypeById(
        req.params.id
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("getTariffRateForVehicleTypeById", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tariff rate for vehicle type",
    });
  }
};

// Update a tariff rate for vehicle type by ID
exports.updateTariffRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tariffRateForVehicleTypesService.updateTariffRateForVehicleType(
        req.params.tariffRateForVehicleTypeUniqueId,
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
exports.deleteTariffRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tariffRateForVehicleTypesService.deleteTariffRateForVehicleType(
        req.params.tariffRateForVehicleTypeUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete tariff rate for vehicle type",
    });
  }
};
