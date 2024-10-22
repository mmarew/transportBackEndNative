const VehicleTypeService = require("../services/VechleType.service");
const { vehicleTypes } = require("../Utils/listOfFixedData");
const ServerResponder = require("../Utils/ServerResponder");
const createVehicleTypeController = async (req, res) => {
  try {
    const user = req?.user;

    // Array to store the results of each creation attempt
    const creationPromises = vehicleTypes.map((vehicleType) => {
      return VehicleTypeService.createVehicleType(
        vehicleType,
        user.userUniqueId
      );
    });

    // Execute all promises in parallel
    const results = await Promise.all(creationPromises);

    // Separate success and error responses
    const successData = [];
    const errorData = [];

    results.forEach((result) => {
      if (result.message === "success") {
        successData.push(result.data);
      } else {
        errorData.push({ data: result.data, error: result.error });
      }
    });

    // Determine response based on success and failure counts
    if (successData.length === vehicleTypes.length) {
      // All vehicle types created successfully
      return ServerResponder(res, { message: "success", data: successData });
    } else if (errorData.length === vehicleTypes.length) {
      // All vehicle types failed to create
      return ServerResponder(res, { message: "error", data: errorData });
    } else {
      // Partial success and partial failure
      return ServerResponder(res, {
        message: "partial_success",
        error: "Some vehicle types failed to create, others succeeded.",
        data: { errorData, successData },
      });
    }
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
