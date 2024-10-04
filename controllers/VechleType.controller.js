// controllers/vehicleTypeController.js

const {
  registerVehicleType,
  getVehicleType,
  updateVehicleType,
  deleteVehicleType,
  getAllVehicleTypes,
} = require("../services/VechleType.service");
const ServerResponder = require("../Utils/ServerResponder");

const registerVehicleTypeController = async (req, res) => {
  try {
    const response = await registerVehicleType(req?.body, req?.file);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Vehicle type registration failed",
    });
  }
};

const getVehicleTypeController = async (req, res) => {
  try {
    const response = await getVehicleType(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve vehicle type",
    });
  }
};

const updateVehicleTypeController = async (req, res) => {
  try {
    const response = await updateVehicleType(req.params.id, req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to update vehicle type",
    });
  }
};

const deleteVehicleTypeController = async (req, res) => {
  try {
    const response = await deleteVehicleType(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete vehicle type",
    });
  }
};

const getAllVehicleTypesController = async (req, res) => {
  try {
    const response = await getAllVehicleTypes();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve vehicle types",
    });
  }
};

module.exports = {
  registerVehicleTypeController,
  getVehicleTypeController,
  updateVehicleTypeController,
  deleteVehicleTypeController,
  getAllVehicleTypesController,
};
