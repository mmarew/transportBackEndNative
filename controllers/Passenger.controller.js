// controllers/Passenger.controller.js
const PassengerService = require("../Services/Passenger.service");
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
    const { userUniqueId } = req?.user;
    const result = await PassengerService.verifyPassengerStatus({
      userUniqueId,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    ServerResponder(res, result, 200);
  }
};
const cancelPassengerRequest = async (req, res) => {
  try {
    let ownerUserUniqueId = req.params.userUniqueId;
    const { userUniqueId } = req?.user;

    if (ownerUserUniqueId == "self") ownerUserUniqueId = userUniqueId;
    req.body.ownerUserUniqueId = ownerUserUniqueId;
    req.body.user = req.user;

    const user = req.user;
    req.body.user = user;
    const result = await PassengerService.cancelPassengerRequest(req.body);
    ServerResponder(res, result, 200);
  } catch (error) {
    ServerResponder(res, result, 200);
  }
};
module.exports = {
  cancelPassengerRequest,
  verifyPassengerStatus,
  createRequest,
  getRequestById,
  updateRequestById,
  deleteRequest,
};
