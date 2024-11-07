// controllers/vehicleTypeController.js
const vehicleTypeService = require("../Services/VehicleType.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createVehicleType = async (req, res) => {
  try {
    const vehicleTypeIconName = req.file ? req.file.filename : null;
    if (!vehicleTypeIconName)
      return { message: "error", error: "Please attach vehicle type icon" };
    req.body.user = req.user;

    const data = { ...req.body, vehicleTypeIconName };
    const result = await vehicleTypeService.createVehicleType(data);
    ServerResponder(res, result);
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
      req.params.uniqueId
    );
    if (!vehicleType) {
      return ServerResponder(res, {
        error: "Vehicle Type not found",
        message: "error",
      });
    }
    ServerResponder(res, {
      message: "error",
      error: "unable to get vehicle type",
    });
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to get vehicle type",
    });
  }
};

exports.updateVehicleType = async (req, res) => {
  try {
    const vehicleTypeIconName = req.file
      ? req.file.filename
      : req.body.vehicleTypeIconName;
    const data = { ...req.body, vehicleTypeIconName };
    const result = await vehicleTypeService.updateVehicleType(
      req.params.uniqueId,
      data
    );

    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to update vehicle type",
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
