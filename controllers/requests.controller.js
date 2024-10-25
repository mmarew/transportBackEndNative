const {
  getRequestById,
  deleteRequest,
} = require("../services/requests.service");
const service = require("../services/requests.service");
const ServerResponder = require("../Utils/ServerResponder");
const updateServices = require("../services/Request.update.service");
const verifyStatusOfUser = async (req, res) => {
  try {
    const result = await service.verifyStatusOfUser(req);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to verify status of user",
    });
  }
};
const createRequest = async (req, res) => {
  try {
    const result = await service.createRequest(req.body, req.user);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to create request",
    });
  }
};

const getRequestController = async (req, res) => {
  try {
    const result = await getRequestById(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to  get request",
    });
  }
};

const acceptPassengerRequest = async (req, res) => {
  try {
    const result = await updateServices.acceptPassengerRequest(req);
    ServerResponder(res, result);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to accept request",
    });
  }
};

const deleteRequestController = async (req, res) => {
  try {
    const result = await deleteRequest(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to delete request",
    });
  }
};

const startJourney = async (req, res) => {
  try {
    const result = await updateServices.startJourney(req);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to start journey",
    });
  }
};
const cancelRequest = async (req, res) => {
  try {
    const result = await service.cancelRequest(req);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to cancel request",
    });
  }
};
const journeyCompleted = async (req, res) => {
  try {
    const result = await updateServices.journeyCompleted(req);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to complete journey",
    });
  }
};
const getRecentCompletedJourneys = async (req, res) => {
  try {
    console.log("@ getRecentCompletedJourneys", req.body);
    const result = await service.getRecentCompletedJourneys(req);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to get recent completed journeys",
    });
  }
};
module.exports = {
  getRecentCompletedJourneys,
  startJourney,
  journeyCompleted,
  cancelRequest,
  verifyStatusOfUser,
  createRequest,
  getRequestController,
  acceptPassengerRequest,
  deleteRequestController,
};
