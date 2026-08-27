const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN } = require("../Utils/Constants");

// Driver request expects a nested currentLocation, not flat originLatitude/originLongitude.
// description is optional: the app reverse-geocodes when it can, but a raw GPS fix
// (no place name yet) is still a valid request — the services fall back to the
// existing originPlace / coordinates string when it's missing.
// unknown(true): the app sends the whole GPS Position.coords object (speed,
// heading, altitude, accuracy, altitudeAccuracy, timestamp, ...) — never reject it.
const locationSchema = Joi.object({
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  description: Joi.string().optional(),
})
  .unknown(true)
  .required();

exports.createRequest = Joi.object({
  currentLocation: locationSchema,
  journeyStatusId: Joi.number().integer().optional(), // optional override
}).unknown(true);

exports.takeFromStreet = Joi.object({
  // fields
}).unknown(true);

exports.requestIdParams = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
});

// Generic update driver request - body is the update payload
exports.updateDriverRequest = Joi.object({
  journeyStatusId: Joi.number().integer().optional(),
  originPlace: Joi.string().optional(),
  originLatitude: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .optional(),
  originLongitude: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .optional(),
  driverRequestUpdatedBy: Joi.string().uuid().optional(),
}).unknown(true);

exports.cancelRequestQuery = Joi.object({
  //
}).unknown(true);

exports.getCancellationNotificationsQuery = Joi.object({
  seenStatus: Joi.string()
    .valid("no need to see it", "not seen by driver yet", "seen by driver")
    .optional(),
}).unknown(true);

exports.markCancellationAsSeen = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
}).unknown(false);

exports.markRejectionAsSeen = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
}).unknown(false);

exports.markNotSelectionInBidAsSeen = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
}).unknown(false);

exports.markNegativeStatusAsSeen = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
}).unknown(false);

// Verify driver status - no query parameters required (uses authenticated user's userUniqueId from token)
// Allows unknown query parameters for flexibility, but validates none are required
exports.verifyDriverJourneyStatus = Joi.object({}).unknown(true);

exports.acceptShipperRequest = Joi.object({
  driverRequestUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.required(),
  journeyDecisionUniqueId: uuidSchema.required(),
  shippingCostByDriver: Joi.number().min(0).required(),
}).unknown(false);

// Send updated driver location to shipper
exports.sendUpdatedLocation = Joi.object({
  journeyDecisionUniqueId: uuidSchema.required().messages({
    "any.required": "journeyDecisionUniqueId is required",
    "string.guid": "journeyDecisionUniqueId must be a valid UUID",
  }),
  latitude: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required()
    .messages({
      "any.required": "latitude is required",
      "number.min": "latitude must be between -90 and 90",
      "number.max": "latitude must be between -90 and 90",
    }),
  longitude: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required()
    .messages({
      "any.required": "longitude is required",
      "number.min": "longitude must be between -180 and 180",
      "number.max": "longitude must be between -180 and 180",
    }),
  shipperPhone: Joi.string().optional(), // Optional - will be fetched from journey data if not provided
  additionalData: Joi.object().optional(), // Any additional data to include in notification
}).unknown(false);

// Complete journey - driver marks journey as completed
exports.completeJourney = Joi.object({
  journeyDecisionUniqueId: uuidSchema.required().messages({
    "any.required": "journeyDecisionUniqueId is required",
    "string.guid": "journeyDecisionUniqueId must be a valid UUID",
  }),
  shipperRequestUniqueId: uuidSchema.required().messages({
    "any.required": "shipperRequestUniqueId is required",
    "string.guid": "shipperRequestUniqueId must be a valid UUID",
  }),
  driverRequestUniqueId: uuidSchema.required().messages({
    "any.required": "driverRequestUniqueId is required",
    "string.guid": "driverRequestUniqueId must be a valid UUID",
  }),
  journeyUniqueId: uuidSchema.required().messages({
    "any.required": "journeyUniqueId is required",
    "string.guid": "journeyUniqueId must be a valid UUID",
  }),
  journeyCompletingLat: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required()
    .messages({
      "any.required": "journeyCompletingLat is required",
      "number.base": "journeyCompletingLat must be a number",
      "number.min": "journeyCompletingLat must be between -90 and 90",
      "number.max": "journeyCompletingLat must be between -90 and 90",
    }),
  journeyCompletingLng: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required()
    .messages({
      "any.required": "journeyCompletingLng is required",
      "number.base": "journeyCompletingLng must be a number",
      "number.min": "journeyCompletingLng must be between -180 and 180",
      "number.max": "journeyCompletingLng must be between -180 and 180",
    }),
  paymentMethodUniqueId: uuidSchema.optional().messages({
    "string.guid": "paymentMethodUniqueId must be a valid UUID",
  }),
  vehicleTypeUniqueId: uuidSchema.optional().messages({
    "string.guid": "vehicleTypeUniqueId must be a valid UUID",
  }),
}).unknown(true); // Allow additional fields like location data

