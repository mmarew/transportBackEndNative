const journeyService = require("../Services/Journey.service");

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
    res.status(201).json(result);
  } catch (error) {
    console.log("Error creating journey:", error);
    res.status(500).json({ message: "Error creating journey", error });
  }
};

// Get all journeys
exports.getAllJourneys = async (req, res) => {
  try {
    const result = await journeyService.getAllJourneys();
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching journeys:", error);
    res.status(500).json({ message: "Error fetching journeys", error });
  }
};

// Get a specific journey by ID
exports.getJourneyById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyService.getJourneyById(id);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching journey:", error);
    res.status(500).json({ message: "Error fetching journey", error });
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
    res.status(200).json(result);
  } catch (error) {
    console.log("Error updating journey:", error);
    res.status(500).json({ message: "Error updating journey", error });
  }
};

// Delete a specific journey by ID
exports.deleteJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await journeyService.deleteJourney(id);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error deleting journey:", error);
    res.status(500).json({ message: "Error deleting journey", error });
  }
};
