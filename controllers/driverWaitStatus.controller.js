const {
  registerDriverWaitStatus,
  getAllDriverWaitStatuses,
  updateDriverWaitStatus,
  deleteDriverWaitStatus,
} = require("../services/driverWaitStatus.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new DriverWaitStatus
const createDriverWaitStatusController = async (req, res) => {
  try {
    const response = await registerDriverWaitStatus(req.body);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      data: "Failed to create DriverWaitStatus",
    });
  }
};

// Get all DriverWaitStatuses
const getDriverWaitStatusController = async (req, res) => {
  try {
    const response = await getAllDriverWaitStatuses();
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve DriverWaitStatuses",
    });
  }
};

// Update a DriverWaitStatus by ID
const updateDriverWaitStatusController = async (req, res) => {
  try {
    const response = await updateDriverWaitStatus(req.params.id, req.body);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      data: "Failed to update DriverWaitStatus",
    });
  }
};

// Delete a DriverWaitStatus by ID
const deleteDriverWaitStatusController = async (req, res) => {
  try {
    const response = await deleteDriverWaitStatus(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete DriverWaitStatus",
    });
  }
};

module.exports = {
  createDriverWaitStatusController,
  getDriverWaitStatusController,
  updateDriverWaitStatusController,
  deleteDriverWaitStatusController,
};
