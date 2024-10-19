const services = require("../services/Driver.service");

const ServerResponder = require("../utils/ServerResponder");

const createRequest = async (req, res) => {
  try {
    const result = await services.createRequest(req.body, req.user);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.error("Error in createRequestController:", error);
    ServerResponder(res, "Driver request creation failed", 500);
  }
};

const getRequestByIdController = async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await services.getDriverRequestById(requestId);
    if (result.message === "error") {
      return ServerResponder(res, result.error, 404);
    }
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in getRequestByIdController:", error);
    ServerResponder(res, "Unable to retrieve driver request", 500);
  }
};

const acceptPassengerRequest = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.journeyStatusId = 3;
    req.body.previousStatusId = 2;
    req.body.userUniqueId = userUniqueId;
    const result = await services.acceptPassengerRequest(req.body);

    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in updateRequestByIdController:", error);
    ServerResponder(res, "Unable to update driver request", 500);
  }
};

const deleteRequestController = async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await services.deleteDriverRequest(requestId);
    if (result.message === "error") {
      return ServerResponder(res, result.error, 404);
    }
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in deleteRequestController:", error);
    ServerResponder(res, "Unable to delete driver request", 500);
  }
};

const verifyDriverStatusController = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    const result = await services.verifyDriverStatus({ userUniqueId });
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in verifyDriverStatusController:", error);
    ServerResponder(res, "Unable to verify driver status", 500);
  }
};
const startJourney = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.journeyStatusId = 4;
    req.body.userUniqueId = userUniqueId;
    req.body.previousStatusId = 3;
    const result = await services.startJourney(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in startJourney:", error);
    ServerResponder(res, error.message);
  }
};
const noAnswerFromDriver = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 11;
    req.body.previousStatusId = 2;
    // journeyStatusId=11 is for no answer from driver
    const result = await services.noAnswerFromDriver(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in noAnswerFromDriver:", error);
    ServerResponder(res, error.message);
  }
};
const journeyCompleted = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 5;
    req.body.previousStatusId = 4;
    const result = await services.journeyCompleted(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in journeyCompleted:", error);
    ServerResponder(res, error.message);
  }
};
const canceledByDriver = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 7;
    req.body.previousStatusId = [1, 2, 3, 4];
    const result = await services.canceledByDriver(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in canceledByDriver:", error);
    ServerResponder(res, error.message);
  }
};
const attachRequiredDocuments = async (req, res) => {
  try {
    const { userUniqueId } = req.user.data;
    req.body.userUniqueId = userUniqueId;
    const result = await services.attachRequiredDocuments(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in attachRequiredDocuments:", error);
    ServerResponder(res, error.message);
  }
};
module.exports = {
  attachRequiredDocuments,
  canceledByDriver,
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  getRequestByIdController,
  acceptPassengerRequest,
  deleteRequestController,
  verifyDriverStatusController,
};
