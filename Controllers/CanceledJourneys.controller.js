const canceledJourneyService = require("../Services/CanceledJourneys.service");
const {
  cancelPassengerRequest,
} = require("../Services/PassengerRequest.service");
const { sendNotificationToPassenger } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const messageTypes = require("../Utils/MessageTypes");
const { pool } = require("../Middleware/Database.config");

// Helper function to handle service responses
const handleServiceResponse = async (serviceCall, res) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: error.message || "Operation failed",
    });
  }
};

// Create a new canceled journey by the system
const cancelJourneyBySystem = async (req, res) => {
  try {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

    const sqlQuery = `
      SELECT PassengerRequest.*, Users.phoneNumber
      FROM PassengerRequest
      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId
      WHERE PassengerRequest.journeyStatusId = 1
        AND PassengerRequest.requestTime <= ?
    `;

    const [activeRequests] = await pool.query(sqlQuery, [cutoffTime]);

    for (const request of activeRequests) {
      const result = await cancelPassengerRequest({
        ownerUserUniqueId: request.userUniqueId,
        cancellationReasonsTypeId: 1,
      });

      await sendNotificationToPassenger({
        phoneNumber: request.phoneNumber,
        message: {
          message: "success",
          status: null,
          driver: null,
          passenger: null,
          messageTypes: messageTypes.request_other_driver,
        },
      });
    }

    ServerResponder(res, {
      message: "success",
      data: "System cancellation process completed",
    });
  } catch (error) {
    console.error("Error in cancelJourneyBySystem:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to process system cancellations",
    });
  }
};

// Create a new canceled journey
const createCanceledJourney = async (req, res) => {
  const user = req.user;
  const data = {
    ...req.body,
    userUniqueId: user.userUniqueId,
    roleId: user.roleId,
  };

  await handleServiceResponse(
    canceledJourneyService.createCanceledJourney(data),
    res
  );
};

// Get canceled journeys by user unique ID and role ID
const getSingleCanceledJourneysByUserUniqueIdAndRoleId = async (req, res) => {
  const { userUniqueId, roleId } = req.query;

  if (!userUniqueId || !roleId) {
    return ServerResponder(res, {
      message: "error",
      error: "Invalid user parameters",
    });
  }

  await handleServiceResponse(
    canceledJourneyService.getSingleCanceledJourneysByUserUniqueIdAndRoleId(
      userUniqueId,
      roleId
    ),
    res
  );
};

// Get a specific canceled journey by ID
const getCanceledJourneyById = async (req, res) => {
  const { canceledJourneyUniqueId } = req.params;

  await handleServiceResponse(
    canceledJourneyService.getCanceledJourneyById(canceledJourneyUniqueId),
    res
  );
};

// Update seen by admin status
const updateSeenByAdmin = async (req, res) => {
  const { canceledJourneyUniqueId } = req.params;

  await handleServiceResponse(
    canceledJourneyService.updateSeenByAdmin(canceledJourneyUniqueId),
    res
  );
};

// Update a canceled journey
const updateCanceledJourney = async (req, res) => {
  const { canceledJourneyUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    canceledJourneyService.updateCanceledJourney(canceledJourneyUniqueId, data),
    res
  );
};

// Delete a canceled journey
const deleteCanceledJourney = async (req, res) => {
  const { canceledJourneyUniqueId } = req.params;

  await handleServiceResponse(
    canceledJourneyService.deleteCanceledJourney(canceledJourneyUniqueId),
    res
  );
};

// Get unseen canceled journeys

// Get filtered canceled journeys with pagination
const getAllCancelledJourneyByRole = async (req, res) => {
  const {
    canceledByRoleId,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    sortBy = "canceledJourneyId",
    sortOrder = "DESC",
  } = req.query;

  await handleServiceResponse(
    canceledJourneyService.getAllCancelledJourneyByRole({
      canceledByRoleId,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    }),
    res
  );
};

// Search canceled journey by user data with pagination
const searchCanceledJourneyByUserData = async (req, res) => {
  const { phoneOrEmail, roleId } = req.query;
  const { page = 1, limit = 10 } = req.query;

  await handleServiceResponse(
    canceledJourneyService.searchCanceledJourneyByUserData(
      phoneOrEmail,
      roleId,
      parseInt(page),
      parseInt(limit)
    ),
    res
  );
};

// Get unseen canceled journeys with pagination
const getUnseenCanceledJourney = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  await handleServiceResponse(
    canceledJourneyService.getUnseenCanceledJourney(
      parseInt(page),
      parseInt(limit)
    ),
    res
  );
};
const getCanceledJourneyByFilter = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const user = req.user;
  const data = { ...req?.query };
  let driverUserUniqueId = req?.query?.userUniqueId;
  // if driverUserUniqueId is self, then set it to userUniqueId of the logged in user
  if (driverUserUniqueId == "self") driverUserUniqueId = user?.userUniqueId;
  // add driverUserUniqueId, page and limit to data object
  data.page = parseInt(page);
  data.limit = parseInt(limit);
  data.driverUserUniqueId = driverUserUniqueId;
  const resultOfGetCanceledJourneyByFilter =
    await canceledJourneyService.getCanceledJourneyByFilter({ data });

  await handleServiceResponse(resultOfGetCanceledJourneyByFilter, res);
};

module.exports = {
  getCanceledJourneyByFilter,
  getUnseenCanceledJourney,
  updateSeenByAdmin,
  cancelJourneyBySystem,
  deleteCanceledJourney,
  updateCanceledJourney,
  getCanceledJourneyById,
  getSingleCanceledJourneysByUserUniqueIdAndRoleId,
  getAllCancelledJourneyByRole,
  createCanceledJourney,
  searchCanceledJourneyByUserData,
};
