const journeyRoutePointsService = require("../Services/JourneyRoutePoints.service");
const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new journey route point
exports.createJourneyRoutePoint = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userUniqueId) {
      return next(new AppError("Unauthorized", AppError.UNAUTHORIZED));
    }
    const userUniqueId = req.query.userUniqueId;
    if (userUniqueId === "self") {
      req.body.userUniqueId = req.user.userUniqueId;
    }
    const result = await executeInTransaction(async () => {
      return await journeyRoutePointsService.createJourneyRoutePoint(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (req, res, next) => {
  try {
    const { journeyDecisionUniqueId } = req.query;
    const result = await journeyRoutePointsService.getJourneyRoutePoints(
      journeyDecisionUniqueId,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific route point by pointId
exports.updateJourneyRoutePoint = async (req, res, next) => {
  try {
    const { pointId } = req.params;
    const { latitude, longitude } = req.body;
    const result = await executeInTransaction(async () => {
      return await journeyRoutePointsService.updateJourneyRoutePoint(
        pointId,
        latitude,
        longitude,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific route point by pointId
exports.deleteJourneyRoutePoint = async (req, res, next) => {
  try {
    const { pointId } = req.params;
    const result = await executeInTransaction(async () => {
      return await journeyRoutePointsService.deleteJourneyRoutePoint(pointId);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
