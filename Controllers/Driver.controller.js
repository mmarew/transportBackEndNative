const services = require("../Services/DriverRequest.service");
const UsersCurrentStatus = require("../Services/UsersCurrentStatus");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

const ServerResponder = require("../Utils/ServerResponder");

const createRequest = async (req, res) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;
    if (!userUniqueId) {
      return ServerResponder(res, "User not authenticated", 401);
    }
    req.body.userUniqueId = userUniqueId;
    const result = await services?.createRequest({ body: req.body });
    ServerResponder(res, result, 201);
  } catch (error) {
    console.log("Error in createRequestController:", error);
    ServerResponder(res, "Driver request creation failed", 500);
  }
};
const takeFromStreet = async (req, res) => {
  try {
    console.log("@takeFromStreet req.user", req.user);
    const user = req.user;

    const shipperRequestCreatedBy = user?.userUniqueId;
    const shipperRequestCreatedByRoleId = user?.roleId;
    req.body.shipperRequestCreatedBy = shipperRequestCreatedBy;
    req.body.shipperRequestCreatedByRoleId = shipperRequestCreatedByRoleId;
    req.body.userUniqueId = shipperRequestCreatedBy;
    const result = await services.takeFromStreet({ ...req.body }, req.user);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.log("Error in createRequestController:", error);
    ServerResponder(res, "Driver request creation failed", 500);
  }
};
const createAndAcceptNewRequest = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;

    req.body.userUniqueId = userUniqueId;

    const result = await services.createAndAcceptNewRequest(req.body);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.log("Error in createAndAcceptNewRequest:", error);
    ServerResponder(res, "Driver request creation failed", 500);
  }
};
// Get a specific driver request by ID

const getRequestByIdController = async (req, res) => {
  try {
    const { driverRequestUniqueId } = req.params;
    const result = await services.getDriverRequestByRequestUniqueId(
      driverRequestUniqueId
    );
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
    req.body.journeyStatusId = journeyStatusMap.acceptedByDriver;
    req.body.previousStatusId = journeyStatusMap.requested;
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
    const result = await UsersCurrentStatus.verifyDriverStatus({
      userUniqueId,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in verifyDriverStatusController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to verify driver status" },
      500
    );
  }
};
// const getDriverRequestController = async (req, res) => {
//   try {
//     // driverUniqueId=uuidv4&target=allOrSingleDriverRequests
//     const { userUniqueId } = req?.user;
//     const { driverUserUniqueId, target } = req?.query;
//     const journeyStatusIds = req?.query?.journeyStatusIds;
//     console.log("@journeyStatusIds", journeyStatusIds);
//     const journeyStatusIdsArray = journeyStatusIds?.split(",");

//     const data = {
//       userUniqueId:
//         driverUserUniqueId == "self" ? userUniqueId : driverUserUniqueId,
//       target,
//       filters: {},
//     };
//     if (journeyStatusIdsArray.length == 1) {
//       data.filters.journeyStatusId = journeyStatusIdsArray[0];
//     } else if (journeyStatusIdsArray.length > 1) {
//       data.filters.journeyStatusIds = journeyStatusIdsArray;
//     }
//     console.log("@getDriverRequestController data", data);
//     // return;
//     const result = await services.getDriverRequest({ data });
//     // console.log("@getDriverRequestController result", result);
//     ServerResponder(res, result, 200);
//   } catch (error) {
//     console.log("Error in getDriverRequestController:", error);
//     ServerResponder(
//       res,
//       { message: "error", error: "Unable to get driver request" },
//       500
//     );
//   }
// };

const getDriverRequestController = async (req, res) => {
  try {
    // Extract logged-in user id from middleware (auth)
    const { userUniqueId } = req?.user || {};
    // Query params
    const {
      driverUserUniqueId,
      target = "all",
      page = 1,
      limit = 10,
      journeyStatusIds,
      startDate,
      endDate,
      originPlace,
      username,
      email,
      phoneNumber,
      sortBy,
      sortOrder,
    } = req.query;

    // Handle journey status ids (single or multiple)
    let filters = {};
    if (journeyStatusIds) {
      const journeyStatusIdsArray = journeyStatusIds.split(",");
      if (journeyStatusIdsArray.length === 1) {
        filters.journeyStatusId = journeyStatusIdsArray[0];
      } else {
        filters.journeyStatusIds = journeyStatusIdsArray;
      }
    }

    // Add optional filters
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (originPlace) filters.originPlace = originPlace;
    if (username) filters.username = username;
    if (email) filters.email = email;
    if (phoneNumber) filters.phoneNumber = phoneNumber;
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    const data = {
      userUniqueId:
        driverUserUniqueId === "self" ? userUniqueId : driverUserUniqueId,
      target,
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
    };

    console.log("@getDriverRequestController data", data);

    const result = await services.getDriverRequest({ data });

    return ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in getDriverRequestController:", error);
    return ServerResponder(
      res,
      { message: "error", error: "Unable to get driver request" },
      500
    );
  }
};

const startJourney = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.journeyStatusId = journeyStatusMap.journeyStarted; //5;
    req.body.previousStatusId = journeyStatusMap.acceptedByPassenger; //4;
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
    console.log("@noAnswerFromDriver req.body is ", req.body);

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
    req.body.journeyStatusId = journeyStatusMap.journeyCompleted;
    req.body.previousStatusId = journeyStatusMap.journeyStarted;
    const result = await services.journeyCompleted(req.body);
    console.log("@journeyCompleted result", result);
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
    console.log("Error in canceledByDriver:", error.message);
    ServerResponder(res, {
      message: "error",
      error: "unable to cancel request",
    });
  }
};
const attachRequiredDocuments = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    const result = await services.attachRequiredDocuments(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in attachRequiredDocuments:", error.message);
    ServerResponder(res, {
      message: "error",
      error: "unable to attach documents",
    });
  }
};
const sendUpdatedLocationController = async (req, res) => {
  try {
    const { userUniqueId } = req?.user;
    req.body.userUniqueId = userUniqueId;
    const result = await services.sendUpdatedLocation(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in sendUpdatedLocationController:", error.message);
    ServerResponder(res, {
      message: "error",
      error: "unable to send updated location",
    });
  }
};
module.exports = {
  sendUpdatedLocationController,
  createAndAcceptNewRequest,
  attachRequiredDocuments,
  cancelDriverRequest,
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  getRequestByIdController,
  acceptPassengerRequest,
  deleteRequestController,
  takeFromStreet,
  verifyDriverStatusController,
  getDriverRequestController,
};
