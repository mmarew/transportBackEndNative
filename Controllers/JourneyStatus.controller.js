const journeyStatusService = require("../Services/JourneyStatus");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new journey status
const createJourneyStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await journeyStatusService.createJourneyStatus(req.body, req.user);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all journey statuses
const getAllJourneyStatuses = async (req, res, next) => {
  try {
    const result = await journeyStatusService.getAllJourneyStatuses(req.query);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a journey status by ID
const updateJourneyStatus = async (req, res, next) => {
  try {
    const { journeyStatusUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await journeyStatusService.updateJourneyStatusByUniqueId(
        journeyStatusUniqueId,
        { ...req.body },
        { ...req.user },
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a journey status by ID
const deleteJourneyStatus = async (req, res, next) => {
  try {
    const { journeyStatusUniqueId } = req.params;
    const user = req.user;
    const result = await executeInTransaction(async () => {
      return await journeyStatusService.deleteJourneyStatusByUniqueId(
        journeyStatusUniqueId,
        user,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createJourneyStatus,
  getAllJourneyStatuses,
  updateJourneyStatus,
  deleteJourneyStatus,
};
