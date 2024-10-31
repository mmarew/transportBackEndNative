const tarrifRateForVehicleTypesService = require("../Services/TarrifRateForVehicleTypes.service");

// Create a new tariff rate for a vehicle type
exports.createTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.createTarrifRateForVehicleType(
        req.body
      );
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create tariff rate for vehicle type",
      error,
    });
  }
};

// Get all tariff rates for vehicle types
exports.getAllTarrifRatesForVehicleTypes = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.getAllTarrifRatesForVehicleTypes();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve tariff rates for vehicle types",
      error,
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
    if (result) {
      res.status(200).json(result);
    } else {
      res
        .status(404)
        .json({ message: "Tariff rate for vehicle type not found" });
    }
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve tariff rate for vehicle type",
      error,
    });
  }
};

// Update a tariff rate for vehicle type by ID
exports.updateTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.updateTarrifRateForVehicleType(
        req.params.id,
        req.body
      );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update tariff rate for vehicle type",
      error,
    });
  }
};

// Delete a tariff rate for vehicle type by ID
exports.deleteTarrifRateForVehicleType = async (req, res) => {
  try {
    const result =
      await tarrifRateForVehicleTypesService.deleteTarrifRateForVehicleType(
        req.params.id
      );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete tariff rate for vehicle type",
      error,
    });
  }
};
