const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN } = require("../Utils/Constants");

exports.createJourneyRoutePoint = Joi.object({
  // Controller/service expect journeyDecisionUniqueId, not journeyUniqueId
  journeyDecisionUniqueId: uuidSchema.required(),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).required(),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).required(),
  userUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .optional(),
  sequenceOrder: Joi.number().integer().optional(),
}).unknown(true);

exports.updateJourneyRoutePoint = Joi.object({
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional(),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional(),
}).unknown(true);

exports.journeyRoutePointParams = Joi.object({
  pointId: Joi.alternatives().try(uuidSchema, Joi.number()).required(),
}).unknown(true);

exports.getJourneyRoutePointsQuery = Joi.object({
  // Controller reads req.query.journeyDecisionUniqueId
  journeyDecisionUniqueId: uuidSchema.required(),
}).unknown(true);
