const journeyStatusService = require("../Services/JourneyStatus.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new journey status
const createJourneyStatus = async (req, res) => {
  try {
    const result = await journeyStatusService.createJourneyStatus(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating journey status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create journey status",
    });
  }
};

// Get all journey statuses
const getAllJourneyStatuses = async (req, res) => {
  try {
    const requestedBy = req.params.requestedBy;
    const result = await journeyStatusService.getAllJourneyStatuses(
      requestedBy
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey statuses:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey statuses",
    });
  }
};

// Get a single journey status by ID
const getJourneyStatusById = async (req, res) => {
  try {
    const { journeyStatusUniqueId } = req.params;
    const result = await journeyStatusService.getJourneyStatusById(
      journeyStatusUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey status by ID:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey status by ID",
    });
  }
};

// Update a journey status by ID
const updateJourneyStatus = async (req, res) => {
  try {
    const { journeyStatusUniqueId } = req.params;
    const result = await journeyStatusService.updateJourneyStatus(
      journeyStatusUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating journey status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update journey status",
    });
  }
};

// Delete a journey status by ID
const deleteJourneyStatus = async (req, res) => {
  try {
    const { journeyStatusUniqueId } = req.params;
    const result = await journeyStatusService.deleteJourneyStatus(
      journeyStatusUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting journey status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete journey status",
    });
  }
};

module.exports = {
  createJourneyStatus,
  getAllJourneyStatuses,
  getJourneyStatusById,
  updateJourneyStatus,
  deleteJourneyStatus,
};
