const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// Nested location schema expected by createNewShipperRequest
const locationSchema = Joi.object({
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  description: Joi.string().required(),
}).required();

exports.createShipperRequest = Joi.object({
  shipperRequestBatchId: uuidSchema.required(),
  numberOfVehicles: Joi.number().integer().min(1).max(100).default(1),
  shippingDate: Joi.date().iso().required(),
  deliveryDate: Joi.date().iso().required(),
  shippingCost: Joi.number().required(),
  shippableItemQtyInQuintal: Joi.number().required(),
  shippableItemName: Joi.string().required(),
  shipperPhoneNumber: Joi.string().optional(), // required only when admin creates on behalf
  // requestType: Joi.string().valid("PASSENGER", "CARGO").optional(),

  // Bidding mode:
  //   'individual_target' — open bid visible to all individual drivers (max 9 vehicles)
  //   'company_target'    — targeted to a transport company for larger fleets (10+ vehicles)
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .default("individual_target")
    .optional(),

  // Required when requestMode = 'company_target'; identifies which company to target
  targetCompanyUniqueId: Joi.string().uuid().optional(),

  // Nested objects used by service
  originLocation: locationSchema,
  destination: locationSchema,
  vehicle: Joi.object({
    vehicleTypeUniqueId: uuidSchema.required(),
  }).required(),
})
  .custom((value, helpers) => {
    // Cross-field rule: individual drivers can't handle 10+ vehicles
    const mode = value.requestMode || "individual_target";
    const count = value.numberOfVehicles || 1;

    if (count > 9 && mode === "individual_target") {
      return helpers.message(
        "Requests for more than 9 vehicles require company target mode. " +
          "Please set requestMode to 'company target' to proceed.",
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
  limit: Joi.number().integer().min(1).max(100).optional(),
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
  rating: Joi.number().integer().min(1).max(5).required(),
}).unknown(true); // Allow additional fields for future extensibility

exports.verifyShipperStatusQuery = Joi.object({
  pageSize: Joi.number().integer().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).optional(),
}).unknown(true);

exports.getShipperRequestQuery = Joi.object({
  target: Joi.string().valid("all", "single").optional(),
  journeyStatusId: Joi.string().optional(), // single or comma-separated IDs
  limit: Joi.number().integer().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
  shipperUserUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  shipperRequestBatchId: uuidSchema.optional(),
}).unknown(true);

exports.acceptDriverRequestBody = Joi.object({
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
  limit: Joi.number().integer().min(1).max(100).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
}).unknown(true);
