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
exports.getJourneyByJourneyUniqueId = async (req, res) => {
  const { journeyUniqueId } = req.params;
  await handleServiceResponse(
    journeyService.getJourneyByJourneyUniqueId(journeyUniqueId),
    res
  );
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
    console.log("@getCompletedJourney", req?.user);
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
