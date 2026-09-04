"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

/**
 * POST /api/queue/bidding/approve
 *
 * Open/close the bidding board for SPECIFIC orders (per-order control). The flag
 * ShipperRequest.isBiddingApproved (the sole bidding signal) is toggled on each
 * given order independently, so orders within one batch can diverge (e.g. some
 * hired via FIFO at status 3+, others opened to bidding). NOT tied to any
 * requestMode or journey status.
 *
 * @param {string[]} shipperRequestUniqueIds - the orders to open/close
 * @param {boolean} [approved=true] - set FALSE to revoke approval (hide again)
 */
exports.approveBidding = Joi.object({
  shipperRequestUniqueIds: Joi.array().items(uuidSchema).min(1).required(),
  approved: Joi.boolean().default(true).optional(),
});

/**
 * GET /api/queue/bidding/order/:shipperRequestUniqueId/bids
 *
 * Route path param identifying the bidding order.
 */
exports.getBidsParams = Joi.object({
  shipperRequestUniqueId: uuidSchema.required(),
});

/**
 * Pagination query for the bids listing endpoint.
 */
exports.getBidsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
}).unknown(true);
