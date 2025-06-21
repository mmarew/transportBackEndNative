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
// Get all completed journeys to get all data role must be 3
exports.getCompletedJourney = async (req, res) => {
  try {
    const fromDate = req?.params?.fromDate;
    const toDate = req?.params?.toDate;
    const userRoleId = req?.user?.roleId;

    // return;
    let ownerUserUniqueId = req?.params?.ownerUserUniqueId;
    // all data has to be fetched by admin only else return data not found
    if (userRoleId != 3 && ownerUserUniqueId == "all") {
      return res
        .status(500)
        .json({ message: "error", error: "data not found" });
    }
    if (ownerUserUniqueId == "self")
      ownerUserUniqueId = req?.user?.userUniqueId;
    const roleId = req?.params?.roleId;
    console.log("@ownerUserUniqueId", ownerUserUniqueId);
    const result = await journeyService.getCompletedJourney({
      roleId,
      ownerUserUniqueId,
      toDate,
      fromDate,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error getting completed journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get completed journey",
    });
  }
};

// searchCompletedJourneyByUserData;
exports.searchCompletedJourneyByUserData = async (req, res) => {
  try {
    const { userData, roleId } = req.params;
    ServerResponder(
      res,
      await journeyService.searchCompletedJourneyByUserData(userData, roleId)
    );
  } catch (error) {
    console.log("Error searching completed journey by user data:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to search completed journey by user data",
    });
  }
};

// Get all ongoing journeys
exports.getOngoingJourney = async (req, res) => {
  try {
    const userRoleId = req?.user?.roleId;

    let ownerUserUniqueId = req?.params?.ownerUserUniqueId;
    // all data has to be fetched by admin only else return data not found
    if (userRoleId != 3 && ownerUserUniqueId == "all") {
      return res
        .status(500)
        .json({ message: "error", error: "data not found" });
    }
    if (ownerUserUniqueId == "self")
      ownerUserUniqueId = req?.user?.userUniqueId;
    const roleId = req?.params?.roleId;

    const result = await journeyService.getOngoingJourney(
      roleId,
      ownerUserUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error getting ongoing journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get ongoing journey",
    });
  }
};

exports.searchOngoingJourneyByUserData = async (req, res) => {
  try {
    const { userData, roleId } = req.params;
    ServerResponder(
      res,
      await journeyService.searchOngoingJourneyByUserData(userData, roleId)
    );
  } catch (error) {
    console.log("Error searching ongoing journey by user data:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to search ongoing journey by user data",
    });
  }
};

// module.exports = {
//   searchOngoingJourneyByUserData,
// };
