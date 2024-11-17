const journeyService = require("../Services/Journey.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new journey
exports.createJourney = async (req, res) => {
  try {
    const {
      journeyDecisionUniqueId,
      startTime,
      endTime,
      fare,
      journeyStatusId,
    } = req.body;
    const result = await journeyService.createJourney(
      journeyDecisionUniqueId,
      startTime,
      endTime,
      fare,
      journeyStatusId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create journey",
    });
  }
};

// Get all journeys
exports.getAllJourneys = async (req, res) => {
  try {
    const result = await journeyService.getAllJourneys();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journeys:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journeys",
    });
  }
};

// Get a specific journey by ID
exports.getJourneyById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyService.getJourneyById(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey",
    });
  }
};

// Update a specific journey by ID
exports.updateJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const { endTime, fare, journeyStatusId } = req.body;
    const result = await journeyService.updateJourney(
      id,
      endTime,
      fare,
      journeyStatusId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update journey",
    });
  }
};

// Delete a specific journey by ID
exports.deleteJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyService.deleteJourney(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete journey",
    });
  }
};
// Get all completed journeys
exports.getCompletedJourney = async (req, res) => {
  try {
    const result = await journeyService.getCompletedJourney(req);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete journey",
    });
  }
};
