// controllers/vehicleTypeController.js
const vehicleTypeService = require("../Services/VehicleType.service");
const { deleteFile } = require("../Utils/fileUtils");
const ServerResponder = require("../Utils/ServerResponder");

exports.createVehicleType = async (req, res) => {
  try {
    console.log("in controller create vehicle type");
    const vehicleTypeIconName = req.file ? req.file.filename : null;
    if (!vehicleTypeIconName)
      return ServerResponder(res, {
        message: "error",
        error: "Please attach vehicle type icon",
      });
    req.body.user = req.user;
    console.log("req.body", req.body);
    const data = { ...req.body, vehicleTypeIconName };
    const result = await vehicleTypeService.createVehicleType(data);
    console.log("result =========== ", result);
    if (result.message == "error") deleteFile(vehicleTypeIconName);
    return ServerResponder(res, result);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to create vehicle type",
    });
  }
};

exports.getAllVehicleTypes = async (req, res) => {
  try {
    const vehicleTypes = await vehicleTypeService.getAllVehicleTypes();
    ServerResponder(res, vehicleTypes);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to get vehicle type",
    });
  }
};

exports.getVehicleTypeByUniqueId = async (req, res) => {
  try {
    const vehicleType = await vehicleTypeService.getVehicleTypeByUniqueId(
      req.params.vehicleTypeUniqueId
    );
    if (!vehicleType) {
      return ServerResponder(res, {
        error: "Vehicle Type not found",
        message: "error",
      });
    }
    ServerResponder(res, vehicleType);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to get vehicle type",
    });
  }
};

exports.updateVehicleType = async (req, res) => {
  try {
    // Check if file is provided, set filename if available or null otherwise
    const file = req.file ? req.file : null;
    const data = { ...req.body };

    // Pass both `data` and `file` to the service function
    const result = await vehicleTypeService.updateVehicleType(
      req.params.uniqueId,
      data,
      file
    );

    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in updateVehicleType controller:", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to update vehicle type",
    });
  }
};

exports.deleteVehicleType = async (req, res) => {
  try {
    const result = await vehicleTypeService.deleteVehicleType(
      req.params.uniqueId,
      req.body.vehicleTypeDeletedBy
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to delete vehicle type",
    });
  }
};
