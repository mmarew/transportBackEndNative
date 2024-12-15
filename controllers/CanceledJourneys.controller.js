const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const canceledJourneyService = require("../Services/CanceledJourneys.service");
const {
  cancelPassengerRequest,
} = require("../Services/PassengerRequest.service");
const { sendNotificationToPassenger } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const serverResponder = require("../Utils/ServerResponder");
// Function to create a canceled journey by the system
const canceledJourneyBySystem = async (
  req = { body: { user: null } },
  res = null
) => {
  try {
    // Get the system user from Users table where roleId is 5
    const [user] = await performJoinSelect({
      baseTable: "Users",
      joins: [
        {
          table: "UserRole",
          on: "Users.userUniqueId = UserRole.userUniqueId",
        },
      ],
      conditions: {
        "UserRole.roleId": 5, // role id of system
      },
    });
    if (!user) {
      throw new Error("System user with role id 5 not found");
    }

    // SQL query to get active passenger requests with journeyStatusId 1 and requestTime older than 5 minutes
    const sqlQuery = `SELECT PassengerRequest.*, Users.phoneNumber FROM PassengerRequest   JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId WHERE PassengerRequest.journeyStatusId = 1   AND PassengerRequest.requestTime < DATE_SUB(NOW(), INTERVAL 5 MINUTE) `;

    // Execute the query
    const [activeRequests] = await pool.query(sqlQuery);
    if (!activeRequests || activeRequests.length === 0) {
      if (res) {
        return serverResponder(res, {
          message: "error",
          error: "No active requests found",
        });
      }
      return;
    }

    req.body.user = user;

    for (const request of activeRequests) {
      const ownerUserUniqueId = request.userUniqueId;
      req.body.ownerUserUniqueId = ownerUserUniqueId;
      req.body.cancellationReasonsTypeId = 1;

      // Call cancelPassengerRequest to cancel the journey
      const result = await cancelPassengerRequest(req.body);

      // Notify the passenger
      await sendNotificationToPassenger({
        phoneNumber: request.phoneNumber,
        message:
          "Dear customer, we apologize to inform you. Your request has been canceled by the system because no vehicle is available nearby. Please try again later.",
      });

      // If there's a response object, send success message after each cancellation
      if (res) {
        serverResponder(res, {
          message: "success",
          data: result,
        });
      }
    }
  } catch (error) {
    console.log("Error creating canceled journey:", error);
    if (res) {
      serverResponder(res, {
        message: "error",
        error: "Failed to create canceled journey",
      });
    }
  }
};

// Schedule the canceledJourneyBySystem to run every 5 minutes (300000 ms)
setInterval(() => {
  canceledJourneyBySystem();
}, 30000); // 300,000 ms = 5 minutes

// Create a new canceled journey
const createCanceledJourney = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    const roleId = user?.roleId;
    req.body.userUniqueId = userUniqueId;
    req.body.roleId = roleId;
    const data = req.body;

    const result = await canceledJourneyService?.createCanceledJourney(data);
    serverResponder(res, result);
  } catch (error) {
    console.log("Error creating canceled journey:", error);
    serverResponder(res, {
      message: "error",
      error: "Failed to create canceled",
    });
  }
};
const getCanceledJourneysByUserUniqueId = async (req, res) => {
  try {
    const { userUniqueId, roleId } = req.params;
    if (!userUniqueId || !roleId) {
      serverResponder(res, { message: "error", error: "Invalid user" });
    }
    const result =
      await canceledJourneyService.getCanceledJourneysByUserUniqueId(
        userUniqueId,
        roleId
      );
    serverResponder(res, result);
  } catch (error) {
    console.log("Error fetching canceled journeys by user unique ID:", error);
    serverResponder;
  }
};
// Get canceled journeys filtered by type, date range, and limit
const getCanceledJourneysFiltered = async (req, res) => {
  try {
    const { canceledByRoleId, startDate, endDate } = req.body;

    const result = await canceledJourneyService.getCanceledJourneysFiltered({
      canceledByRoleId,
      startDate,
      endDate,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching filtered canceled journeys:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch canceled journeys",
    });
  }
};
// Get canceled journeys filtered by type, date range, and limit
const getCanceledJourneysByDriver = async (req, res) => {
  try {
    // const { canceledByRoleId, startDate, endDate } = req.body;
    // all canceled journeys
    // single driver
    //self knowing

    let ownerUniqueId = req?.params?.ownerUniqueId;
    console.log("ownerUniqueId", ownerUniqueId);
    if (ownerUniqueId == "self") ownerUniqueId = req.user.userUniqueId;
    const result = await canceledJourneyService.getCanceledJourneysByDriver(
      ownerUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching  canceled journeys by driver:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch canceled journeys",
    });
  }
};

// Get a specific canceled journey by ID
const getCanceledJourneyById = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const result = await canceledJourneyService.getCanceledJourneyById(
      canceledJourneyUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching canceled journey by ID:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch canceled journey",
    });
  }
};

// Update a specific canceled journey by ID
const updateCanceledJourney = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const data = req.body;
    const result = await canceledJourneyService.updateCanceledJourney(
      canceledJourneyUniqueId,
      data
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating canceled journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update canceled journey",
    });
  }
};

// Delete a specific canceled journey by ID
const deleteCanceledJourney = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const result = await canceledJourneyService.deleteCanceledJourney(
      canceledJourneyUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting canceled journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete canceled journey",
    });
  }
};

module.exports = {
  canceledJourneyBySystem,
  deleteCanceledJourney,
  updateCanceledJourney,
  getCanceledJourneyById,
  getCanceledJourneysByUserUniqueId,
  getCanceledJourneysFiltered,
  createCanceledJourney,
  getCanceledJourneysByDriver,
};
