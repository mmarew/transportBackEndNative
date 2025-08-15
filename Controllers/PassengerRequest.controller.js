// controllers/Passenger.controller.js
const PassengerService = require("../Services/PassengerRequest.service");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");
const ServerResponder = require("../Utils/ServerResponder");
const usersCurrentStatus = require("../Services/UsersCurrentStatus");
const createPassengerRequest = async (req, res) => {
  try {
    console.log("@createPassengerRequest req.body", req.body);
    const {
      passengerRequestBatchId,
      destination,
      vehicle,
      originLocation,
      numberOfVehicles,
      shippingDate,
      shippingCost,
      shippableItemQtyInQuintal,
      shippableItemName,
      deliveryDate,
    } = req.body;
    if (
      !passengerRequestBatchId ||
      !destination ||
      !vehicle ||
      !originLocation ||
      !numberOfVehicles ||
      !shippingDate ||
      !shippingCost ||
      !shippableItemQtyInQuintal ||
      !shippableItemName ||
      !deliveryDate
    ) {
      return ServerResponder(res, {
        message: "error",
        error: "Missing required fields",
      });
    }
    const result = await PassengerService.createPassengerRequest(
      req.body,
      req.user
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to create request",
    });
  }
};
const acceptDriverRequest = async (req, res) => {
  try {
    req.body.journeyStatusId = journeyStatusMap.acceptedByPassenger;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await PassengerService.acceptDriverRequest(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("@acceptDriverRequest error", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to accept driver request",
    });
  }
};
const getAllActiveRequests = async (req, res) => {
  try {
    const result = await PassengerService.getAllActiveRequests();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to get requests",
    });
  }
};
const getRecentCompletedJourney = async (req, res) => {
  try {
    const user = req.user;
    const result = await PassengerService.getRecentCompletedJourney(user);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to retrieve recent request",
    });

    console.log("@getRecentCompletedJourney error", error);
  }
};
const getPassengerRequestByPassengerRequestUniqueId = async (req, res) => {
  try {
    const result =
      await PassengerService.getPassengerRequestByPassengerRequestUniqueId(
        req.params.id
      );
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
    const result = await usersCurrentStatus.verifyPassengerStatus({
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
  getRecentCompletedJourney,
  acceptDriverRequest,
  getPassengerRequestByPassengerRequestUniqueId,
  getAllActiveRequests,
  cancelPassengerRequest,
  verifyPassengerStatus,
  createPassengerRequest,
  updateRequestById,
  deleteRequest,
};
