"use strict";

const Joi = require("joi");
const { PAGINATION, DOMAIN } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

/**
 * GET /api/queue/driverDirectory
 *
 * Search driver+vehicle pairs so staff can manually check in a driver who has
 * never queued at this location. Scoped to the caller's queue organization —
 * a queue org admin or dispatcher only ever sees the directory for orgs they
 * hold an ACTIVE membership in.
 *
 * At least one of phone / name / vehicleTypeUniqueId is required; without one
 * the query would page the entire driver table.
 */
exports.driverDirectoryQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  phone: Joi.string()
    .max(DOMAIN.MAX_PHONE_LENGTH)
    .optional()
    .allow("", null),
  name: Joi.string().max(DOMAIN.MAX_NAME_LENGTH).optional().allow("", null),
  vehicleTypeUniqueId: uuidSchema.optional().allow("", null),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE)
    .optional(),
})
  .unknown(true)
  .or("phone", "name", "vehicleTypeUniqueId");