// controllers/Passenger.controller.js
const PassengerService = require("../Services/PassengerRequest.service");
const { journeyStatusMap, journeyStatus } = require("../Utils/ListOfFixedData");
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

const rejectDriverOffer = async (req, res) => {
  try {
    req.body.journeyStatusId = journeyStatusMap.rejectedByPassenger;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await PassengerService.rejectDriverOffer(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("@  rejectDriverOffer error", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to reject driver offer",
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
// const getPassengerRequest4allOrSingleUser = async (req, res) => {
//   try {
//     const { target, limit, page, passengerUserUniqueId } = req.query;
//     let { userUniqueId } = req.user;
//     const vehicleTypeUniqueId = req.query.vehicleTypeUniqueId;
//     const journeyStatusId = req.query.journeyStatusId;
//     const passengerRequestBatchId = req.query.passengerRequestBatchId;
//     const shippableItemName = req.query.shippableItemName;

//     const filters = {};
//     if (journeyStatusId) filters.journeyStatusId = journeyStatusId;
//     if (vehicleTypeUniqueId) filters.vehicleTypeUniqueId = vehicleTypeUniqueId;
//     if (passengerRequestBatchId)
//       filters.passengerRequestBatchId = passengerRequestBatchId;
//     if (shippableItemName) filters.shippableItemName = shippableItemName;
//     console.log("@getPassengerRequest4allOrSingleUser req.query", req.query);

//     const data = {
//       filters,
//       userUniqueId:
//         passengerUserUniqueId == "self" ? userUniqueId : passengerUserUniqueId,
//       target,
//       limit,
//       page,
//     };

//     const result = await PassengerService.getPassengerRequest4allOrSingleUser({
//       data,
//     });
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("@getPassengerRequest4allOrSingleUser error", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Unable to retrieve request",
//     });
//   }
// };

const getPassengerRequest4allOrSingleUser = async (req, res) => {
  try {
    const { target, limit, page, passengerUserUniqueId } = req.query;
    let { userUniqueId } = req.user;
    const vehicleTypeUniqueId = req.query.vehicleTypeUniqueId;

    // Handle multiple journeyStatusId values (comma-separated or array)
    let journeyStatusIds = req.query.journeyStatusId;
    if (journeyStatusIds) {
      if (typeof journeyStatusIds === "string") {
        journeyStatusIds = journeyStatusIds.split(",").map((id) => id.trim());
      }
      // Convert to array if it's not already
      journeyStatusIds = Array.isArray(journeyStatusIds)
        ? journeyStatusIds
        : [journeyStatusIds];
    }

    const passengerRequestBatchId = req.query.passengerRequestBatchId;
    const shippableItemName = req.query.shippableItemName;

    const filters = {};
    if (journeyStatusIds && journeyStatusIds.length > 0)
      filters.journeyStatusIds = journeyStatusIds;
    if (vehicleTypeUniqueId) filters.vehicleTypeUniqueId = vehicleTypeUniqueId;
    if (passengerRequestBatchId)
      filters.passengerRequestBatchId = passengerRequestBatchId;
    if (shippableItemName) filters.shippableItemName = shippableItemName;

    console.log("@getPassengerRequest4allOrSingleUser req.query", req.query);

    const data = {
      filters,
      userUniqueId:
        passengerUserUniqueId == "self" ? userUniqueId : passengerUserUniqueId,
      target,
      limit,
      page,
    };

    const result = await PassengerService.getPassengerRequest4allOrSingleUser({
      data,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getPassengerRequest4allOrSingleUser error", error);
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
    const { pageSize, page } = req?.query;
    const { userUniqueId } = req?.user ?? {};
    const result = await usersCurrentStatus.verifyPassengerStatus({
      userUniqueId,
      pageSize,
      page,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    ServerResponder(
      res,
      {
        message: "error",
        error: "Unable to verify passenger status",
      },
      200
    );
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
const seenByPassenger = async (req, res) => {
  try {
    const user = req.user;
    const userUniqueId = user?.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await PassengerService.seenByPassenger(req.body);
    ServerResponder(res, result, 200);
  } catch (error) {
    ServerResponder(res, result, 200);
  }
};
module.exports = {
  getRecentCompletedJourney,
  acceptDriverRequest,
  getPassengerRequestByPassengerRequestUniqueId,
  getPassengerRequest4allOrSingleUser,
  getAllActiveRequests,
  cancelPassengerRequest,
  verifyPassengerStatus,
  createPassengerRequest,
  updateRequestById,
  deleteRequest,
  rejectDriverOffer,
  seenByPassenger,
};
