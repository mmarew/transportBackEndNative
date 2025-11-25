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

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin = userRoleId === 3 || userRoleId === 6;
      if (!isAdmin) {
        return ServerResponder(res, {
          message: "error",
          error: "Unauthorized access",
        });
      }
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
    // /:ownerUserUniqueId/:roleId
    const { page = 1, limit = 10 } = req.query;
    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit
    );

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId;

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin = userRoleId === 3 || userRoleId === 6;
      if (!isAdmin) {
        return ServerResponder(res, {
          message: "error",
          error: "Unauthorized access",
        });
      }
    }

    if (ownerUserUniqueId == "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    const roleId = req?.query?.roleId || 2;
    console.log("@getOngoingJourney", {
      roleId,
      ownerUserUniqueId,
      validatedPage,
      validatedLimit,
    });
    await handleServiceResponse(
      journeyService.getOngoingJourney({
        ownerUserUniqueId,
        filters: { ...req?.query, roleId, ownerUserUniqueId },
        page: validatedPage,
        limit: validatedLimit,
      }),
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
// (removed) searchOngoingJourneyByUserData - functionality merged into getOngoingJourney

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

// In your journey controller - replace all existing GET methods with this single one

// Unified GET method for all journey filtering
// # Get all journeys (no filters) GET /api/journey

// # Filter by journey status GET /api/journey?journeyStatusId=6

// # Filter by specific user GET /api/journey?ownerUserUniqueId=123&roleId=2

// # Filter by user details
// GET /api/journey?fullName=John
// GET /api/journey?phone=0912
// GET /api/journey?email=john@gmail.com
// GET /api/journey?search=john

// # Filter by dates
// GET /api/journey?fromDate=2024-01-01&toDate=2024-01-31

// # Filter by specific journey
// GET /api/journey?journeyUniqueId=journey-123
// GET /api/journey?journeyDecisionUniqueId=decision-456

// # Combined filters
// GET /api/journey?journeyStatusId=6&roleId=2&fromDate=2024-01-01&search=john

// # With pagination
// GET /api/journey?page=2&limit=20&journeyStatusId=5

// # Admin view all
// GET /api/journey?ownerUserUniqueId=all&roleId=1
// In your journey controller
exports.getJourneys = async (req, res) => {
  try {
    const userRoleId = req?.user?.roleId;
    const userUniqueId = req?.user?.userUniqueId;

    const {
      journeyStatusId,
      journeyUniqueId,
      journeyDecisionUniqueId,
      ownerUserUniqueId,
      roleId = 2,
      fullName,
      phone,
      email,
      search,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit
    );

    let finalOwnerUserUniqueId = ownerUserUniqueId;
    console.log("@ownerUserUniqueId", ownerUserUniqueId);
    if (ownerUserUniqueId === "all") {
      const isAdmin = userRoleId === 3 || userRoleId === 6;
      if (!isAdmin) {
        return ServerResponder(res, {
          message: "error",
          error: "Unauthorized access. Only admin can view all journeys",
        });
      }
    } else if (ownerUserUniqueId == "self" || !ownerUserUniqueId) {
      finalOwnerUserUniqueId = userUniqueId;
    }

    const filters = {
      journeyStatusId: journeyStatusId ? parseInt(journeyStatusId) : undefined,
      journeyUniqueId,
      journeyDecisionUniqueId,
      roleId: parseInt(roleId),
      ownerUserUniqueId: finalOwnerUserUniqueId,
      userFilters: {
        fullName,
        phone,
        email,
        search,
      },
      dateFilters: {
        fromDate,
        toDate,
      },
      page: validatedPage,
      limit: validatedLimit,
    };

    await handleServiceResponse(journeyService.getJourneys(filters), res);
  } catch (error) {
    console.error("Error getting journeys:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get journeys",
    });
  }
};
