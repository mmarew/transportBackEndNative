/**
 * Route-corridor job search — DEPRECATED, kept as a thin delegation.
 *
 * The corridor search is no longer a separate implementation: it is route mode
 * inside getAllActiveRequests (Services/ShipperRequest/readActive.service.js),
 * which every caller should now use —
 *
 *   GET /api/shippingRequest/getAllActiveRequests?startLat=&startLng=&endLat=&endLng=
 *
 * which is the same request this endpoint accepted, plus every feed filter
 * (requestMode, shippableItemName, sortBy, ...). Two behaviour changes worth
 * knowing: only pickups that are ON the corridor and not behind the driver are
 * returned (it used to keep any job with either end near the road, which surfaced
 * the "Addis Ababa → Dire Dawa" load to a driver standing in Dire Dawa — its
 * drop-off matched, but serving it meant an 860 km round trip to the pickup), and
 * the corridor is matched with bounding boxes grown by radiusKm instead of
 * measuring every candidate against every sampled corridor point. Rows also gain
 * `pickupKmAlongRoute`. Answers are the same for a road-shaped route and cost per
 * request is flat, but a box grown by the radius can include a few jobs off the
 * road in the corners.
 *
 * This file exists so /api/shippingRequest/getJobsAlongRoute keeps answering for
 * driver-app builds that have not been updated yet. Delete it — with its route
 * registration, controller, validation schema and export — once those builds are
 * retired; nothing else needs it.
 */
const { getAllActiveRequests } = require("./readActive.service");

/**
 * @param {Object} filters - Same filters getAllActiveRequests accepts; the four
 *   route points are what put it in route mode.
 * @returns {Promise<Object>} The route-mode response of getAllActiveRequests.
 */
const getJobsAlongRoute = async (filters = {}) => getAllActiveRequests(filters);

module.exports = { getJobsAlongRoute };
