const journeyService = require("../Services/Journey");
const { validatePagination } = require("../Utils/paginationUtils");
const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { usersRolesList } = require("../Utils/ListOfSeedData");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

const handleServiceResponse = async (serviceCall, res, next) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Create a new journey
exports.createJourney = async (req, res, next) => {
  await handleServiceResponse(
    executeInTransaction(async () => {
      return await journeyService.createJourney(req.body);
    }),
    res,
    next,
  );
};

// Get all journeys with pagination
exports.getAllJourneys = async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit,
  );

  await handleServiceResponse(
    journeyService.getAllJourneys(validatedPage, validatedLimit),
    res,
    next,
  );
};

// Get a specific journey by ID
exports.getJourneyByJourneyUniqueId = async (req, res, next) => {
  const { journeyUniqueId } = req.params;
  await handleServiceResponse(
    journeyService.getJourneyByJourneyUniqueId(journeyUniqueId),
    res,
    next,
  );
};

// Update a specific journey by ID
exports.updateJourney = async (req, res, next) => {
  const { journeyUniqueId } = req.params;
  const { endTime, fare, journeyStatusId } = req.body;
  await handleServiceResponse(
    executeInTransaction(async () => {
      return await journeyService.updateJourney({journeyUniqueId, endTime, fare, journeyStatusId});
    }),
    res,
    next,
  );
};

// Delete a specific journey by unique ID
exports.deleteJourney = async (req, res, next) => {
  const { journeyUniqueId } = req.params;
  await handleServiceResponse(
    executeInTransaction(async () => {
      return await journeyService.deleteJourney(journeyUniqueId);
    }),
    res,
    next,
  );
};

exports.getCompletedJourneyCountsByDate = async (req, res, next) => {
  try {
    const fromDate = req?.query?.fromDate;
    const toDate = req?.query?.toDate;

    const userRoleId = req?.user?.roleId;

    // Validate required parameters
    if (!fromDate || !toDate) {
      return next(new AppError("fromDate and toDate are required", AppError.BAD_REQUEST));
    }

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId || "all";

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin =
        userRoleId === usersRolesList.admin.roleId ||
        userRoleId === usersRolesList.supperAdmin.roleId;
      if (!isAdmin) {
        // Non-admin users can only see their own data
        ownerUserUniqueId = req?.user?.userUniqueId;
      }
    }

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    // Build filters object matching your reference structure
    const filters = {
      ownerUserUniqueId,
      toDate,
      fromDate,
      userFilters: {
        fullName: req?.query?.fullName,
        phone: req?.query?.phone,
        email: req?.query?.email,
        search: req?.query?.search,
      },
    };

    await handleServiceResponse(
      journeyService.getCompletedJourneyCountsByDate(filters),
      res,
      next,
    );
  } catch (error) {
    next(error);
  }
};

// Search completed journey by user data with pagination
exports.searchCompletedJourneyByUserData = async (req, res, next) => {
  const { phoneOrEmail, roleId } = req.query;
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit,
  );

  await handleServiceResponse(
    journeyService.searchCompletedJourneyByUserData(
      phoneOrEmail,
      roleId,
      validatedPage,
      validatedLimit,
    ),
    res,
    next,
  );
};

// Get ongoing journey with pagination
exports.getOngoingJourney = async (req, res, next) => {
  try {
    const userRoleId = req?.user?.roleId;
    // /:ownerUserUniqueId/:roleId
    const { page = 1, limit = 10 } = req.query;
    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit,
    );

    let ownerUserUniqueId = req?.query?.ownerUserUniqueId;

    // Authorization check: only allow admin (3) or super admin (6) to access all data
    if (ownerUserUniqueId === "all") {
      const isAdmin =
        userRoleId === usersRolesList.admin.roleId ||
        userRoleId === usersRolesList.supperAdmin.roleId;
      if (!isAdmin) {
        return next(new AppError("Unauthorized access", AppError.FORBIDDEN));
      }
    }

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = req?.user?.userUniqueId;
    }

    const roleId = req?.query?.roleId || usersRolesList.driver.roleId;

    await handleServiceResponse(
      journeyService.getOngoingJourney({
        ownerUserUniqueId,
        filters: { ...req?.query, roleId, ownerUserUniqueId },
        page: validatedPage,
        limit: validatedLimit,
      }),
      res,
      next,
    );
  } catch (error) {
    next(error);
  }
};

// Search ongoing journey by user data with pagination
// (removed) searchOngoingJourneyByUserData - functionality merged into getOngoingJourney

// Get all completed journeys with pagination
exports.getAllCompletedJourneys = async (req, res, next) => {
  const roleId = req?.query?.roleId;
  const { page = 1, limit = 10 } = req.query;
  const { page: validatedPage, limit: validatedLimit } = validatePagination(
    page,
    limit,
  );

  await handleServiceResponse(
    journeyService.getAllCompletedJourneys({
      roleId,
      page: validatedPage,
      limit: validatedLimit,
    }),
    res,
    next,
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
// GET /api/journey?email=user@example.com
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
exports.getJourneys = async (req, res, next) => {
  try {
    const userRoleId = req?.user?.roleId;
    const userUniqueId = req?.user?.userUniqueId;
    const {
      journeyStatusId,
      journeyUniqueId,
      journeyDecisionUniqueId,
      ownerUserUniqueId,

      fullName,
      phone,
      email,
      search,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;
    let roleId = req?.query?.roleId;
    const { page: validatedPage, limit: validatedLimit } = validatePagination(
      page,
      limit,
    );

    let finalOwnerUserUniqueId = ownerUserUniqueId;

    if (ownerUserUniqueId === "all") {
      const isAdmin =
        userRoleId === usersRolesList.admin.roleId ||
        userRoleId === usersRolesList.supperAdmin.roleId;
      if (!isAdmin) {
        return next(
          new AppError(
            "Unauthorized access. Only admin can view all journeys",
            AppError.FORBIDDEN,
          ),
        );
      }
    } else if (ownerUserUniqueId === "self" || !ownerUserUniqueId) {
      finalOwnerUserUniqueId = userUniqueId;
      roleId = userRoleId;
    }

    const filters = {
      journeyStatusId: journeyStatusId ? parseInt(journeyStatusId) : undefined,
      journeyUniqueId,
      journeyDecisionUniqueId,
      roleId: roleId ? parseInt(roleId) : undefined,
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
    await handleServiceResponse(journeyService.getJourneys(filters), res, next);
  } catch (error) {
    next(error);
  }
};
