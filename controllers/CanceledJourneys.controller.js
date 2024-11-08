const canceledJourneyService = require("../Services/CanceledJourneys.service");

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
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating canceled journey:", error);
    res
      .status(500)
      .json({ message: "Failed to create canceled journey", error });
  }
};
exports.getCanceledJourneysByUserUniqueId = async (req, res) => {
  try {
    const { userUniqueId, roleId } = req.params;
    if (!userUniqueId || !roleId) {
      return res
        .status(400)
        .json({ message: "Missing userUniqueId or roleId" });
    }
    const result =
      await canceledJourneyService.getCanceledJourneysByUserUniqueId(
        userUniqueId,
        roleId
      );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching canceled journeys by user unique ID:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch canceled journeys", error });
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
