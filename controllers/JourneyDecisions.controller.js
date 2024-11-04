const journeyDecisionsService = require("../Services/JourneyDecisions.service");

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
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating journey decision:", error);
    res.status(500).json({ message: "Error creating journey decision", error });
  }
};

// Get all journey decisions
exports.getAllJourneyDecisions = async (req, res) => {
  try {
    const result = await journeyDecisionsService.getAllJourneyDecisions();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching journey decisions:", error);
    res
      .status(500)
      .json({ message: "Error fetching journey decisions", error });
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyDecisionsService.getJourneyDecisionById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching journey decision:", error);
    res.status(500).json({ message: "Error fetching journey decision", error });
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
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating journey decision:", error);
    res.status(500).json({ message: "Error updating journey decision", error });
  }
};

// Delete a specific journey decision by ID
exports.deleteJourneyDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyDecisionsService.deleteJourneyDecision(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting journey decision:", error);
    res.status(500).json({ message: "Error deleting journey decision", error });
  }
};
