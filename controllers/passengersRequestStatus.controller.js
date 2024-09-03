// controllers/passengersRequestStatusController.js
const {
  registerPassengersRequestStatus,
  getPassengersRequestStatus,
  updatePassengersRequestStatus,
  deletePassengersRequestStatus,
  getAllPassengersRequestStatus,
} = require("../services/passengersRequestStatus.service");
const ServerResponder = require("../Utils/ServerResponder");

const registerPassengersRequestStatusController = async (req, res) => {
  try {
    const response = await registerPassengersRequestStatus(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger request status registration failed",
    });
  }
};

const getPassengersRequestStatusController = async (req, res) => {
  try {
    const response = await getPassengersRequestStatus(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve passenger request status",
    });
  }
};

const updatePassengersRequestStatusController = async (req, res) => {
  try {
    const response = await updatePassengersRequestStatus(
      req.params.id,
      req.body
    );
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to update passenger request status",
    });
  }
};

const deletePassengersRequestStatusController = async (req, res) => {
  try {
    const response = await deletePassengersRequestStatus(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete passenger request status",
    });
  }
};

const getAllPassengersRequestStatusController = async (req, res) => {
  try {
    const response = await getAllPassengersRequestStatus();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve passenger request statuses",
    });
  }
};
module.exports = {
  getAllPassengersRequestStatusController,
  registerPassengersRequestStatusController,
  getPassengersRequestStatusController,
  updatePassengersRequestStatusController,
  deletePassengersRequestStatusController,
};
