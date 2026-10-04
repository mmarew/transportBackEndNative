// controllers/Shipper.controller.js
const ShipperService = require("../Services/ShipperRequest");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { createUser } = require("../Services/User.service");
const { usersRoles, USER_STATUS } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { HTTP_STATUS, PAGINATION } = require("../Utils/Constants");

const createShipperRequest = async (req, res, next) => {
  try {
    const {
      shipperRequestBatchUniqueId,
      destination,
      vehicle,
      originLocation,
      numberOfVehicles,
      shippingDate,
      shippingCost,
      shippableItemQtyInQuintal,
      shippableItemName,
      deliveryDate,
    } = req.body;

    if (
      !shipperRequestBatchUniqueId ||
      !destination ||
      !vehicle ||
      !originLocation ||
      !numberOfVehicles ||
      !shippingDate ||
      !shippingCost ||
      !shippableItemQtyInQuintal ||
      !shippableItemName ||
      !deliveryDate
    ) {
      throw new AppError(
        "Missing required fields to create shipper request",
        AppError.BAD_REQUEST,
      );
    }

    const roleId = req.user.roleId;
    logger.debug("createShipperRequest roleId", { roleId });
    let userUniqueId = req.user.userUniqueId;
    // return;
    if (roleId === usersRoles.shipperRoleId) {
      req.body.userUniqueId = userUniqueId;
    }

    const shipperRequestCreatedBy = userUniqueId;
    const shipperRequestCreatedByRoleId = req.user.roleId;
    req.body.shipperRequestCreatedBy = shipperRequestCreatedBy;
    req.body.shipperRequestCreatedByRoleId = shipperRequestCreatedByRoleId;

    const result = await executeInTransaction(
      async () => {
        if (
          shipperRequestCreatedByRoleId === usersRoles.adminRoleId ||
          shipperRequestCreatedByRoleId === usersRoles.supperAdminRoleId ||
          shipperRequestCreatedByRoleId === usersRoles.queueOrgAdminRoleId
        ) {
          const { shipperPhoneNumber } = req.body;
          if (!shipperPhoneNumber) {
            throw new AppError(
              "shipperPhoneNumber is required when creating request on behalf of a shipper",
              AppError.BAD_REQUEST,
            );
          }
          const randNumber = Math.floor(1000 + Math.random() * 900000); // eslint-disable-line no-magic-numbers -- 4-digit verification code
          const createdUser = await createUser({
            phoneNumber: shipperPhoneNumber,
            fullName: null,
            roleId: usersRoles.shipperRoleId,
            statusId: USER_STATUS.ACTIVE,
            email: `fakeEmail_${randNumber}@shipper.com`,
            userRoleStatusDescription: "this is shipper ",
            requestedFrom: "system",
          });

          if (createdUser?.message === "error") {
            throw new AppError(
              createdUser.error || "Failed to create user for shipper",
              AppError.BAD_REQUEST,
            );
          }

          const dataOfShipper = createdUser?.data;
          userUniqueId = dataOfShipper?.userUniqueId;

          if (!userUniqueId) {
            throw new AppError(
              "Failed to get userUniqueId from created user",
              AppError.INTERNAL_SERVER_ERROR,
            );
          }

          req.body.userUniqueId = userUniqueId;
        }

        return await ShipperService.createShipperRequest(
          req.body,
          journeyStatusMap.waiting,
        );
      },
      {
        timeout: 60000,
        logging: true,
      },
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const acceptDriverOffer = async (req, res, next) => {
  try {
    req.body = req.body || {};
    req.body.journeyStatusId = journeyStatusMap.acceptedByShipper;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    req.body.roleId = user.roleId;
    const result = await executeInTransaction(async () => {
      return await ShipperService.acceptDriverOffer(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const rejectDriverOffer = async (req, res, next) => {
  try {
    req.body = req.body || {};
    req.body.journeyStatusId = journeyStatusMap.rejectedByShipper;
    req.body.previousStatusId = journeyStatusMap.acceptedByDriver;
    const user = req?.user;
    const userUniqueId = user.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await ShipperService.rejectDriverOffer(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getShipperRequestByShipperRequestUniqueId = async (req, res, next) => {
  try {
    const result = await ShipperService.getShipperRequest4allOrSingleUser({
      data: {
        target: "all",
        filters: { shipperRequestUniqueId: req.params.id },
        page: 1,
        limit: 1,
      },
    });
    const shipperRequest = result?.data?.[0] || null;
    if (shipperRequest) {
      ServerResponder(res, { message: "success", data: shipperRequest });
    } else {
      throw new AppError("Request not found", AppError.NOT_FOUND);
    }
  } catch (error) {
    next(error);
  }
};

const getShipperRequest4allOrSingleUser = async (req, res, next) => {
  try {
    const { limit, page, shipperUserUniqueId } = req.query;
    let target = req.query.target;
    let userUniqueId = req.user.userUniqueId;

    // Admins and super admins read cross-user by default: their own userUniqueId
    // is not a shipper owner, so scoping to it would always return an empty list.
    // They get the full list (optionally narrowed by shipperRequestCreatedByRoleId,
    // e.g. ?shipperRequestCreatedByRoleId=3) unless they pass shipperUserUniqueId.
    const isPrivilegedCaller =
      req.user.roleId === usersRoles.adminRoleId ||
      req.user.roleId === usersRoles.supperAdminRoleId;
    if (isPrivilegedCaller && !shipperUserUniqueId) {
      target = "all";
      userUniqueId = undefined;
    } else if (shipperUserUniqueId && shipperUserUniqueId !== "self") {
      // Privileged caller (or anyone) inspecting one specific shipper
      userUniqueId = shipperUserUniqueId;
    }
    let journeyStatusIds = req.query.journeyStatusId;
    if (journeyStatusIds) {
      if (typeof journeyStatusIds === "string") {
        journeyStatusIds = journeyStatusIds.split(",").map((id) => id.trim());
      }
      journeyStatusIds = Array.isArray(journeyStatusIds)
        ? journeyStatusIds
        : [journeyStatusIds];
    }

    const filters = { ...req.query };
    if (journeyStatusIds && journeyStatusIds.length > 0) {
      filters.journeyStatusIds = journeyStatusIds;
    }

    const { resolveQueueStaffOrgScope } = require("../Services/QueueOrganization/helpers");
    // Queue staff (11/12) operate inside exactly ONE queue org at a time —
    // resolve it here so the service scopes to a single org, never a union.
    if (
      req.user.roleId === usersRoles.queueOrgAdminRoleId ||
      req.user.roleId === usersRoles.queueDispatcherRoleId
    ) {
      filters.queueOrganizationUniqueId = await resolveQueueStaffOrgScope(
        req.user.userUniqueId,
        filters.queueOrganizationUniqueId,
      );
    }

    const data = {
      filters,
      userUniqueId,
      target,
      limit,
      page,
      roleId: req.user.roleId,
    };

    const result = await ShipperService.getShipperRequest4allOrSingleUser({
      data,
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateRequestById = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await ShipperService.updateRequestById(req.params.id, req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deleteRequest = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await ShipperService.deleteRequest(req.params.id);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
const verifyShipperStatus = async (req, res, next) => {
  try {
    const { pageSize, page, queueOrganizationUniqueId } = req?.query || {};
    const { userUniqueId, roleId } = req?.user ?? {};

    // Queue staff (11/12): operate inside exactly ONE queue org at a time.
    // Resolve it (single membership auto-resolves, 2+ requires the org param,
    // non-member / no-membership are rejected). Only then pass it to the
    // service so the active-request/count queries scope to that exact org.
    let resolvedOrg = queueOrganizationUniqueId;
    if (
      roleId === usersRoles.queueOrgAdminRoleId ||
      roleId === usersRoles.queueDispatcherRoleId
    ) {
      const { resolveQueueStaffOrgScope } = require("../Services/QueueOrganization/helpers");
      resolvedOrg = await resolveQueueStaffOrgScope(
        userUniqueId,
        queueOrganizationUniqueId,
      );
    }

    const result = await ShipperService.verifyShipperStatus({
      userUniqueId,
      roleId,
      pageSize,
      page,
      queueOrganizationUniqueId: resolvedOrg,
      sendNotificationsToDrivers: true,
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};
const cancelShipperRequest = async (req, res, next) => {
  try {
    let ownerUserUniqueId = req?.params?.userUniqueId;
    const { userUniqueId, roleId } = req?.user || {};
    const { shipperRequestUniqueId } = req?.body || {};

    if (!shipperRequestUniqueId || !userUniqueId || !roleId) {
      throw new AppError(
        "shipperRequestUniqueId is required in request body",
        AppError.BAD_REQUEST,
      );
    }

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = userUniqueId;
    }

    const cancellationJourneyStatusId =
      ownerUserUniqueId === userUniqueId
        ? journeyStatusMap.cancelledByShipper
        : journeyStatusMap.cancelledByAdmin;

    req.body.ownerUserUniqueId = ownerUserUniqueId;
    req.body.user = req.user;
    req.body.cancellationJourneyStatusId = cancellationJourneyStatusId;

    const result = await executeInTransaction(async () => {
      return await ShipperService.cancelShipperRequest(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel an entire shipper request batch in one atomic operation.
 * PUT /api/shipperRequest/cancelBatch/:shipperRequestBatchUniqueId
 */
const cancelShipperRequestBatch = async (req, res, next) => {
  try {
    const { userUniqueId, roleId } = req.user;
    const { shipperRequestBatchUniqueId } = req.params;
    const { cancellationReasonsTypeId } = req.body;

    const result = await executeInTransaction(async () =>
      ShipperService.cancelShipperRequestBatch({
        shipperRequestBatchUniqueId,
        userUniqueId,
        roleId,
        cancellationReasonsTypeId,
      }),
    );

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const markJourneyCompletionAsSeenController = async (req, res, next) => {
  try {
    const user = req.user;
    const userUniqueId = user?.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await ShipperService.seenByShipper(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const getCancellationNotificationsController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const { seenStatus, page, limit } = req.query;

    if (!userUniqueId) {
      throw new AppError("User not authenticated", AppError.UNAUTHORIZED);
    }

    const result = await ShipperService.getCancellationNotifications({
      userUniqueId,
      seenStatus,
      page: page || 1,
      limit: limit || PAGINATION.DEFAULT_PAGE_SIZE,
    });

    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const markCancellationAsSeenController = async (req, res, next) => {
  try {
    const { userUniqueId } = req?.user || {};
    const { journeyDecisionUniqueId } = req.body;
    const bodyUserUniqueId = req.body?.userUniqueId;

    const result = await executeInTransaction(async () => {
      return await ShipperService.markCancellationAsSeen({
        userUniqueId: bodyUserUniqueId || userUniqueId,
        journeyDecisionUniqueId,
      });
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

/**
 * GET ALL ACTIVE REQUESTS — online job news feed (drivers), with optional
 * route-corridor search.
 *
 * Serves the driver-facing feed of currently open jobs. It is location-agnostic:
 * a driver sees every active job wherever they are, so it doubles as the app's
 * job "news ticker" table.
 *
 * Feed contents (see Services/ShipperRequest/readActive.service.js):
 * - Non-queue jobs in active statuses (waiting/requested/acceptedByDriver).
 * - Queue-backed jobs open to bidding (ShipperRequest.isBiddingApproved = TRUE) —
 *   queue orgs place individual orders on the bidding board; these are
 *   distance-matched and grab-able by drivers like ordinary online jobs.
 * - FIFO-only queue orders are excluded by design (queue offer → accept only).
 *
 * Two modes, one URL:
 * - No route coordinates → the feed above, sorted nearest-first.
 * - startLat/startLng/endLat/endLng all present → ROUTE MODE. The driver tells us
 *   where they are and where they are headed; OSRM resolves the drivable route and
 *   only jobs whose pickup OR drop-off sits on that corridor come back. Running
 *   Bahir Dar → Djibouti surfaces the Debretabor and Semera loads on the way, not
 *   just the ones sitting in Djibouti. Each row is tagged `matchedBy`
 *   (origin/destination/both) and the response carries `mode: "route"` plus
 *   `corridor` metadata. An unroutable or degenerate pair is a 400, not a 500.
 *
 * Driver convenience:
 * - When the caller is a DRIVER (role 4), the controller resolves the driver's
 *   most recent known origin (last DriverRequest with lat/lng) and injects it as
 *   driverLatitude/driverLongitude so results sort nearest-first via distanceKm.
 *   In feed mode it never filters by that location — proximity is a sort hint, not
 *   a scope. An explicit `sortBy`/`sortOrder` always overrides it, in both modes.
 *
 * @param {Object} req - Express request (query params per getAllActiveRequestsQuery schema)
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
const getAllActiveRequestsController = async (req, res, next) => {
  try {
    const filters = {
      userUniqueId: req.query.userUniqueId,
      email: req.query.email,
      phoneNumber: req.query.phoneNumber,
      fullName: req.query.fullName,
      vehicleTypeUniqueId: req.query.vehicleTypeUniqueId,
      journeyStatusId: req.query.journeyStatusId,
      shippableItemName: req.query.shippableItemName,
      originPlace: req.query.originPlace,
      destinationPlace: req.query.destinationPlace,
      requestMode: req.query.requestMode,
      // Route-corridor search. Passed through untouched: the service decides
      // whether these four are complete enough to switch modes, so a partially
      // filled search never silently degrades into the unfiltered feed.
      startLat: req.query.startLat,
      startLng: req.query.startLng,
      endLat: req.query.endLat,
      endLng: req.query.endLng,
      radiusKm: req.query.radiusKm,
      sampleKm: req.query.sampleKm,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      shippingDate: req.query.shippingDate,
      deliveryDate: req.query.deliveryDate,
      page: req.query.page ? parseInt(req.query.page) : 1,
      limit: req.query.limit ? parseInt(req.query.limit) : PAGINATION.DEFAULT_PAGE_SIZE,
      // Left undefined when absent on purpose — the service needs to tell
      // "caller picked a sort" apart from "caller took the default", because
      // route mode ranks differently when nobody has chosen.
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
    };

    // When the caller is a driver, resolve their most recent location so the
    // active-requests list can be sorted by distance (nearest first). This holds
    // in route mode too: a driver halfway to Djibouti wants the next load on the
    // way, not the one furthest ahead of them.
    if (req.user?.userUniqueId && req.user?.roleId === usersRoles.driverRoleId) {
      const { pool } = require("../Middleware/Database.config");
      const [[latest]] = await pool.query(
        `SELECT originLatitude, originLongitude
         FROM DriverRequest
         WHERE userUniqueId = ?
           AND originLatitude IS NOT NULL
           AND originLongitude IS NOT NULL
         ORDER BY driverRequestId DESC
         LIMIT 1`,
        [req.user.userUniqueId],
      );
      if (latest) {
        filters.driverLatitude = latest.originLatitude;
        filters.driverLongitude = latest.originLongitude;
      }
    }

    const result = await ShipperService.getAllActiveRequests(filters);

    return ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * Route-corridor job search for drivers.
 *
 * @deprecated Kept only so existing driver-app builds keep working. The corridor
 * search now lives in getAllActiveRequestsController under route mode — same URL,
 * same `?startLat=&startLng=&endLat=&endLng=` query, plus every feed filter. Call
 * that one and this endpoint can go.
 *
 * The driver supplies where they are standing now and where they intend to end
 * up (e.g. Bahir Dar -> Djibouti). The backend asks OSRM for the drivable route
 * between them, samples a corridor along it, and returns live jobs whose pickup
 * OR drop-off sits on that corridor (e.g. Debretabor -> Semera).
 *
 * Coordinates are used exactly as stored; this endpoint does not attempt to
 * repair or re-geocode them.
 */
const getJobsAlongRouteController = async (req, res, next) => {
  try {
    const filters = {
      startLat: req.query.startLat,
      startLng: req.query.startLng,
      endLat: req.query.endLat,
      endLng: req.query.endLng,
      vehicleTypeUniqueId: req.query.vehicleTypeUniqueId,
      shippableItemName: req.query.shippableItemName,
      requestMode: req.query.requestMode,
      radiusKm: req.query.radiusKm ? Number(req.query.radiusKm) : undefined,
      sampleKm: req.query.sampleKm ? Number(req.query.sampleKm) : undefined,
      page: req.query.page ? parseInt(req.query.page, 10) : 1,
      limit: req.query.limit
        ? parseInt(req.query.limit, 10)
        : PAGINATION.DEFAULT_PAGE_SIZE,
    };

    const result = await ShipperService.getJobsAlongRoute(filters);

    return ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  acceptDriverOffer,
  getShipperRequestByShipperRequestUniqueId,
  getShipperRequest4allOrSingleUser,
  cancelShipperRequest,
  cancelShipperRequestBatch,
  verifyShipperStatus,
  createShipperRequest,
  updateRequestById,
  deleteRequest,
  rejectDriverOffer,
  markJourneyCompletionAsSeenController,
  getCancellationNotificationsController,
  markCancellationAsSeenController,
  getAllActiveRequestsController,
  getJobsAlongRouteController,
};
