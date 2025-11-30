// const canceledJourneyService = require("../Services/CanceledJourneys.service");
// const {
//   cancelPassengerRequest,
// } = require("../Services/PassengerRequest.service");
// const {
//   sendSocketIONotificationToPassenger,
// } = require("../Utils/Notifications");
// const ServerResponder = require("../Utils/ServerResponder");
// const messageTypes = require("../Utils/MessageTypes");
// const { pool } = require("../Middleware/Database.config");

// // Helper function to handle service responses
// const handleServiceResponse = async (serviceCall, res) => {
//   try {
//     const result = await serviceCall;
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: error.message || "Operation failed",
//     });
//   }
// };

// // Create a new canceled journey by the system
// const cancelJourneyBySystem = async (req, res) => {
//   try {
//     const now = new Date();
//     const cutoffTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

//     const sqlQuery = `
//       SELECT PassengerRequest.*, Users.phoneNumber
//       FROM PassengerRequest
//       JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId
//       WHERE PassengerRequest.journeyStatusId = 1
//         AND PassengerRequest.requestTime <= ?
//     `;

//     const [activeRequests] = await pool.query(sqlQuery, [cutoffTime]);

//     for (const request of activeRequests) {
//       const result = await cancelPassengerRequest({
//         ownerUserUniqueId: request.userUniqueId,
//         cancellationReasonsTypeId: 1,
//       });

//       await sendSocketIONotificationToPassenger({
//         phoneNumber: request.phoneNumber,
//         message: {
//           message: "success",
//           status: null,
//           driver: null,
//           passenger: null,
//           messageTypes: messageTypes.request_other_driver,
//         },
//       });
//     }

//     ServerResponder(res, {
//       message: "success",
//       data: "System cancellation process completed",
//     });
//   } catch (error) {
//     console.error("Error in cancelJourneyBySystem:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to process system cancellations",
//     });
//   }
// };

// // Create a new canceled journey
// const createCanceledJourney = async (req, res) => {
//   const user = req.user;
//   const data = {
//     ...req.body,
//     userUniqueId: user.userUniqueId,
//     roleId: user.roleId,
//   };

//   await handleServiceResponse(
//     canceledJourneyService.createCanceledJourney(data),
//     res
//   );
// };

// // Get canceled journeys by user unique ID and role ID
// const getSingleCanceledJourneysByUserUniqueIdAndRoleId = async (req, res) => {
//   const { userUniqueId, roleId } = req.query;
//   const { page = 1, limit = 10 } = req.query;

//   if (!userUniqueId || !roleId) {
//     return ServerResponder(res, {
//       message: "error",
//       error: "Invalid user parameters",
//     });
//   }

//   await handleServiceResponse(
//     canceledJourneyService.getSingleCanceledJourneysByUserUniqueIdAndRoleId(
//       userUniqueId,
//       roleId,
//       parseInt(page),
//       parseInt(limit)
//     ),
//     res
//   );
// };

// // Get a specific canceled journey by ID
// const getCanceledJourneyById = async (req, res) => {
//   const { canceledJourneyUniqueId } = req.params;

//   await handleServiceResponse(
//     canceledJourneyService.getCanceledJourneyById(canceledJourneyUniqueId),
//     res
//   );
// };

// // Update seen by admin status
// const updateSeenByAdmin = async (req, res) => {
//   const { canceledJourneyUniqueId } = req.params;

//   await handleServiceResponse(
//     canceledJourneyService.updateSeenByAdmin(canceledJourneyUniqueId),
//     res
//   );
// };

// // Update a canceled journey
// const updateCanceledJourney = async (req, res) => {
//   const { canceledJourneyUniqueId } = req.params;
//   const data = req.body;

//   await handleServiceResponse(
//     canceledJourneyService.updateCanceledJourney(canceledJourneyUniqueId, data),
//     res
//   );
// };

// // Delete a canceled journey
// const deleteCanceledJourney = async (req, res) => {
//   const { canceledJourneyUniqueId } = req.params;

//   await handleServiceResponse(
//     canceledJourneyService.deleteCanceledJourney(canceledJourneyUniqueId),
//     res
//   );
// };

// // Get unseen canceled journeys

// // Get filtered canceled journeys with pagination
// const getAllCancelledJourneyByRole = async (req, res) => {
//   const {
//     canceledByRoleId,
//     startDate,
//     endDate,
//     page = 1,
//     limit = 10,
//     sortBy = "canceledJourneyId",
//     sortOrder = "DESC",
//   } = req.query;

//   await handleServiceResponse(
//     canceledJourneyService.getAllCancelledJourneyByRole({
//       canceledByRoleId,
//       startDate,
//       endDate,
//       page: parseInt(page),
//       limit: parseInt(limit),
//       sortBy,
//       sortOrder,
//     }),
//     res
//   );
// };

