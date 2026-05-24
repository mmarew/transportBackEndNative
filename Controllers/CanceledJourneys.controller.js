const canceledJourneyService = require("../Services/CanceledJourneys");
const { cancelShipperRequest } = require("../Services/ShipperRequest");
const { sendSocketIONotificationToShipper } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const messageTypes = require("../Utils/MessageTypes");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const AppError = require("../Utils/AppError");
const { usersRolesList } = require("../Utils/ListOfSeedData");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

// System cancellation process
const cancelJourneyBySystem = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async (connection) => {
      const now = currentDate();
      const cutoffTime = new Date(now.getTime() - 5 * 60 * 1000);

      const sqlQuery = `
        SELECT ShipperRequest.*, Users.phoneNumber
        FROM ShipperRequest
        JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId
        WHERE ShipperRequest.journeyStatusId = ${journeyStatusMap.waiting}
          AND ShipperRequest.shipperRequestCreatedAt <= ?
      `;

      const [activeRequests] = await connection.query(sqlQuery, [cutoffTime]);

      for (const request of activeRequests) {
        await cancelShipperRequest({
          ownerUserUniqueId: request.userUniqueId,
          cancellationReasonsTypeId: 1,
        });

        await sendSocketIONotificationToShipper({
          phoneNumber: request.phoneNumber,
          message: {
            message: "success",
            status: null,
            driver: null,
            shipper: null,
            messageTypes: messageTypes.request_other_driver,
          },
        });
      }

      return {
        success: true,
        message: "System cancellation process completed",
        data: { processed: activeRequests.length },
      };
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Create a new canceled journey
const createCanceledJourney = async (req, res, next) => {
  try {
    const user = req.user;
    const data = {
      ...req.body,
      userUniqueId: user.userUniqueId,
      roleId: user.roleId,
    };

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.createCanceledJourney(data);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// UNIFIED GET ENDPOINT - Handles all filtering scenarios
const getCanceledJourneyByFilter = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const user = req.user;

    // Build filter data from query parameters
    const filters = {
      ...req.query,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // Handle "self" user reference
    if (filters.userUniqueId === "self") {
      filters.userUniqueId = user.userUniqueId;
    }

    const result =
      await canceledJourneyService.getCanceledJourneyByFilter(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update seen by admin status
const updateSeenByAdmin = async (req, res, next) => {
  try {
    const { canceledJourneyUniqueId } = req.params;

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.updateSeenByAdmin(
        canceledJourneyUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a canceled journey
const updateCanceledJourney = async (req, res, next) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const data = req.body;

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.updateCanceledJourney(
        canceledJourneyUniqueId,
        data,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a canceled journey
const deleteCanceledJourney = async (req, res, next) => {
  try {
    const { canceledJourneyUniqueId } = req.params;

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.deleteCanceledJourney(
        canceledJourneyUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getCanceledJourneyCountsByDate = async (req, res, next) => {
  try {
    const fromDate = req?.query?.fromDate;
    const toDate = req?.query?.toDate;

    const userRoleId = req?.user?.roleId;

    // Validate required parameters
    if (!fromDate || !toDate) {
      return next(new AppError("fromDate and toDate are required", 400));
    }

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId || "all";

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin =
        userRoleId === usersRolesList.admin.roleId ||
        userRoleId === usersRolesList.supperAdmin.roleId;
      if (!isAdmin) {
        // Non-admin users can only see their own data
        ownerUserUniqueId = req?.user?.userUniqueId;
      }
    }

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    // Build filters object matching your reference structure
    const filters = {
      ownerUserUniqueId,
      toDate,
      fromDate,
      userFilters: {
        fullName: req?.query?.fullName,
        phone: req?.query?.phone,
        email: req?.query?.email,
        search: req?.query?.search,
      },
    };

    const result =
      await canceledJourneyService.getCanceledJourneyCountsByDate(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getCanceledJourneyCountsByReason = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      roleId,
      contextType,
      groupBy,
      includeEmptyReasons,
    } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return next(new AppError("startDate and endDate are required", 400));
    }

    const filters = {
      startDate,
      endDate,
      roleId: roleId ? parseInt(roleId) : null,
      contextType,
      groupBy: groupBy || "reason",
      includeEmptyReasons: includeEmptyReasons === "true",
    };

    const result =
      await canceledJourneyService.getCanceledJourneyCountsByReason(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const unbanUser = async (req, res, next) => {
  try {
    const user = req?.user;

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.unbanUser(req.query, user);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deactivateBan = async (req, res, next) => {
  try {
    const { banUniqueId } = req.params;

    const result = await executeInTransaction(async () => {
      return await canceledJourneyService.deactivateBan(banUniqueId);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCanceledJourneyCountsByReason,
  getCanceledJourneyCountsByDate,
  getCanceledJourneyByFilter,
  updateSeenByAdmin,
  cancelJourneyBySystem,
  deleteCanceledJourney,
  updateCanceledJourney,
  createCanceledJourney,
  unbanUser,
  deactivateBan,
};
