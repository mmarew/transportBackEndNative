const {
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
  verifyUsersVehicle,
} = require("../Services/Vehicle.service");
const ServerResponder = require("../Utils/ServerResponder");

const createVehicleController = async (req, res) => {
  try {
    const response = await createVehicle(req.body, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@createVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const getVehicleController = async (req, res) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await getVehicle(vehicleUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@getVehicleController error:", error);
    ServerResponder(res, { message: "error", error: "Failed to get vehicle" });
  }
};

const updateVehicleController = async (req, res) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await updateVehicle(vehicleUniqueId, req.body, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@updateVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update vehicle",
    });
  }
};

const deleteVehicleController = async (req, res) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await deleteVehicle(vehicleUniqueId, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@deleteVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete vehicle",
    });
  }
};

const getAllVehiclesController = async (req, res) => {
  try {
    const response = await getAllVehicles();
    ServerResponder(res, response);
  } catch (error) {
    console.error("@getAllVehiclesController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch vehicles",
    });
  }
};

const verifyUsersVehicleController = async (req, res) => {
  try {
    const { ownerUserUniqueId } = req.params;
    const response = await verifyUsersVehicle(ownerUserUniqueId, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@verifyUsersVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to verify vehicle",
    });
  }
};

module.exports = {
  createVehicleController,
  getVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getAllVehiclesController,
  verifyUsersVehicleController,
};
