const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

// Nested location schema expected by createNewShipperRequest
const locationSchema = Joi.object({
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  description: Joi.string().required(),
}).required();

exports.createShipperRequest = Joi.object({
  shipperRequestBatchUniqueId: uuidSchema.required(),
  numberOfVehicles: Joi.number()
    .integer()
    .min(1)
    .max(DOMAIN.MAX_REQUEST_VEHICLES)
    .default(1),
  shippingDate: Joi.date().iso().required(),
  deliveryDate: Joi.date().iso().required(),
  shippingCost: Joi.number().required(),
  shippableItemQtyInQuintal: Joi.number().required(),
  shippableItemName: Joi.string().required(),
  shipperPhoneNumber: Joi.string().optional(), // required for admin/queue-org-admin when creating request on behalf of a shipper
  // requestType: Joi.string().valid("PASSENGER", "CARGO").optional(),

  // Request mode:
  //   'individual_target' — open bid visible to all individual drivers (max 9 vehicles)
  //   'company_target'    — targeted to a transport company for larger fleets (10+ vehicles)
  // (Bidding-board visibility is a per-order flag — ShipperRequest.isBiddingApproved —
  // not a requestMode.)
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .default("individual_target")
    .optional(),

  // Required when requestMode = 'company_target'; identifies which company to target
  targetCompanyUniqueId: Joi.string().uuid().optional(),

  // Queue dispatch: when set, the order is offered to the FRONT waiting driver of
  // the queue organization's queue (per vehicle type) instead of distance-based
  // matching. The queue org must be approved + queueEnabled=1.
  queueOrganizationUniqueId: Joi.string().uuid().optional(),

  // Queue bid-base placement: when TRUE with queueOrganizationUniqueId, the order
  // is NOT FIFO-offered to the front waiting driver. Instead it is distance-matched
  // to nearby drivers (bidding board): queued drivers (waiting or rejectedByDriver
  // free) get bid priority first (up to 5), then nearest drivers fill the remainder.
  isBiddingApproved: Joi.boolean().default(false).optional(),

  // Receipt-based POD: when false, delivery is auto-confirmed on journey completion
  // (no driver receipts or shipper signatures needed). Default true preserves the
  // existing formal-POD flow for all legacy and new batches. Persisted on both
  // ShipperRequestBatch (header) and each ShipperRequest (order) row.
  isPodRequired: Joi.boolean().default(true).optional(),

  // Nested objects used by service
  originLocation: locationSchema,
  destination: locationSchema,
  vehicle: Joi.object({
    vehicleTypeUniqueId: uuidSchema.required(),
  }).required(),
})
  .custom((value, helpers) => {
    // Cross-field rule: individual drivers can't handle 10+ vehicles.
    // Queue-dispatch orders (queueOrganizationUniqueId set) are exempt: each of
    // the N rows is offered to its own FRONT waiting driver, so N can exceed 9.
    const mode = value.requestMode || "individual_target";
    const count = value.numberOfVehicles || 1;

    if (
      count > DOMAIN.MAX_INDIVIDUAL_TARGET_VEHICLES &&
      mode === "individual_target" &&
      !value.queueOrganizationUniqueId
    ) {
      return helpers.message(
        "Requests for more than DOMAIN.MAX_INDIVIDUAL_TARGET_VEHICLES vehicles require company target mode. " +
          "Please set requestMode to 'company target' to proceed.",
      );
    }

    // Bid-base placement only makes sense for a queue order: without a queue org,
    // isBiddingApproved has no FIFO to bypass (distance orders are already
    // distance-matched).
    if (value.isBiddingApproved === true && !value.queueOrganizationUniqueId) {
      return helpers.message(
        "isBiddingApproved (bid-base placement) requires queueOrganizationUniqueId to be set.",
      );
    }

    return value;
  })
  .unknown(true); // keep allowing additional fields

