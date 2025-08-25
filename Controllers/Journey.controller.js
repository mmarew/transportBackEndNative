// const journeyService = require("../Services/Journey.service");
// const ServerResponder = require("../Utils/ServerResponder");
// // Create a new journey
// exports.createJourney = async (req, res) => {
//   try {
//     const {
//       journeyDecisionUniqueId,
//       startTime,
//       endTime,
//       fare,
//       journeyStatusId,
//     } = req.body;
//     const result = await journeyService.createJourney(
//       journeyDecisionUniqueId,
//       startTime,
//       endTime,
//       fare,
//       journeyStatusId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error creating journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to create journey",
//     });
//   }
// };

// // Get all journeys
// exports.getAllJourneys = async (req, res) => {
//   try {
//     const result = await journeyService.getAllJourneys();
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error fetching journeys:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch journeys",
//     });
//   }
// };

// // Get a specific journey by ID
// exports.getJourneyById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await journeyService.getJourneyById(id);
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error fetching journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch journey",
//     });
//   }
// };

// // Update a specific journey by ID
// exports.updateJourney = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { endTime, fare, journeyStatusId } = req.body;
//     const result = await journeyService.updateJourney(
//       id,
//       endTime,
//       fare,
//       journeyStatusId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error updating journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to update journey",
//     });
//   }
// };

// // Delete a specific journey by ID
// exports.deleteJourney = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await journeyService.deleteJourney(id);
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error deleting journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to delete journey",
//     });
//   }
// };
// // Get all completed journeys to get all data role must be 3
// exports.getCompletedJourney = async (req, res) => {
//   try {
//     const fromDate = req?.params?.fromDate;
//     const toDate = req?.params?.toDate;
//     const userRoleId = req?.user?.roleId;

//     // return;
//     let ownerUserUniqueId = req?.params?.ownerUserUniqueId;
//     // all data has to be fetched by admin only else return data not found
//     if (userRoleId != 3 && ownerUserUniqueId == "all") {
//       return res
//         .status(500)
//         .json({ message: "error", error: "data not found" });
//     }
//     if (ownerUserUniqueId == "self")
//       ownerUserUniqueId = req?.user?.userUniqueId;
//     const roleId = req?.params?.roleId;
//     console.log("@ownerUserUniqueId", ownerUserUniqueId);
//     const result = await journeyService.getCompletedJourney({
//       roleId,
//       ownerUserUniqueId,
//       toDate,
//       fromDate,
//     });
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error getting completed journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to get completed journey",
//     });
//   }
// };

// // searchCompletedJourneyByUserData;
// exports.searchCompletedJourneyByUserData = async (req, res) => {
//   try {
//     const { userData, roleId } = req.params;
//     ServerResponder(
//       res,
//       await journeyService.searchCompletedJourneyByUserData(userData, roleId)
//     );
//   } catch (error) {
//     console.log("Error searching completed journey by user data:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to search completed journey by user data",
//     });
//   }
// };

// // Get all ongoing journeys
// exports.getOngoingJourney = async (req, res) => {
//   try {
//     const userRoleId = req?.user?.roleId;

//     let ownerUserUniqueId = req?.params?.ownerUserUniqueId;
//     // all data has to be fetched by admin only else return data not found
//     if (userRoleId != 3 && ownerUserUniqueId == "all") {
//       return res
//         .status(500)
//         .json({ message: "error", error: "data not found" });
//     }
//     if (ownerUserUniqueId == "self")
//       ownerUserUniqueId = req?.user?.userUniqueId;
//     const roleId = req?.params?.roleId;

//     const result = await journeyService.getOngoingJourney(
//       roleId,
//       ownerUserUniqueId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error getting ongoing journey:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to get ongoing journey",
//     });
//   }
// };

// exports.searchOngoingJourneyByUserData = async (req, res) => {
//   try {
//     const { userData, roleId } = req.params;
//     ServerResponder(
//       res,
//       await journeyService.searchOngoingJourneyByUserData(userData, roleId)
//     );
//   } catch (error) {
//     console.log("Error searching ongoing journey by user data:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to search ongoing journey by user data",
//     });
//   }
// };
// exports.getAllCompletedJourneys = async (req, res) => {
//   try {
//     const roleId = req?.params?.roleId;
//     const result = await journeyService.getAllCompletedJourneys({ roleId });
//     ServerResponder(res, result);
//   } catch (error) {
//     console.log("Error fetching completed journeys:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch completed journeys",
//     });
//   }
// };

