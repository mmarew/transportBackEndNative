const journeyRoutePointsService = require("../Services/JourneyRoutePoints.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new journey route point
exports.createJourneyRoutePoint = async (req, res) => {
  try {
    const { journeyDecisionUniqueId, latitude, longitude } = req.body;

    const result = await journeyRoutePointsService.createJourneyRoutePoint(
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating journey route point:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error creating journey route point",
    });
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (req, res) => {
  try {
    const { journeyDecisionUniqueId } = req.query;
    const result = await journeyRoutePointsService.getJourneyRoutePoints(
      journeyDecisionUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey route points:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching journey route points",
    });
  }
};

// Update a specific route point by pointId
exports.updateJourneyRoutePoint = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { latitude, longitude } = req.body;
    const result = await journeyRoutePointsService.updateJourneyRoutePoint(
      pointId,
      latitude,
      longitude
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating journey route point:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error updating journey route point",
    });
  }
};

// Delete a specific route point by pointId
exports.deleteJourneyRoutePoint = async (req, res) => {
  try {
    const { pointId } = req.params;
    const result = await journeyRoutePointsService.deleteJourneyRoutePoint(
      pointId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting journey route point:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error deleting journey route point",
    });
  }
};
