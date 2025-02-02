const vehicleStatusService = require("../Services/VehicleStatus.service");
const ServerResponder = require("../Utils/ServerResponder");

const createVehicleStatus = async (req, res) => {
  try {
    const result = await vehicleStatusService.createVehicleStatus(req.body);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to create VehicleStatus",
    });
  }
};

const getVehicleStatusById = async (req, res) => {
  try {
    const result = await vehicleStatusService.getVehicleStatusById(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to retrieve VehicleStatus",
    });
  }
};

const updateVehicleStatus = async (req, res) => {
  try {
    const result = await vehicleStatusService.updateVehicleStatus(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to update VehicleStatus",
    });
  }
};

const deleteVehicleStatus = async (req, res) => {
  try {
    const result = await vehicleStatusService.deleteVehicleStatus(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to delete VehicleStatus",
    });
  }
};

module.exports = {
  createVehicleStatus,
  getVehicleStatusById,
  updateVehicleStatus,
  deleteVehicleStatus,
};