// // module.exports = {
// //   searchOngoingJourneyByUserData,
// // };

// Helper function to handle service responses

const journeyService = require("../Services/Journey.service");
const { validatePagination } = require("../Utils/paginationUtils");
const ServerResponder = require("../Utils/ServerResponder");
const handleServiceResponse = async (serviceCall, res) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: error.message || "Operation failed",
    });
  }
};

// Create a new journey
exports.createJourney = async (req, res) => {
  await handleServiceResponse(journeyService.createJourney(req.body), res);
};

// Get all journeys with pagination
exports.getAllJourneys = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit
  );

  await handleServiceResponse(
    journeyService.getAllJourneys(validatedPage, validatedLimit),
    res
  );
};

// Get a specific journey by ID
exports.getJourneyById = async (req, res) => {
  const { id } = req.params;
  await handleServiceResponse(journeyService.getJourneyById(id), res);
};

// Update a specific journey by ID
exports.updateJourney = async (req, res) => {
  const { id } = req.params;
  const { endTime, fare, journeyStatusId } = req.body;
  await handleServiceResponse(
    journeyService.updateJourney(id, endTime, fare, journeyStatusId),
    res
  );
};

// Delete a specific journey by ID
exports.deleteJourney = async (req, res) => {
  const { id } = req.params;
  await handleServiceResponse(journeyService.deleteJourney(id), res);
};

// Get completed journey with pagination
exports.getCompletedJourney = async (req, res) => {
  try {
    const fromDate = req?.query?.fromDate;
    const toDate = req?.query?.toDate;
    const userRoleId = req?.user?.roleId;
    const { page = 1, limit = 10 } = req.query;

    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit
    );

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId;

    // Authorization check
    if (userRoleId != 3 && ownerUserUniqueId == "all") {
      return ServerResponder(res, {
        message: "error",
        error: "Unauthorized access",
      });
    }

    if (ownerUserUniqueId == "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    const roleId = req?.query?.roleId;

    await handleServiceResponse(
      journeyService.getCompletedJourney({
        roleId,
        ownerUserUniqueId,
        toDate,
        fromDate,
        page: validatedPage,
        limit: validatedLimit,
      }),
      res
    );
  } catch (error) {
    console.error("Error getting completed journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get completed journey",
    });
  }
};

// Search completed journey by user data with pagination
exports.searchCompletedJourneyByUserData = async (req, res) => {
  const { phoneOrEmail, roleId } = req.query;
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit
  );

  await handleServiceResponse(
    journeyService.searchCompletedJourneyByUserData(
      phoneOrEmail,
      roleId,
      validatedPage,
      validatedLimit
    ),
    res
  );
};

// Get ongoing journey with pagination
exports.getOngoingJourney = async (req, res) => {
  try {
    const userRoleId = req?.user?.roleId;
    const { page = 1, limit = 10 } = req.query;
    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit
    );

    let ownerUserUniqueId = req?.params?.ownerUserUniqueId;

    // Authorization check
    if (userRoleId != 3 && ownerUserUniqueId == "all") {
      return ServerResponder(res, {
        message: "error",
        error: "Unauthorized access",
      });
    }

    if (ownerUserUniqueId == "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    const roleId = req?.params?.roleId;

    await handleServiceResponse(
      journeyService.getOngoingJourney(
        roleId,
        ownerUserUniqueId,
        validatedPage,
        validatedLimit
      ),
      res
    );
  } catch (error) {
    console.error("Error getting ongoing journey:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get ongoing journey",
    });
  }
};

// Search ongoing journey by user data with pagination
exports.searchOngoingJourneyByUserData = async (req, res) => {
  const { userData, roleId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit
  );

  await handleServiceResponse(
    journeyService.searchOngoingJourneyByUserData(
      userData,
      roleId,
      validatedPage,
      validatedLimit
    ),
    res
  );
};

// Get all completed journeys with pagination
exports.getAllCompletedJourneys = async (req, res) => {
  const roleId = req?.query?.roleId;
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit
  );

  await handleServiceResponse(
    journeyService.getAllCompletedJourneys({
      roleId,
      page: validatedPage,
      limit: validatedLimit,
    }),
    res
  );
};