// Start journey - driver begins journey with current location
exports.startJourney = Joi.object({
  driverRequestUniqueId: uuidSchema.required().messages({
    "any.required": "driverRequestUniqueId is required",
    "string.guid": "driverRequestUniqueId must be a valid UUID",
  }),
  shipperRequestUniqueId: uuidSchema.required().messages({
    "any.required": "shipperRequestUniqueId is required",
    "string.guid": "shipperRequestUniqueId must be a valid UUID",
  }),
  journeyDecisionUniqueId: uuidSchema.required().messages({
    "any.required": "journeyDecisionUniqueId is required",
    "string.guid": "journeyDecisionUniqueId must be a valid UUID",
  }),
  journeyStartingLat: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required()
    .messages({
      "any.required": "journeyStartingLat is required",
      "number.base": "journeyStartingLat must be a number",
      "number.min": "journeyStartingLat must be between -90 and 90",
      "number.max": "journeyStartingLat must be between -90 and 90",
    }),
  journeyStartingLng: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required()
    .messages({
      "any.required": "journeyStartingLng is required",
      "number.base": "journeyStartingLng must be a number",
      "number.min": "journeyStartingLng must be between -180 and 180",
      "number.max": "journeyStartingLng must be between -180 and 180",
    }),
}).unknown(true); // Allow additional fields

// Shared shape for the loading stages (5/6/7).
// latitude/longitude = driver GPS at the stage moment (recorded like startJourney's
// journeyStartingLat/Lng).
const loadingStageSchema = Joi.object({
  journeyDecisionUniqueId: uuidSchema.required().messages({
    "any.required": "journeyDecisionUniqueId is required",
    "string.guid": "journeyDecisionUniqueId must be a valid UUID",
  }),
  latitude: Joi.number()
    .min(DOMAIN.LATITUDE_MIN)
    .max(DOMAIN.LATITUDE_MAX)
    .required()
    .messages({
      "any.required": "latitude is required",
      "number.base": "latitude must be a number",
      "number.min": "latitude must be between -90 and 90",
      "number.max": "latitude must be between -90 and 90",
    }),
  longitude: Joi.number()
    .min(DOMAIN.LONGITUDE_MIN)
    .max(DOMAIN.LONGITUDE_MAX)
    .required()
    .messages({
      "any.required": "longitude is required",
      "number.base": "longitude must be a number",
      "number.min": "longitude must be between -180 and 180",
      "number.max": "longitude must be between -180 and 180",
    }),
}).unknown(true); // Allow additional fields

// Only loadCompleted (final stage) accepts proof-of-loading attachments.
// startLoading is a GPS-only transition — no files.
const proofOfLoadingField = Joi.array().items(Joi.string()).optional().messages({
  "array.base": "proofOfLoading must be an array of file paths or URLs",
});

const startLoadingSchema = loadingStageSchema;

const loadCompletedSchema = loadingStageSchema.keys({
  proofOfLoading: proofOfLoadingField,
});

exports.goToLoadingPlace = loadingStageSchema;
exports.startLoading = startLoadingSchema;
exports.loadCompleted = loadCompletedSchema;
// Create and accept new request - driver finds a shipper request and accepts it directly
exports.createAndAcceptNewRequest = Joi.object({
  shipperRequestUniqueId: uuidSchema.required().messages({
    "any.required": "shipperRequestUniqueId is required",
    "string.guid": "shipperRequestUniqueId must be a valid UUID",
  }),
  shippingCostByDriver: Joi.number().min(0).required().messages({
    "any.required": "shippingCostByDriver is required",
    "number.min": "shippingCostByDriver must be at least 0",
  }),
  currentLocation: locationSchema,
}).unknown(true);
