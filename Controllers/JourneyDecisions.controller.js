const journeyDecisionsService = require("../Services/JourneyDecisions.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new journey decision
exports.createJourneyDecision = async (req, res) => {
  try {
    const {
      passengerRequestId,
      driverRequestId,
      journeyStatusId,
      decisionTime,
      decisionBy,
    } = req.body;
    const result = await journeyDecisionsService.createJourneyDecision(
      passengerRequestId,
      driverRequestId,
      journeyStatusId,
      decisionTime,
      decisionBy
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating journey decision:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error creating journey decision",
    });
  }
};

// Get all journey decisions
exports.getAllJourneyDecisions = async (req, res) => {
  try {
    const result = await journeyDecisionsService.getAllJourneyDecisions();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey decisions:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey decisions",
    });
  }
};
exports.getJourneyDecision4AllOrSingleUser = async (req, res) => {
  try {
    const { target, decidersUserUniqueId, roleId } = req.query;
    const { userUniqueId } = req?.user;
    const data = {
      target,
      userUniqueId:
        decidersUserUniqueId == "self" ? userUniqueId : decidersUserUniqueId,
      roleId,
    };
    const result =
      await journeyDecisionsService.getJourneyDecision4AllOrSingleUser({
        data,
      });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey decisions:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey decisions",
    });
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJourneyDecisionUniqueId = async (req, res) => {
  try {
    const { journeyDecisionUniqueId } = req.params;
    const result =
      await journeyDecisionsService.getJourneyDecisionByJourneyDecisionUniqueId(
        journeyDecisionUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey decision:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey decision",
    });
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJDriverRequestUniqueId = async (req, res) => {
  try {
    const { driverRequestUniqueId } = req.params;
    const result =
      await journeyDecisionsService.getJourneyDecisionByJDriverRequestUniqueId(
        driverRequestUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey decision:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey decision",
    });
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByPassengerRequestUniqueId = async (req, res) => {
  try {
    const { passengerRequestUniqueId } = req.params;
    const result =
      await journeyDecisionsService.getJourneyDecisionByPassengerRequestUniqueId(
        passengerRequestUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching journey decision:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch journey decision",
    });
  }
};

// Update a specific journey decision by ID
exports.updateJourneyDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { journeyStatusId, decisionTime, decisionBy } = req.body;
    const result = await journeyDecisionsService.updateJourneyDecision(
      id,
      journeyStatusId,
      decisionTime,
      decisionBy
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating journey decision:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error updating journey decision",
    });
  }
};

// Delete a specific journey decision by ID
exports.deleteJourneyDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyDecisionsService.deleteJourneyDecision(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting journey decision:", error);
    ServerResponder(res, {
      message: error,
      error: "Error deleting journey decision",
    });
  }
};