exports.requestParams = Joi.object({
  id: uuidSchema.required(),
}).unknown(true); // 'id' in routes probably map to shipperRequestUniqueId or similar

exports.shipperRequestQuery = Joi.object({
  // define query params
}).unknown(true);

exports.cancelRequestParams = Joi.object({
  userUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .required(),
});

exports.cancelShipperRequestBody = Joi.object({
  shipperRequestUniqueId: uuidSchema.required(),
  cancellationReasonsTypeId: Joi.number().integer().optional(),
}).unknown(true);

exports.getCancellationNotificationsQuery = Joi.object({
  seenStatus: Joi.string()
    .valid("no need to see it", "not seen by shipper yet", "seen by shipper")
    .optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
}).unknown(true);

exports.markCancellationAsSeen = Joi.object({
  journeyDecisionUniqueId: Joi.string().optional(),
  userUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .optional(),
}).unknown(true);

exports.markJourneyCompletionAsSeen = Joi.object({
  journeyDecisionUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.required(),
  rating: Joi.number().integer().min(1).max(DOMAIN.MAX_RATING).required(),
}).unknown(true); // Allow additional fields for future extensibility

exports.verifyShipperStatusQuery = Joi.object({
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .optional(),
  page: Joi.number().integer().min(1).optional(),
  queueOrganizationUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.getShipperRequestQuery = Joi.object({
  target: Joi.string().valid("all", "single").optional(),
  journeyStatusId: Joi.string().optional(), // single or comma-separated IDs
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  page: Joi.number().integer().min(1).optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
  shipperUserUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  shipperRequestBatchUniqueId: uuidSchema.optional(),
  queueOrganizationUniqueId: uuidSchema.optional(),
  shipperRequestCreatedByRoleId: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.number(),
      Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number())),
    )
    .optional(), // single roleId, comma-separated roleIds, or array of roleIds (service parses + sanitizes)
  hasUnansweredDriverRequest: Joi.alternatives()
    .try(Joi.boolean(), Joi.string())
    .optional(),
}).unknown(true);

exports.acceptDriverOfferBody = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
  journeyDecisionUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.required(),
}).unknown(true);

exports.rejectDriverOfferBody = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
  journeyDecisionUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.required(),
  shipperRequestId: Joi.number().integer().required(),
  journeyStatusId: Joi.number().integer().required(),
}).unknown(true);

exports.getAllActiveRequestsQuery = Joi.object({
  userUniqueId: uuidSchema.optional(),
  email: Joi.string().optional(),
  phoneNumber: Joi.string().optional(),
  fullName: Joi.string().optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  journeyStatusId: Joi.number().integer().optional(),
  shippableItemName: Joi.string().optional(),
  originPlace: Joi.string().optional(),
  destinationPlace: Joi.string().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  shippingDate: Joi.date().iso().optional(),
  deliveryDate: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
}).unknown(true);

// ── Route-corridor job search (drivers) ──────────────────────────────────────
// Only the fields the service actually honours are declared here. Results are
// ranked by distance to the corridor, so there is deliberately no
// sortBy/sortOrder for this endpoint.
exports.getJobsAlongRouteQuery = Joi.object({
  // Where the driver is standing now, and where they intend to end up.
  startLat: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required(),
  startLng: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required(),
  endLat: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required(),
  endLng: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required(),
  // Optional: omit to see every vehicle type along the corridor.
  vehicleTypeUniqueId: uuidSchema.optional(),
  // Cargo is free text (ShipperRequest.shippableItemName), matched as substring.
  shippableItemName: Joi.string().trim().min(2).max(100).optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
  // How far from the corridor a pickup/drop-off may sit and still count.
  radiusKm: Joi.number().min(1).max(100).optional(),
  // Corridor sampling step. Floored at 5 km: every candidate job is measured
  // against every sample point, so a tiny step on a long route would explode
  // the work per request.
  sampleKm: Joi.number().min(5).max(50).optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .optional(),
}).unknown(true);
