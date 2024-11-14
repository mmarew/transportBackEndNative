const journeyRoutePointsService = require("../Services/JourneyRoutePoints.service");

// Create a new journey route point
exports.createJourneyRoutePoint = async (req, res) => {
  try {
    const { journeyUniqueId, latitude, longitude } = req.body;

    const result = await journeyRoutePointsService.createJourneyRoutePoint({
      journeyUniqueId,
      latitude,
      longitude,
    });
    res.status(201).json(result);
  } catch (error) {
    console.log("Error creating journey route point:", error);
    res
      .status(500)
      .json({ message: "Error creating journey route point", error });
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (req, res) => {
  try {
    const { journeyUniqueId } = req.params;
    const result = await journeyRoutePointsService.getJourneyRoutePoints(
      journeyUniqueId
    );
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching journey route points:", error);
    res
      .status(500)
      .json({ message: "Error fetching journey route points", error });
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
    res.status(200).json(result);
  } catch (error) {
    console.log("Error updating journey route point:", error);
    res
      .status(500)
      .json({ message: "Error updating journey route point", error });
  }
};

// Delete a specific route point by pointId
exports.deleteJourneyRoutePoint = async (req, res) => {
  try {
    const { pointId } = req.params;
    const result = await journeyRoutePointsService.deleteJourneyRoutePoint(
      pointId
    );
    res.status(200).json(result);
  } catch (error) {
    console.log("Error deleting journey route point:", error);
    res
      .status(500)
      .json({ message: "Error deleting journey route point", error });
  }
};
