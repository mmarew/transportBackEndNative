const { getData } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const canceledJourneyService = require("../Services/CanceledJourneys.service");
const { cancelPassengerRequest } = require("../Services/Passenger.service");
const serverResponder = require("../Utils/ServerResponder");
exports.canceledJourneyBySystem = async (req, res) => {
  try {
    // get all active journey of passenger request which are in journey status of 1 and requestTime is geater than 5 munites
    // Define the SQL query to select active passenger requests older than 5 minutes
    const user = { userUniqueId: "676-9090hkj-898989-3434", roleId: 5 };
    const sqlQuery = `
      SELECT * 
      FROM PassengerRequest 
      WHERE journeyStatusId = 1 
      AND requestTime < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `;

    // Execute the query
    const [activeRequests] = await pool.query(sqlQuery);
    console.log("activeRequests", activeRequests);
    if (activeRequests.length == 0) {
      return serverResponder(res, {
        message: "error",
        error: "No active requests found",
      });
    }
    req.body.user = user;
    activeRequests.map(async (request) => {
      const ownerUserUniqueId = activeRequests[0]?.userUniqueId;
      req.body.ownerUserUniqueId = ownerUserUniqueId;
      req.body.cancellationReasonsTypeId = 1;
      const result = await cancelPassengerRequest(req.body);
    });
    serverResponder(res, result);
  } catch (error) {
    console.error("Error creating canceled journey:", error);
    serverResponder(res, {
      message: "error",
      error: "Failed to create canceled",
    });
  }
};
// Create a new canceled journey
exports.createCanceledJourney = async (req, res) => {
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
    console.error("Error creating canceled journey:", error);
    serverResponder(res, {
      message: "error",
      error: "Failed to create canceled",
    });
  }
};
exports.getCanceledJourneysByUserUniqueId = async (req, res) => {
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
    console.error("Error fetching canceled journeys by user unique ID:", error);
    serverResponder;
  }
};
// Get canceled journeys filtered by type, date range, and limit
exports.getCanceledJourneysFiltered = async (req, res) => {
  try {
    const { canceledByRoleId, startDate, endDate } = req.body;

    const result = await canceledJourneyService.getCanceledJourneysFiltered({
      canceledByRoleId,
      startDate,
      endDate,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching filtered canceled journeys:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch canceled journeys", error });
  }
};

// Get a specific canceled journey by ID
exports.getCanceledJourneyById = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const result = await canceledJourneyService.getCanceledJourneyById(
      canceledJourneyUniqueId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching canceled journey by ID:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch canceled journey by ID", error });
  }
};

// Update a specific canceled journey by ID
exports.updateCanceledJourney = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const data = req.body;
    const result = await canceledJourneyService.updateCanceledJourney(
      canceledJourneyUniqueId,
      data
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating canceled journey:", error);
    res
      .status(500)
      .json({ message: "Failed to update canceled journey", error });
  }
};

// Delete a specific canceled journey by ID
exports.deleteCanceledJourney = async (req, res) => {
  try {
    const { canceledJourneyUniqueId } = req.params;
    const result = await canceledJourneyService.deleteCanceledJourney(
      canceledJourneyUniqueId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting canceled journey:", error);
    res
      .status(500)
      .json({ message: "Failed to delete canceled journey", error });
  }
};
