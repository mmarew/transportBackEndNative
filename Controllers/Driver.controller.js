const { v4: uuidv4 } = require("uuid");
const services = require("../Services/DriverRequest");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");
const { uploadToFTP } = require("../Utils/FTPHandler");
const { compressBuffer } = require("../Utils/compressImage");



// Compress and upload a single proof-of-loading photo, returning its stored path.
const saveLoadingPhoto = async (file) => {
  if (!file?.buffer) {
    return null;
  }
  const compressed = await compressBuffer(file.buffer);
  const uniqueFilename = `loading_${uuidv4()}.jpg`;
  return uploadToFTP(compressed, uniqueFilename);
};

// Collect uploaded proof-of-loading files from multer and return stored paths.
const saveLoadingPhotos = async (req) => {
  const allFiles = [];
  if (req.file) {
    allFiles.push(req.file);
  }
  for (const group of Object.values(req.files || {})) {
    for (const file of group || []) {
      allFiles.push(file);
    }
  }
  const photoUrls = [];
  for (const file of allFiles) {
    const url = await saveLoadingPhoto(file);
    if (url) {
      photoUrls.push(url);
    }
  }
  return photoUrls;
};

const createRequest = async (req, res, next) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;
    if (!userUniqueId) {
      throw new AppError("User not authenticated", AppError.UNAUTHORIZED);
    }
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await services.createRequest({ body: req.body });
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};
const takeFromStreet = async (req, res, next) => {
  try {
    const user = req.user;
    const shipperRequestCreatedBy = user?.userUniqueId;
    const shipperRequestCreatedByRoleId = user?.roleId;
    req.body.shipperRequestCreatedBy = shipperRequestCreatedBy;
    req.body.shipperRequestCreatedByRoleId = shipperRequestCreatedByRoleId;

    const result = await executeInTransaction(async () => {
      return await services.takeFromStreet({ ...req.body }, req.user);
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};
const createAndAcceptNewRequest = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await services.createAndAcceptNewRequest(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};
// Get a specific driver request by ID

const acceptShipperRequest = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = journeyStatusMap.acceptedByDriver;
    // NOTE: No outer executeInTransaction here — acceptShipperRequest calls
    // updateJourneyStatus internally which opens its own transaction when
    // updating multiple tables. Wrapping again would create a nested
    // transaction (second connection) that deadlocks against the inner one.
    const result = await services.acceptShipperRequest(req.body);
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const deleteRequestController = async (req, res, next) => {
  try {
    const { driverRequestUniqueId } = req.params;
    const { userUniqueId } = req?.user || {};

    if (!driverRequestUniqueId) {
      throw new AppError("Driver request unique ID is required", AppError.BAD_REQUEST);
    }

    if (!userUniqueId) {
      throw new AppError("User not authenticated", AppError.UNAUTHORIZED);
    }

    const result = await executeInTransaction(async () => {
      return await services.deleteDriverRequest({
        driverRequestUniqueId,
        deletedBy: userUniqueId,
      });
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const verifyDriverJourneyStatusController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const result = await services.verifyDriverJourneyStatus({
      userUniqueId,
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const getDriverRequestController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
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

    let filters = {};
    if (journeyStatusIds) {
      const journeyStatusIdsArray = journeyStatusIds.split(",");
      if (journeyStatusIdsArray.length === 1) {
        filters.journeyStatusId = journeyStatusIdsArray[0];
      } else {
        filters.journeyStatusIds = journeyStatusIdsArray;
      }
    }

    if (startDate) {
      filters.startDate = startDate;
    }
    if (endDate) {
      filters.endDate = endDate;
    }
    if (originPlace) {
      filters.originPlace = originPlace;
    }
    if (username) {
      filters.username = username;
    }
    if (email) {
      filters.email = email;
    }
    if (phoneNumber) {
      filters.phoneNumber = phoneNumber;
    }
    if (sortBy) {
      filters.sortBy = sortBy;
    }
    if (sortOrder) {
      filters.sortOrder = sortOrder;
    }

    const data = {
      userUniqueId:
        driverUserUniqueId === "self" ? userUniqueId : driverUserUniqueId,
      target,
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
    };

    const result = await services.getDriverRequest({ data });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const startJourney = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.journeyStatusId = journeyStatusMap.journeyStarted;
    req.body.previousStatusId = journeyStatusMap.acceptedByShipper;
    req.body.userUniqueId = userUniqueId;
    // Service calls updateJourneyStatus internally (self-transacting)
    const result = await services.startJourney(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const goToLoadingPlace = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    // Service validates previous status (acceptedByShipper) internally
    const result = await services.goToLoadingPlace(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const startLoading = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    // Convert multer-uploaded files to server paths
    const uploadedPaths = await saveLoadingPhotos(req);
    if (uploadedPaths.length > 0) {
      req.body.proofOfLoading = uploadedPaths;
    }
    // Service validates previous status (goToLoadingPlace) internally
    const result = await services.startLoading(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const loadCompleted = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    // Convert multer-uploaded files to server paths
    const uploadedPaths = await saveLoadingPhotos(req);
    if (uploadedPaths.length > 0) {
      req.body.proofOfLoading = uploadedPaths;
    }
    // Service validates previous status (loading) internally
    const result = await services.loadCompleted(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const noAnswerFromDriver = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    req.body.journeyStatusId = journeyStatusMap.noAnswerFromDriver;
    req.body.previousStatusId = journeyStatusMap.requested;
    // Service has its own executeInTransaction internally
    const result = await services.noAnswerFromDriver(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const completeJourney = async (req, res, next) => {
  try {
    const { userUniqueId, roleId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    req.body.roleId = roleId;
    req.body.journeyStatusId = journeyStatusMap.journeyCompleted;
    req.body.previousStatusId = journeyStatusMap.journeyStarted;
    // Service calls updateJourneyStatus internally (self-transacting)
    const result = await services.completeJourney(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const cancelDriverRequest = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.query.userUniqueId;
    const roleId = req.query.roleId || user?.roleId;
    if (ownerUserUniqueId === "self" || !ownerUserUniqueId) {
      ownerUserUniqueId = userUniqueId;
    }
    // Prefer body.cancellationReasonsTypeId (query may be "undefined" string)
    const rawReasonId =
      req.body?.cancellationReasonsTypeId ??
      req.query?.cancellationReasonsTypeId;
    const cancellationReasonsTypeId =
      rawReasonId !== null && rawReasonId !== "undefined"
        ? Number(rawReasonId)
        : undefined;

    const data = {
      ...req.query,
      ownerUserUniqueId,
      user,
      roleId,
      ...(cancellationReasonsTypeId !== undefined &&
      !Number.isNaN(cancellationReasonsTypeId)
        ? { cancellationReasonsTypeId }
        : {}),
    };
    const result = await executeInTransaction(async () => {
      return await services.cancelDriverRequest(data);
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const sendUpdatedLocationController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await services.sendUpdatedLocation(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getCancellationNotificationsController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const { seenStatus } = req.query;

    if (!userUniqueId) {
      throw new AppError("Missing user information", AppError.BAD_REQUEST);
    }

    const result = await services.getCancellationNotifications({
      userUniqueId,
      seenStatus,
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

/**
 * Unified controller to mark any negative status as seen by driver
 * Handles: notSelectedInBid, rejectedByShipper, cancelledByShipper, cancelledByAdmin, cancelledBySystem
 */
const markNegativeStatusAsSeenController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const { driverRequestUniqueId } = req.body;

    if (!userUniqueId || !driverRequestUniqueId) {
      throw new AppError("Missing required fields", AppError.BAD_REQUEST);
    }

    const result = await executeInTransaction(async () => {
      return await services.markNegativeStatusAsSeenByDriver({
        driverRequestUniqueId,
        userUniqueId,
      });
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const updateDriverRequestController = async (req, res, next) => {
  try {
    const { driverRequestUniqueId } = req.params;
    const updateValues = req.body || {};

    if (!driverRequestUniqueId) {
      throw new AppError("driverRequestUniqueId is required", AppError.BAD_REQUEST);
    }
    if (Object.keys(updateValues).length === 0) {
      throw new AppError("No update fields provided", AppError.BAD_REQUEST);
    }

    const result = await executeInTransaction(async () => {
      return await services.updateDriverRequest({
        conditions: { driverRequestUniqueId },
        updateValues,
      });
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendUpdatedLocationController,
  createAndAcceptNewRequest,
  cancelDriverRequest,
  completeJourney,
  noAnswerFromDriver,
  startJourney,
  goToLoadingPlace,
  startLoading,
  loadCompleted,
  createRequest,
  acceptShipperRequest,
  deleteRequestController,
  takeFromStreet,
  verifyDriverJourneyStatusController,
  getDriverRequestController,
  getCancellationNotificationsController,
  markNegativeStatusAsSeenController,
  updateDriverRequestController,
};
