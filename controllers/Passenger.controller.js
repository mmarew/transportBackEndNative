// controllers/Passenger.controller.js
const PassengerService = require("../services/Passenger.service");
const ServerResponder = require("../Utils/ServerResponder");

const createRequest = async (req, res) => {
  try {
    const result = await PassengerService.createRequest(req.body, req.user);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to create request",
    });
  }
};

const getRequestById = async (req, res) => {
  try {
    const result = await PassengerService.getRequestById(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to retrieve request",
    });
  }
};

const updateRequestById = async (req, res) => {
  try {
    const result = await PassengerService.updateRequestById(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to update request",
    });
  }
};

const deleteRequest = async (req, res) => {
  try {
    const result = await PassengerService.deleteRequest(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to delete request",
    });
  }
};
const verifyPassengerStatus = async (req, res) => {
  try {
    // return "verifyPassengerStatus";
    const { userUniqueId } = req.user.data;
    const result = await PassengerService.verifyPassengerStatus({
      userUniqueId,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    ServerResponder(res, result, 200);
  }
};
module.exports = {
  verifyPassengerStatus,
  createRequest,
  getRequestById,
  updateRequestById,
  deleteRequest,
};
