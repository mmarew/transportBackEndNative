// controllers/vehicleStatusType.controller.js
const vehicleStatusTypeService = require("../Services/VehicleStatusType.service");
const ServerResponder = require("../utils/ServerResponder"); // Assuming you have a utility for consistent responses

// Create a new VehicleStatusType
const createVehicleStatusType = async (req, res) => {
  try {
    const result = await vehicleStatusTypeService.createVehicleStatusType(
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to create VehicleStatusType",
    });
  }
};

// Get all VehicleStatusTypes
const getAllVehicleStatusTypes = async (req, res) => {
  try {
    const result = await vehicleStatusTypeService.getAllVehicleStatusTypes();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to fetch VehicleStatusTypes",
    });
  }
};

// Get a single VehicleStatusType by ID
const getVehicleStatusTypeById = async (req, res) => {
  try {
    const result = await vehicleStatusTypeService.getVehicleStatusTypeById(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to fetch VehicleStatusType",
    });
  }
};

// Update VehicleStatusType by ID
const updateVehicleStatusType = async (req, res) => {
  try {
    const result = await vehicleStatusTypeService.updateVehicleStatusType(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to update VehicleStatusType",
    });
  }
};

// Delete VehicleStatusType by ID
const deleteVehicleStatusType = async (req, res) => {
  try {
    const result = await vehicleStatusTypeService.deleteVehicleStatusType(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to delete VehicleStatusType",
    });
  }
};

module.exports = {
  createVehicleStatusType,
  getAllVehicleStatusTypes,
  getVehicleStatusTypeById,
  updateVehicleStatusType,
  deleteVehicleStatusType,
};
