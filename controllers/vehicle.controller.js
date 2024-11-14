const {
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
} = require("../Services/Vehicle.service");
const services = require("../Services/Vehicle.service");
const ServerResponder = require("../Utils/ServerResponder");

const createVehicleController = async (req, res) => {
  try {
    req.body.user = req.user;
    const response = await createVehicle(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.log("@createVehicleController error === ", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const getVehicleController = async (req, res) => {
  try {
    const response = await getVehicle(req.params.vehicleId);
    if (response) {
      return res.status(200).json(response);
    }
    res.status(404).json({ message: "Vehicle not found" });
  } catch (error) {
    console.log("Error fetching vehicle:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const updateVehicleController = async (req, res) => {
  try {
    const response = await updateVehicle(req.params.vehicleId, req.body);
    if (response.message === "success") {
      return res.status(200).json(response);
    }
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error updating vehicle:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const deleteVehicleController = async (req, res) => {
  try {
    const response = await deleteVehicle(req.params.vehicleId);
    if (response.message === "success") {
      return res.status(200).json(response);
    }
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  } catch (error) {
    console.log("Error deleting vehicle:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const getAllVehiclesController = async (req, res) => {
  try {
    const response = await getAllVehicles();
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error fetching vehicles:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching vehicles",
    });
  }
};
const verifyUsersVehicle = async (req, res) => {
  try {
    req.body.user = req.user;
    const { ownerUserUniqueId } = req.params;
    req.body.ownerUserUniqueId = ownerUserUniqueId;

    const response = await services.verifyUsersVehicle(req.body);
    if (response) {
      return ServerResponder(res, response);
    }
    ServerResponder(res, { message: "error", error: "Vehicle not found" });
  } catch (error) {
    console.log("Error fetching vehicle:", error);
    ServerResponder(res, { message: "error", error: "Error fetching vehicle" });
  }
};
module.exports = {
  verifyUsersVehicle,
  createVehicleController,
  getVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getAllVehiclesController,
};
