const VehicleTypeService = require("../Services/VechleType.service");
const { vehicleTypes } = require("../Utils/listOfFixedData");
const ServerResponder = require("../Utils/ServerResponder");
const createVehicleTypeController = async (req, res) => {
  try {
    const user = req?.user;
    const { vehicleTypeName, carryingCapacity } = req.body;

    const result = await VehicleTypeService.createVehicleType(
      { vehicleTypeName, carryingCapacity },
      user.userUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    // Log the error for debugging
    console.error("Error in createVehicleTypeController:", error);

    // Send error response
    return ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle type",
    });
  }
};

const getAllVehicleTypesController = async (req, res) => {
  try {
    const result = await VehicleTypeService.getAllVehicleTypes();
    ServerResponder(res, result);
  } catch (error) {
    return ServerResponder(res, {
      message: "error",
      error: "Failed to get vehicle type",
    });
  }
};

const getVehicleTypeByIdController = async (req, res) => {
  try {
    const vehicleTypeId = req.params.vehicleTypeId;
    const result = await VehicleTypeService.getVehicleTypeById(vehicleTypeId);
    ServerResponder(res, result);
  } catch (error) {
    return ServerResponder(res, {
      message: "error",
      error: "Failed to get vehicle type",
    });
  }
};

const updateVehicleTypeController = async (req, res) => {
  try {
    const vehicleTypeId = req.params.vehicleTypeId;
    const result = await VehicleTypeService.updateVehicleType(
      vehicleTypeId,
      req.body,
      req?.user.userUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    return ServerResponder(res, {
      message: "error",
      error: "Failed to delete vehicle type",
    });
  }
};

const deleteVehicleTypeController = async (req, res) => {
  try {
    const vehicleTypeId = req.params.vehicleTypeId;
    const result = await VehicleTypeService.deleteVehicleType(
      vehicleTypeId,
      req?.user.userUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting vehicle type:", error);
    return ServerResponder(res, {
      message: "error",
      error: "Failed to delete vehicle type",
    });
  }
};

module.exports = {
  createVehicleTypeController,
  getAllVehicleTypesController,
  getVehicleTypeByIdController,
  updateVehicleTypeController,
  deleteVehicleTypeController,
};