// // Search canceled journey by user data with pagination
// const searchCanceledJourneyByUserData = async (req, res) => {
//   const { phoneOrEmail, roleId } = req.query;
//   const { page = 1, limit = 10 } = req.query;

//   await handleServiceResponse(
//     canceledJourneyService.searchCanceledJourneyByUserData(
//       phoneOrEmail,
//       roleId,
//       parseInt(page),
//       parseInt(limit)
//     ),
//     res
//   );
// };

// // Get unseen canceled journeys with pagination
// const getUnseenCanceledJourney = async (req, res) => {
//   const { page = 1, limit = 10 } = req.query;

//   await handleServiceResponse(
//     canceledJourneyService.getUnseenCanceledJourney(
//       parseInt(page),
//       parseInt(limit)
//     ),
//     res
//   );
// };
// const getCanceledJourneyByFilter = async (req, res) => {
//   const { page = 1, limit = 10 } = req.query;
//   const user = req.user;
//   const data = { ...req?.query };
//   let userUniqueId = req?.query?.userUniqueId;
//   // if driverUserUniqueId is self, then set it to userUniqueId of the logged in user
//   if (userUniqueId == "self") userUniqueId = user?.userUniqueId;
//   // add driverUserUniqueId, page and limit to data object
//   data.page = parseInt(page);
//   data.limit = parseInt(limit);
//   data.userUniqueId = userUniqueId;
//   const resultOfGetCanceledJourneyByFilter =
//     await canceledJourneyService.getCanceledJourneyByFilter({ data });

//   await handleServiceResponse(resultOfGetCanceledJourneyByFilter, res);
// };

// module.exports = {
//   getCanceledJourneyByFilter,
//   getUnseenCanceledJourney,
//   updateSeenByAdmin,
//   cancelJourneyBySystem,
//   deleteCanceledJourney,
//   updateCanceledJourney,
//   getCanceledJourneyById,
//   getSingleCanceledJourneysByUserUniqueIdAndRoleId,
//   getAllCancelledJourneyByRole,
//   createCanceledJourney,
//   searchCanceledJourneyByUserData,
// };
const canceledJourneyService = require("../Services/CanceledJourneys.service");
const {
  cancelPassengerRequest,
} = require("../Services/PassengerRequest.service");
const {
  sendSocketIONotificationToPassenger,
} = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const messageTypes = require("../Utils/MessageTypes");
const { pool } = require("../Middleware/Database.config");

// Helper function to handle service responses
const handleServiceResponse = async (serviceCall, res) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    console.error("Controller Error:", error);
    ServerResponder(res, {
      success: false,
      message: "Operation failed",
      error: error.message,
    });
  }
};

// System cancellation process
const cancelJourneyBySystem = async (req, res) => {
  try {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 5 * 60 * 1000);

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

      await sendSocketIONotificationToPassenger({
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
      success: true,
      message: "System cancellation process completed",
      data: { processed: activeRequests.length },
    });
  } catch (error) {
    console.error("Error in cancelJourneyBySystem:", error);
    ServerResponder(res, {
      success: false,
      message: "Failed to process system cancellations",
      error: error.message,
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

// UNIFIED GET ENDPOINT - Handles all filtering scenarios
const getCanceledJourneyByFilter = async (req, res) => {
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

  await handleServiceResponse(
    canceledJourneyService.getCanceledJourneyByFilter(filters),
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
const getCanceledJourneyCountsByDate = async (req, res) => {
  try {
    const fromDate = req?.query?.fromDate;
    const toDate = req?.query?.toDate;
    console.log("@getCanceledJourneyCountsByDate", req?.user);

    const userRoleId = req?.user?.roleId;

    // Validate required parameters
    if (!fromDate || !toDate) {
      return ServerResponder(res, {
        success: false,
        message: "error",
        error: "fromDate and toDate are required",
      });
    }

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId || "all";

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin = userRoleId === 3 || userRoleId === 6;
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

    await handleServiceResponse(
      canceledJourneyService.getCanceledJourneyCountsByDate(filters),
      res
    );
  } catch (error) {
    console.error("Error getting canceled journey counts:", error);
    ServerResponder(res, {
      success: false,
      message: "error",
      error: "Failed to get canceled journey counts",
    });
  }
};

module.exports = {
  getCanceledJourneyCountsByDate,
  getCanceledJourneyByFilter,
  updateSeenByAdmin,
  cancelJourneyBySystem,
  deleteCanceledJourney,
  updateCanceledJourney,
  createCanceledJourney,
};
