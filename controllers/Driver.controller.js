const services = require("../Services/DriverRequest.service");

const ServerResponder = require("../Utils/ServerResponder");

const createRequest = async (req, res) => {
  try {
    const result = await services.createRequest(req.body, req.user);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.log("Error in createRequestController:", error);
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
    console.log("Error in getRequestByIdController:", error);
    ServerResponder(res, "Unable to retrieve driver request", 500);
  }
};

const acceptPassengerRequest = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 3;
    req.body.previousStatusId = 2;
    const result = await services.acceptPassengerRequest(req.body);

    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in updateRequestByIdController:", error);
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
    console.log("Error in deleteRequestController:", error);
    ServerResponder(res, "Unable to delete driver request", 500);
  }
};

const verifyDriverStatusController = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    const result = await services.verifyDriverStatus({ userUniqueId });
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in verifyDriverStatusController:", error);
    ServerResponder(res, "Unable to verify driver status", 500);
  }
};
const startJourney = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.journeyStatusId = 4;
    req.body.previousStatusId = 3;
    req.body.userUniqueId = userUniqueId;
    const result = await services.startJourney(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in startJourney:", error);
    ServerResponder(res, error.message);
  }
};
const noAnswerFromDriver = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 11;
    req.body.previousStatusId = 2;
    // journeyStatusId=11 is for no answer from driver
    const result = await services.noAnswerFromDriver(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in noAnswerFromDriver:", error);
    ServerResponder(res, error.message);
  }
};
const journeyCompleted = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = 5;
    req.body.previousStatusId = 4;
    const result = await services.journeyCompleted(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in journeyCompleted:", error);
    ServerResponder(res, {
      message: "error",
      error: "error on journey complete",
    });
  }
};
const cancelDriverRequest = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.params.userUniqueId;
    const roleId = req.params.roleId;
    if (ownerUserUniqueId == "self") ownerUserUniqueId = userUniqueId;
    req.body.ownerUserUniqueId = ownerUserUniqueId;
    req.body.user = user;
    req.body.roleId = roleId;
    const result = await services.cancelDriverRequest(req.body);
    console.log("@cancelDriverRequest result", result);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in canceledByDriver:", error);
    ServerResponder(res, error.message);
  }
};
const attachRequiredDocuments = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    const result = await services.attachRequiredDocuments(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in attachRequiredDocuments:", error);
    ServerResponder(res, error.message);
  }
};
const driversDocumentVehicleRequirement = async (req, res) => {
  try {
    const user = req?.user;
    const userRoleStatus = req?.userRoleStatus,
      userRole = req?.userRole;

    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.params.userUniqueId;

    if (ownerUserUniqueId == "self") ownerUserUniqueId = userUniqueId;
    req.body.user = user;
    req.body.userRole = userRole;
    req.body.userRoleStatus = userRoleStatus;
    req.body.ownerUserUniqueId = ownerUserUniqueId;
    const result = await services.driversDocumentVehicleRequirement(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("first error", error);
    console.log("@driversDocumentVehicleRequirement error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to see usersDocument",
    });
  }
};
module.exports = {
  driversDocumentVehicleRequirement,
  attachRequiredDocuments,
  cancelDriverRequest,
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  getRequestByIdController,
  acceptPassengerRequest,
  deleteRequestController,
  verifyDriverStatusController,
};
