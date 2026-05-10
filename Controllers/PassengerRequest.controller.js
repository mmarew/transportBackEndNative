// controllers/Passenger.controller.js
const PassengerService = require("../Services/PassengerRequest");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { createUser } = require("../Services/User.service");
const { usersRoles, USER_STATUS } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");

const createPassengerRequest = async (req, res, next) => {
  try {
    const {
      shipperRequestBatchId,
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
      !shipperRequestBatchId ||
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
      throw new AppError(
        "Missing required fields to create shipper request",
        400,
      );
    }

    const roleId = req.user.roleId;
    logger.debug("createPassengerRequest roleId", { roleId });
    const userUniqueId = req.user.userUniqueId;
    // return;
    if (roleId === 1) {
      req.body.userUniqueId = userUniqueId;
    }

    const shipperRequestCreatedBy = userUniqueId;
    const shipperRequestCreatedByRoleId = req.user.roleId;
    req.body.shipperRequestCreatedBy = shipperRequestCreatedBy;
    req.body.shipperRequestCreatedByRoleId = shipperRequestCreatedByRoleId;

    const result = await executeInTransaction(
      async () => {
        if (shipperRequestCreatedByRoleId === usersRoles.adminRoleId) {
          const { shipperPhoneNumber } = req.body;
          if (!shipperPhoneNumber) {
            throw new AppError(
              "shipperPhoneNumber is required when an admin creates request for shipper",
              400,
            );
          }
          const randNumber = Math.floor(1000 + Math.random() * 900000);
          const createdUser = await createUser({
            phoneNumber: shipperPhoneNumber,
            fullName: null,
            roleId: usersRoles.shipperRoleId,
            statusId: USER_STATUS.ACTIVE,
            email: `fakeEmail_${randNumber}@shipper.com`,
            userRoleStatusDescription: "this is shipper ",
            requestedFrom: "system",
          });

          if (createdUser?.message === "error") {
            throw new AppError(
              createdUser.error || "Failed to create user for shipper",
              400,
            );
          }

          const dataOfPassenger = createdUser?.dataOfPassenger;
          userUniqueId = dataOfPassenger?.userUniqueId;

          if (!userUniqueId) {
            throw new AppError(
              "Failed to get userUniqueId from created user",
              500,
            );
          }

          req.body.userUniqueId = userUniqueId;
        }

        return await PassengerService.createPassengerRequest(
          req.body,
          journeyStatusMap.waiting,
        );
      },
      {
        timeout: 60000,
        logging: true,
      },
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const acceptDriverRequest = async (req, res, next) => {
  try {
    req.body.journeyStatusId = journeyStatusMap.acceptedByPassenger;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await PassengerService.acceptDriverRequest(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const rejectDriverOffer = async (req, res, next) => {
  try {
    req.body.journeyStatusId = journeyStatusMap.rejectedByPassenger;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await PassengerService.rejectDriverOffer(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getPassengerRequestByPassengerRequestUniqueId = async (
  req,
  res,
  next,
) => {
  try {
    const result = await PassengerService.getPassengerRequest4allOrSingleUser({
      data: {
        target: "all",
        filters: { shipperRequestUniqueId: req.params.id },
        page: 1,
        limit: 1,
      },
    });
    const shipperRequest = result?.formattedData?.[0] || null;
    if (shipperRequest) {
      ServerResponder(res, { message: "success", data: shipperRequest });
    } else {
      throw new AppError("Request not found", 404);
    }
  } catch (error) {
    next(error);
  }
};

const getPassengerRequest4allOrSingleUser = async (req, res, next) => {
  try {
    const { target, limit, page, shipperUserUniqueId } = req.query;
    let { userUniqueId } = req.user;

    let journeyStatusIds = req.query.journeyStatusId;
    if (journeyStatusIds) {
      if (typeof journeyStatusIds === "string") {
        journeyStatusIds = journeyStatusIds.split(",").map((id) => id.trim());
      }
      journeyStatusIds = Array.isArray(journeyStatusIds)
        ? journeyStatusIds
        : [journeyStatusIds];
    }

    const filters = { ...req.query };
    if (journeyStatusIds && journeyStatusIds.length > 0) {
      filters.journeyStatusIds = journeyStatusIds;
    }

    const data = {
      filters,
      userUniqueId:
        shipperUserUniqueId === "self" || !shipperUserUniqueId
          ? userUniqueId
          : shipperUserUniqueId,
      target,
      limit,
      page,
    };

    const result = await PassengerService.getPassengerRequest4allOrSingleUser({
      data,
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateRequestById = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await PassengerService.updateRequestById(req.params.id, req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deleteRequest = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await PassengerService.deleteRequest(req.params.id);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const verifyPassengerStatus = async (req, res, next) => {
  try {
    const { pageSize, page } = req?.query;
    const { userUniqueId } = req?.user ?? {};
    const result = await PassengerService.verifyPassengerStatus({
      userUniqueId,
      pageSize,
      page,
      sendNotificationsToDrivers: true,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};
const cancelPassengerRequest = async (req, res, next) => {
  try {
    let ownerUserUniqueId = req?.params?.userUniqueId;
    const { userUniqueId, roleId } = req?.user;
    const { shipperRequestUniqueId } = req?.body;

    if (!shipperRequestUniqueId || !userUniqueId || !roleId) {
      throw new AppError(
        "shipperRequestUniqueId is required in request body",
        400,
      );
    }

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = userUniqueId;
    }

    const cancellationJourneyStatusId =
      ownerUserUniqueId === userUniqueId
        ? journeyStatusMap.cancelledByPassenger
        : journeyStatusMap.cancelledByAdmin;

    req.body.ownerUserUniqueId = ownerUserUniqueId;
    req.body.user = req.user;
    req.body.cancellationJourneyStatusId = cancellationJourneyStatusId;

    const result = await executeInTransaction(async () => {
      return await PassengerService.cancelPassengerRequest(req.body);
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel an entire shipper request batch in one atomic operation.
 * PUT /api/shipperRequest/cancelBatch/:shipperRequestBatchId
 */
const cancelPassengerRequestBatch = async (req, res, next) => {
  try {
    const { userUniqueId, roleId } = req.user;
    const { shipperRequestBatchId } = req.params;
    const { cancellationReasonsTypeId } = req.body;

    const result = await executeInTransaction(async () =>
      PassengerService.cancelPassengerRequestBatch({
        shipperRequestBatchId,
        userUniqueId,
        roleId,
        cancellationReasonsTypeId,
      }),
    );

    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};

const markJourneyCompletionAsSeenController = async (req, res, next) => {
  try {
    const user = req.user;
    const userUniqueId = user?.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await PassengerService.seenByPassenger(req.body);
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};

const getCancellationNotificationsController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user;
    const { seenStatus, page, limit } = req.query;

    if (!userUniqueId) {
      throw new AppError("User not authenticated", 401);
    }

    const result = await PassengerService.getCancellationNotifications({
      userUniqueId,
      seenStatus,
      page: page || 1,
      limit: limit || 10,
    });

    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};

const markCancellationAsSeenController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const { journeyDecisionUniqueId } = req.body;
    const bodyUserUniqueId = req.body?.userUniqueId;

    const result = await executeInTransaction(async () => {
      return await PassengerService.markCancellationAsSeen({
        userUniqueId: bodyUserUniqueId || userUniqueId,
        journeyDecisionUniqueId,
      });
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    next(error);
  }
};

const getAllActiveRequestsController = async (req, res, next) => {
  try {
    const filters = {
      userUniqueId: req.query.userUniqueId,
      email: req.query.email,
      phoneNumber: req.query.phoneNumber,
      fullName: req.query.fullName,
      vehicleTypeUniqueId: req.query.vehicleTypeUniqueId,
      journeyStatusId: req.query.journeyStatusId,
      shippableItemName: req.query.shippableItemName,
      originPlace: req.query.originPlace,
      destinationPlace: req.query.destinationPlace,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      shippingDate: req.query.shippingDate,
      deliveryDate: req.query.deliveryDate,
      page: req.query.page ? parseInt(req.query.page) : 1,
      limit: req.query.limit ? parseInt(req.query.limit) : 10,
      sortBy: req.query.sortBy || "shipperRequestCreatedAt",
      sortOrder: req.query.sortOrder || "DESC",
    };

    const result = await PassengerService.getAllActiveRequests(filters);

    return ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  acceptDriverRequest,
  getPassengerRequestByPassengerRequestUniqueId,
  getPassengerRequest4allOrSingleUser,
  cancelPassengerRequest,
  cancelPassengerRequestBatch,
  verifyPassengerStatus,
  createPassengerRequest,
  updateRequestById,
  deleteRequest,
  rejectDriverOffer,
  markJourneyCompletionAsSeenController,
  getCancellationNotificationsController,
  markCancellationAsSeenController,
  getAllActiveRequestsController,
};
