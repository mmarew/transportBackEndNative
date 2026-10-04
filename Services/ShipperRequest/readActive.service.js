"use strict";

const axios = require("axios");
const Config = require("../../Utils/Config");

const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { decodePolyline } = require("../../Utils/polyline");

// Mean kilometres per degree of latitude. Longitude degrees shrink as cosine of
// the latitude, which is why boxes are widened differently per axis — a square in
// degrees is not a square in kilometres anywhere.
const KM_PER_DEGREE_LAT = 111.32;

const EARTH_RADIUS_M = 6371000;

// Corridor tiling. One box for the whole route would be far too loose: the
// Bahir Dar → Djibouti leg runs ~1150 km on a diagonal, so a single box grown by
// 25 km reaches corners 193 km off the road and drags in Dessie, Harar and Jijiga.
// Splitting the sampled route into tiles hugs the road instead — measured against
// real Ethiopian cities, tiling drops those false positives from 4 to 0 while
// still catching everything genuinely on the way. The cost stays flat: it is
// still a pure SQL BETWEEN test, just a union of them.
const CORRIDOR_POINTS_PER_TILE = 4;
const CORRIDOR_MAX_TILES = 16;

// ── Route-corridor helpers ────────────────────────────────────────────────────

/**
 * Great-circle distance in metres. Only used to walk the polyline while sampling
 * it, never to score candidate jobs — that is what keeps route search flat cost.
 */
const distanceMeters = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Thins the OSRM polyline down to roughly one point every `sampleKm`.
 * 11.8k points for Bahir Dar → Djibouti collapses to ~47 here, and the boxes of
 * the thin line are the same boxes the full line would have produced.
 */
const sampleCorridor = (polylineStr, sampleKm) => {
  const points = decodePolyline(polylineStr);
  if (points.length === 0) return [];
  const stepM = Math.max(1000, sampleKm * 1000);
  const sampled = [points[0]];
  let accM = 0;
  for (let i = 1; i < points.length; i += 1) {
    accM += distanceMeters(points[i - 1], points[i]);
    if (accM >= stepM || i === points.length - 1) {
      sampled.push(points[i]);
      accM = 0;
    }
  }
  return sampled;
};

/**
 * Bounding box of a set of corridor points, grown by `radiusKm` on every side.
 *
 * The conversion is the whole point: 1 degree of latitude is ~111.32 km, so a
 * 25 km margin is ~0.2246 degrees — NOT 0.001 (that is 0.11 km, ~9x too tight,
 * and it would silently drop legitimate roadside jobs). Longitude is divided by
 * cos(latitude) because a degree of longitude is only that wide at the equator,
 * clamped near the poles where cos collapses and the box would swallow the planet.
 */
const boxAround = (points, radiusKm) => {
  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];
  let sumLat = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [lng, lat] = points[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLat += lat;
  }
  const avgLatRad = (sumLat / points.length) * (Math.PI / 180);
  const latMargin = radiusKm / KM_PER_DEGREE_LAT;
  const lngMargin = latMargin / Math.max(0.05, Math.cos(avgLatRad));

  return {
    minLat: Math.max(-90, minLat - latMargin),
    maxLat: Math.min(90, maxLat + latMargin),
    minLng: Math.max(-180, minLng - lngMargin),
    maxLng: Math.min(180, maxLng + lngMargin),
  };
};

/**
 * Splits the sampled corridor into consecutive chunks and returns one padded box
 * per chunk. A short hop collapses to a single tile; the 1150 km Ethiopian run
 * comes out at the 16-tile cap, i.e. at most 128 bound parameters in the WHERE
 * clause regardless of how far the driver is going.
 */
const tileCorridor = (points, radiusKm) => {
  if (!points || points.length === 0) return [];

  const tileCount = Math.min(
    CORRIDOR_MAX_TILES,
    Math.max(1, Math.ceil(points.length / CORRIDOR_POINTS_PER_TILE)),
  );
  const chunkSize = Math.ceil(points.length / tileCount);

  const boxes = [];
  for (let i = 0; i < tileCount; i += 1) {
    const chunk = points.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length > 0) boxes.push(boxAround(chunk, radiusKm));
  }
  return boxes;
};

/**
 * Asks OSRM for the drivable route between the two points and reduces it to
 * {boxes, pointCount, radiusKm, sampleKm}.
 *
 * OSRM speaks lon,lat (not lat,lon) — the mobile apps already call it for route
 * drawing, so a pair swapped here fails on land rather than at sea.
 */
const resolveRouteCorridor = async ({
  startLat,
  startLng,
  endLat,
  endLng,
  radiusKm,
  sampleKm,
}) => {
  const effectiveRadiusKm =
    Number(radiusKm) || Config.ROUTE_CORRIDOR_RADIUS_KM || 25;
  const effectiveSampleKm =
    Number(sampleKm) || Config.ROUTE_CORRIDOR_SAMPLE_KM || 25;

  const coordsStr = `${startLng},${startLat};${endLng},${endLat}`;
  const osrmUrl = `${Config.OSRM_BASE_URL}/route/v1/driving/${coordsStr}?overview=full&geometries=polyline`;

  let polylineStr;
  try {
    const response = await axios.get(osrmUrl, {
      timeout: Config.OSRM_TIMEOUT_MS || 8000,
    });
    if (response.data?.code !== "Ok" || !response.data?.routes?.[0]?.geometry) {
      throw new Error("OSRM route not found");
    }
    polylineStr = response.data.routes[0].geometry;
  } catch (error) {
    logger.error("Error fetching route from OSRM", { error: error.message });
    throw new AppError(
      "Unable to compute route for the provided locations",
      AppError.BAD_REQUEST,
    );
  }

  const corridorPoints = sampleCorridor(polylineStr, effectiveSampleKm);
  const boxes = tileCorridor(corridorPoints, effectiveRadiusKm);
  if (boxes.length === 0) {
    throw new AppError("Route geometry is empty", AppError.BAD_REQUEST);
  }

  // The full polyline plus the running distance to each point. Thinning it is fine
  // for building boxes but not for measuring progress along the road, so keep the
  // original geometry around for that.
  const trackPoints = decodePolyline(polylineStr);
  const cumulativeKm = [0];
  for (let i = 1; i < trackPoints.length; i += 1) {
    cumulativeKm.push(
      cumulativeKm[i - 1] +
        distanceMeters(trackPoints[i - 1], trackPoints[i]) / 1000,
    );
  }
  const track = { points: trackPoints, cumulativeKm };

  return {
    boxes,
    track,
    startLat,
    startLng,
    pointCount: corridorPoints.length,
    radiusKm: effectiveRadiusKm,
    sampleKm: effectiveSampleKm,
  };
};

/**
 * How far along the route a point sits, in km from the start.
 *
 * This is the missing half of "jobs along my route". The SQL corridor only asks
 * *is this near the road*; it cannot say *is it ahead of me*. Without that, a
 * driver standing in Dire Dawa bound for Harar is shown the Addis Ababa → Dire
 * Dawa load, because that job's drop-off is the road they are standing on — 0.5 km
 * away, and so the nearest result in the list. It is 860 km in the wrong
 * direction: the pickup is behind them.
 *
 * Projects onto the FULL decoded polyline (not the sampled one) so the distance
 * along the road is real road distance rather than straight lines between
 * thinned points. Cost is O(points) per candidate — ~12k segment tests for
 * Bahir Dar → Djibouti — which is why this runs only on the rows the corridor
 * query already returned, never on the table.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{points: Array<[number, number]>, cumulativeKm: number[]}} track
 * @returns {number|null} km from the route start, or null if unprojectable
 */
const progressAlongRouteKm = (lat, lng, track) => {
  if (!track || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { points, cumulativeKm } = track;
  if (points.length === 0) return null;
  if (points.length === 1) return 0;

  let best = Number.POSITIVE_INFINITY;
  let bestKm = 0;

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const refLat = (a[1] + b[1]) / 2;
    // Equirectangular projection around the segment: accurate to well under a
    // metre over a few kilometres, and far cheaper than spherical trigonometry.
    const toRad = (d) => (d * Math.PI) / 180;
    const x = (lng - a[0]) * toRad(Math.cos(toRad(refLat)));
    const y = (lat - a[1]) * toRad(1);
    const dx = (b[0] - a[0]) * toRad(Math.cos(toRad(refLat)));
    const dy = (b[1] - a[1]) * toRad(1);
    const lenSq = dx * dx + dy * dy;

    let t = lenSq === 0 ? 0 : (x * dx + y * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const px = x - t * dx;
    const py = y - t * dy;
    const offsetM = Math.sqrt(px * px + py * py) * EARTH_RADIUS_M;
    if (offsetM < best) {
      best = offsetM;
      bestKm = cumulativeKm[i - 1] + t * (cumulativeKm[i] - cumulativeKm[i - 1]);
    }
  }

  return bestKm;
};

/**
 * Whether a coordinate falls inside any corridor tile. Box comparison only — no
 * trigonometry — so this stays cheap enough to run per row.
 */
const insideAnyBox = (lat, lng, boxes) =>
  boxes.some(
    (box) =>
      lat >= box.minLat &&
      lat <= box.maxLat &&
      lng >= box.minLng &&
      lng <= box.maxLng,
  );

/**
 * Keeps only jobs a driver travelling start → end can actually go and collect.
 *
 * Two conditions, both required:
 *
 * 1. The PICKUP is on the corridor. The SQL pass is deliberately over-inclusive —
 *    it keeps a row when *either* end is near the road — but a job whose pickup is
 *    800 km in the desert is not a job this driver can serve, whatever its drop-off
 *    is doing. Without this check such a pickup projects onto the nearest end of the
 *    route and reads as "109 km ahead", which is worse than useless: it looks
 *    answerable and is not.
 *
 * 2. The PICKUP is not behind the driver. Slack is `behindKm` — a loaded heavy
 *    truck needs road time to turn around, so a pickup 25 km back up the road is
 *    still reachable and one 26 km back is not.
 *
 * The drop-off is deliberately NOT the filter. A job that drops off where the
 * driver is standing matches the corridor beautifully and is useless: serving it
 * means driving to its pickup first, which is the thing condition 1 rules out.
 *
 * Rows come back with `pickupKmAlongRoute` so the app can say "37 km further on"
 * instead of making the driver do the arithmetic, and with `behindByKm` on the few
 * that needed the slack, because "just behind you" deserves a different label than
 * "ahead".
 */
const keepReachablePickups = (rows, { boxes, track, driverKm, behindKm }) => {
  const reachable = [];

  for (const row of rows) {
    const originLat = Number(row.originLatitude);
    const originLng = Number(row.originLongitude);
    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !insideAnyBox(originLat, originLng, boxes)
    ) {
      continue; // no usable coordinates, or the pickup is nowhere near the road
    }

    const pickupKm = progressAlongRouteKm(originLat, originLng, track);
    if (pickupKm === null) continue;

    const behindByKm = driverKm - pickupKm;
    if (behindByKm > behindKm) continue;

    reachable.push({
      ...row,
      pickupKmAlongRoute: Number(pickupKm.toFixed(1)),
      ...(behindByKm > 0 ? { behindByKm: Number(behindByKm.toFixed(1)) } : {}),
    });
  }

  return reachable;
};

/**
 * One SQL fragment + its bound values: "this job has an end inside the corridor".
 * Emitted once per tile and OR-ed together, for the pickup and again for the
 * drop-off, so the whole corridor is a single indexable predicate.
 *
 * The outer parentheses are load-bearing: this fragment is concatenated into a
 * larger `... AND <here> AND <other filter>` chain, and AND binds tighter than OR
 * in SQL. Without them a multi-tile route silently becomes
 * `(everything AND tile1) OR (tile2 AND everythingElse)` — tile1 matches would
 * escape every other filter, so a shippableItemName or requestMode filter would
 * quietly do nothing for most of the route.
 */
const corridorPredicate = (boxes) => {
  const clauses = [];
  const values = [];
  for (const box of boxes) {
    clauses.push(`(
        (sr.originLatitude BETWEEN ? AND ? AND sr.originLongitude BETWEEN ? AND ?)
     OR (sr.destinationLatitude BETWEEN ? AND ? AND sr.destinationLongitude BETWEEN ? AND ?)
    )`);
    values.push(
      box.minLat,
      box.maxLat,
      box.minLng,
      box.maxLng,
      box.minLat,
      box.maxLat,
      box.minLng,
      box.maxLng,
    );
  }
  return { clause: `(${clauses.join(" OR ")})`, values };
};

/**
 * Tags each matched row with which end of the trip sits on the corridor.
 * Box comparisons only — no trigonometry — so the app can render "pickup is on
 * your way" vs "drop-off is on your way".
 */
const tagCorridorMatches = (rows, boxes) => {
  return rows.map((row) => {
    const originInside = insideAnyBox(
      Number(row.originLatitude),
      Number(row.originLongitude),
      boxes,
    );
    const destinationInside = insideAnyBox(
      Number(row.destinationLatitude),
      Number(row.destinationLongitude),
      boxes,
    );
    const matchedBy =
      originInside && destinationInside
        ? "both"
        : originInside
          ? "origin"
          : "destination";
    return { ...row, matchedBy };
  });
};

// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations

/**
 * Creates a new shipper request
 *
 * This function consolidates three creation scenarios:
 * 1. **Shipper self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for shipper) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=shipper, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (shipper/admin): Returns verifyShipperStatus result with status counts
 *   (Shipper/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Shipper's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=shipper, 2=driver, 3=admin)
 *   - shipperRequestBatchUniqueId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For shipper/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If shipper/admin scenario: Returns verifyShipperStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */

/**
 * Gets a shipper request by shipper request ID
 * @param {number} shipperRequestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response with request data
 */

/**
 * Updates a shipper request by ID
 * @param {number} requestId - Shipper request ID
 * @param {Object} updates - Update values
 * @returns {Promise<Object>} Success or error response
 */

/**
 * Get All Active Requests — ONLINE JOB NEWS FEED (drivers), with an optional
 * route-corridor mode for "what can I pick up on my way?".
 *
 * The driver-facing "news feed" of currently open jobs. Wherever the driver
 * is (GeoIP/location-independent), this endpoint streams every active shipper
 * request they could pick up, so drivers can scan and grab work.
 *
 * Two modes, chosen by the caller — same URL, same filters:
 *
 * 1) FEED mode (no start/end coordinates) — the original behaviour: every open
 *    job, sorted nearest-first when the driver's position is known.
 *
 * 2) ROUTE mode (startLat/startLng/endLat/endLng all present) — the driver says
 *    where they are and where they are headed. OSRM resolves the drivable route
 *    between the two points, the route is sampled into a corridor, and only jobs
 *    whose pickup OR drop-off falls inside that corridor come back. A driver
 *    running Bahir Dar → Djibouti therefore also sees the Debretabor and Woledeya
 *    loads that sit on the road ahead, not just the ones in Djibouti itself.
 *
 * What is included in both modes:
 * - All non-queue jobs in active statuses: waiting (1), requested (2), acceptedByDriver (3).
 * - Queue-backed jobs that were deliberately placed on the OPEN BIDDING BOARD
 *   (ShipperRequest.isBiddingApproved = TRUE). Queue orgs opt individual orders
 *   into bid this way; they are distance-matched and driver-grabbable, just like
 *   ordinary online jobs.
 *
 * What is excluded:
 * - FIFO-only queue orders (queueOrganizationUniqueId set AND isBiddingApproved
 *   FALSE/NULL). Those flow ONLY through the queue offer → accept pipeline and
 *   must never be grabbed manually outside the queue system.
 *
 * How the corridor is matched (and why it is cheap):
 * - The OSRM polyline is sampled every `sampleKm` and split into tiles, each
 *   grown by `radiusKm` into a box. Matching is then a union of plain SQL BETWEEN
 *   tests on the coordinates — nothing is measured row-by-row in JavaScript, so
 *   the work per request stays flat no matter how many jobs come back or how long
 *   the route is (Bahir Dar → Djibouti is ~1150 km and decodes to ~11.8k points,
 *   which thin down to 47 samples across at most 16 tiles).
 * - Tiling rather than one box is what keeps the results honest. A single box
 *   grown by 25 km around that same diagonal leg reaches corners 193 km off the
 *   road and pulls in Dessie, Harar and Jijiga; tiled, those disappear while
 *   Debretabor, Adama and Dire Dawa — all genuinely on the way — still match.
 * - The trade-off that remains: a tile grown by the radius is a superset of its
 *   stretch of road, so a few jobs in the corners of a tile can slip in. For a job
 *   search that is the right way round — a missed load costs a driver a trip, a
 *   spurious one costs a glance.
 *
 * Preserved ordering/context:
 * - For drivers, the controller resolves their most recent known location and
 *   passes driverLatitude/driverLongitude so rows are sorted nearest-first
 *   (distanceKm added to each row). In feed mode the list is never geographically
 *   filtered — distance is a SORTING hint only.
 * - An explicit sortBy/sortOrder always wins, in both modes.
 * - Each returned row carries its bidding context: isBiddingApproved and
 *   batchQueueOrganizationUniqueId (null for ordinary non-queue jobs), so the
 *   driver app can label "open bid-board job" vs "regular job". Route mode also
 *   tags `matchedBy` (origin / destination / both) so the app can say which end
 *   of the trip is on the way.
 *
 * @param {Object} filters - Filtering options
 * @param {string} filters.userUniqueId - Filter by shipper user ID
 * @param {string} filters.email - Filter by shipper email (partial match)
 * @param {string} filters.phoneNumber - Filter by shipper phone (partial match)
 * @param {string} filters.fullName - Filter by shipper name (partial match)
 * @param {string} filters.vehicleTypeUniqueId - Filter by vehicle type
 * @param {number} filters.journeyStatusId - Filter by specific journey status
 * @param {string} filters.shippableItemName - Filter by item name (partial match)
 * @param {string} filters.originPlace - Filter by origin location (partial match)
 * @param {string} filters.destinationPlace - Filter by destination location (partial match)
 * @param {string} filters.requestMode - Filter by "individual_target" / "company_target"
 * @param {string} filters.startDate - Filter requests from this date
 * @param {string} filters.endDate - Filter requests until this date
 * @param {string} filters.shippingDate - Filter by shipping date
 * @param {string} filters.deliveryDate - Filter by delivery date
 * @param {number} [filters.startLat] - Route mode: driver's current latitude (with startLng)
 * @param {number} [filters.startLng] - Route mode: driver's current longitude (with startLat)
 * @param {number} [filters.endLat] - Route mode: intended destination latitude (with endLng)
 * @param {number} [filters.endLng] - Route mode: intended destination longitude (with endLat)
 * @param {number} [filters.radiusKm] - Route mode: corridor half-width, default 25
 * @param {number} [filters.sampleKm] - Route mode: corridor sampling step, default 25
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 2)
 * @param {string} [filters.sortBy] - Field to sort by (default: "shipperRequestCreatedAt")
 * @param {string} filters.sortOrder - Sort direction "ASC" or "DESC" (default: "DESC")
 * @param {number} [filters.driverLatitude] - Driver's last known latitude (sorting only)
 * @param {number} [filters.driverLongitude] - Driver's last known longitude (sorting only)
 * @returns {Promise<Object>} Response with the active-jobs data, pagination, and filters
 * @throws {AppError} 400 when the route cannot be resolved or is degenerate
 */
const getAllActiveRequests = async (filters = {}) => {
  const {
    // User filters
    userUniqueId,
    email,
    phoneNumber,
    fullName,
    // Request filters
    vehicleTypeUniqueId,
    journeyStatusId,
    shippableItemName,
    requestMode,
    // Location filters
    originPlace,
    destinationPlace,
    // Driver proximity (optional): when provided the list is sorted by distance
    driverLatitude,
    driverLongitude,
    // Route-corridor search (optional): all four together switch to route mode
    startLat,
    startLng,
    endLat,
    endLng,
    radiusKm,
    sampleKm,
    // How far behind the driver a pickup may still be and count as reachable
    behindKm,
    // Date filters
    startDate,
    endDate,
    shippingDate,
    deliveryDate,
    // Pagination
    page = 1,
    limit = 2,
    // Sorting — left undefined when the caller did not ask, because "not asked"
    // and "asked for the default" are different answers in route mode.
    sortBy,
    sortOrder,
  } = filters;

  const effectiveSortBy = sortBy || "shipperRequestCreatedAt";
  const effectiveSortOrder = String(sortOrder || "DESC").toUpperCase();

  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  const driverLat = Number.parseFloat(driverLatitude);
  const driverLng = Number.parseFloat(driverLongitude);
  const hasDriverPosition =
    Number.isFinite(driverLat) && Number.isFinite(driverLng);

  // ── Mode selection ─────────────────────────────────────────────────────────
  // Route mode is opt-in: four coordinates in, corridor search out. Anything less
  // than four is a mistake the Joi schema already rejects, and anything more is
  // ignored here rather than throwing so a direct service caller degrades to feed
  // mode instead of 500-ing.
  const routePoints = [startLat, startLng, endLat, endLng].map(Number);
  const isRouteMode = routePoints.every(Number.isFinite);

  let corridor = null;
  let effectiveBehindKm =
    Number(behindKm) || Config.ROUTE_CORRIDOR_BEHIND_KM || 25;
  if (isRouteMode) {
    const [fromLat, fromLng, toLat, toLng] = routePoints;
    if (fromLat === toLat && fromLng === toLng) {
      throw new AppError(
        "Route search start point and end point must be different places.",
        AppError.BAD_REQUEST,
      );
    }
    corridor = await resolveRouteCorridor({
      startLat: fromLat,
      startLng: fromLng,
      endLat: toLat,
      endLng: toLng,
      radiusKm,
      sampleKm,
    });
  } else {
    effectiveBehindKm = null;
  }

  // ── Where "nearest" is measured from ────────────────────────────────────────
  // Both modes rank by straight-line distance from a single reference point, and
  // that point has to mean something:
  //   - driver known → where the driver is standing right now. Best answer.
  //   - route mode, driver unknown → the route start, i.e. where the search began.
  //     Falling back to "newest first" here would bury the first load on the road
  //     under jobs the driver would reach hours later.
  //   - neither → no reference point, so no distanceKm and plain createdAt DESC.
  const distanceOriginLat = hasDriverPosition
    ? driverLat
    : corridor && corridor.startLat;
  const distanceOriginLng = hasDriverPosition
    ? driverLng
    : corridor && corridor.startLng;
  const hasDistanceOrigin =
    Number.isFinite(distanceOriginLat) && Number.isFinite(distanceOriginLng);
  const distanceFrom = hasDriverPosition
    ? "driver"
    : hasDistanceOrigin
      ? "routeStart"
      : null;

  // Great-circle km from the reference point to a given pair of columns.
  const haversineKm = (latColumn, lngColumn) => `
    (6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(${latColumn} - ${distanceOriginLat}) / 2), 2) +
      COS(RADIANS(${distanceOriginLat})) * COS(RADIANS(${latColumn})) *
      POWER(SIN(RADIANS(${lngColumn} - ${distanceOriginLng}) / 2), 2)
    )))`;

  // Which end of the trip is measured matters, and the two modes answer
  // differently on purpose:
  //   - Feed mode keeps its original contract: distance to the job's ORIGIN. Apps
  //     already label rows with that number.
  //   - Route mode takes the nearer end, because in a corridor search the end that
  //     is on the road is the one the driver meets first. Measuring only the origin
  //     would push a Debretabor → Semera load to the bottom of the list for a driver
  //     standing in Debretabor, purely because its origin is 700 km up the road.
  const distanceSelect = !hasDistanceOrigin
    ? ""
    : corridor
      ? `,
      LEAST(
        ${haversineKm("sr.originLatitude", "sr.originLongitude")},
        ${haversineKm("sr.destinationLatitude", "sr.destinationLongitude")}
      ) AS distanceKm`
      : `,
      ${haversineKm("sr.originLatitude", "sr.originLongitude")} AS distanceKm`;

  // Base query
  let baseQuery = `
    SELECT
      sr.*,
      u.fullName,
      u.phoneNumber,
      u.email,
      u.userCreatedAt as userCreatedAt,
      vt.vehicleTypeName,
      js.journeyStatusName,
      srb.batchId,
      srb.queueOrganizationUniqueId AS batchQueueOrganizationUniqueId
      ${distanceSelect}
    FROM ShipperRequest sr
    JOIN Users u ON u.userUniqueId = sr.userUniqueId
    LEFT JOIN VehicleTypes vt ON sr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON sr.journeyStatusId = js.journeyStatusId
    LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
    WHERE sr.journeyStatusId IN (?)
      -- Queue orders are dispatched ONLY by queue FIFO (offer → accept) and
      -- must never be listed as manually-acceptable online jobs — EXCEPT
      -- bid-board orders (ShipperRequest.isBiddingApproved = TRUE), which are
      -- deliberately open to driver bidding / distance matching.
      -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join.
      AND (srb.queueOrganizationUniqueId IS NULL OR sr.isBiddingApproved = TRUE)
  `;
  let whereConditions = [];
  let values = [activeStatusIds];

  // Route mode: soft-deleted orders are gone, and only jobs whose pickup OR
  // drop-off falls inside a corridor tile come back. The tiles replace the old
  // "measure every candidate against every corridor point" pass — same answer
  // along the road, flat cost per request.
  if (corridor) {
    const { clause, values: corridorValues } = corridorPredicate(corridor.boxes);
    whereConditions.push("sr.shipperRequestDeletedAt IS NULL");
    whereConditions.push(clause);
    values.push(...corridorValues);
  }

  // User filters
  if (userUniqueId) {
    whereConditions.push("sr.userUniqueId = ?");
    values.push(userUniqueId);
  }
  if (email) {
    whereConditions.push("u.email LIKE ?");
    values.push(`%${email}%`);
  }
  if (phoneNumber) {
    whereConditions.push("u.phoneNumber LIKE ?");
    values.push(`%${phoneNumber}%`);
  }
  if (fullName) {
    whereConditions.push("u.fullName LIKE ?");
    values.push(`%${fullName}%`);
  }

  // Request filters
  if (vehicleTypeUniqueId) {
    whereConditions.push("sr.vehicleTypeUniqueId = ?");
    values.push(vehicleTypeUniqueId);
  }
  if (journeyStatusId) {
    whereConditions.push("sr.journeyStatusId = ?");
    values.push(journeyStatusId);
  }
  if (shippableItemName) {
    whereConditions.push("sr.shippableItemName LIKE ?");
    values.push(`%${shippableItemName}%`);
  }
  // requestMode is a real column, so unlike the other optional filters this one
  // narrows for real. Omitting it returns both modes.
  if (requestMode) {
    whereConditions.push("sr.requestMode = ?");
    values.push(requestMode);
  }

  // Location filters
  if (originPlace) {
    whereConditions.push("sr.originPlace LIKE ?");
    values.push(`%${originPlace}%`);
  }
  if (destinationPlace) {
    whereConditions.push("sr.destinationPlace LIKE ?");
    values.push(`%${destinationPlace}%`);
  }

  // Date filters
  if (startDate && endDate) {
    whereConditions.push("sr.shipperRequestCreatedAt BETWEEN ? AND ?");
    values.push(startDate, endDate);
  } else if (startDate) {
    whereConditions.push("sr.shipperRequestCreatedAt >= ?");
    values.push(startDate);
  } else if (endDate) {
    whereConditions.push("sr.shipperRequestCreatedAt <= ?");
    values.push(endDate);
  }
  if (shippingDate) {
    whereConditions.push("DATE(sr.shippingDate) = ?");
    values.push(shippingDate);
  }
  if (deliveryDate) {
    whereConditions.push("DATE(sr.deliveryDate) = ?");
    values.push(deliveryDate);
  }

  // Add WHERE conditions to base query
  if (whereConditions.length > 0) {
    baseQuery += " AND " + whereConditions.join(" AND ");
  }

  // Count query for total records
  const countQuery = `SELECT COUNT(*) as totalCount FROM (${baseQuery}) as countTable`;

// ── Ordering ───────────────────────────────────────────────────────────────
  // An explicit sortBy always wins — a caller who asks for newest-first gets
  // newest-first. Otherwise distance wins, because on a corridor dead kilometres
  // are paid-for kilometres: the load 30 km ahead beats the one 300 km ahead, and
  // the further along the route the driver is, the further along the list they
  // want it. Feed mode keeps its original shape (distance first, requested sort
  // second) so existing callers see no change at all.
  const explicitSort = Boolean(sortBy);
  let orderBy;
  if (explicitSort || !hasDistanceOrigin) {
    orderBy = ` ORDER BY sr.${effectiveSortBy} ${effectiveSortOrder}`;
  } else {
    orderBy = " ORDER BY distanceKm ASC, sr.shipperRequestCreatedAt DESC";
  }

  const offset = (page - 1) * limit;

  // ── Route mode paginates after the direction filter ────────────────────────
  // The SQL corridor is deliberately over-inclusive ("near this road"), and the
  // reachability pass then drops the jobs that are behind the driver. Those are
  // different sets, so slicing the page in SQL would hand back short or empty
  // pages and a totalItems that counts rows the client never received. Route mode
  // therefore takes the whole (bounded) corridor result, filters it, and slices in
  // memory. Feed mode has no such second pass and keeps plain SQL pagination.
  const ROUTE_MATCH_CAP = 2000;
  const paginatesInSql = !corridor;

  if (paginatesInSql) {
    baseQuery += `${orderBy} LIMIT ? OFFSET ?`;
    values.push(parseInt(limit), parseInt(offset));
  } else {
    baseQuery += `${orderBy} LIMIT ${ROUTE_MATCH_CAP}`;
  }

  try {
    const [results] = await pool.query(baseQuery, values);

    let rows = results;
    let totalCount = results.length;

    if (corridor) {
      // Where the driver is on their own route. A known GPS position projects
      // onto the road; without one they are standing at the start, 0 km in.
      const driverKm = hasDriverPosition
        ? (progressAlongRouteKm(driverLat, driverLng, corridor.track) ?? 0)
        : 0;

      rows = keepReachablePickups(results, {
        boxes: corridor.boxes,
        track: corridor.track,
        driverKm,
        behindKm: effectiveBehindKm,
      });
      totalCount = rows.length;

      const pageRows = rows.slice(offset, offset + parseInt(limit));
      const totalPages = Math.ceil(totalCount / limit);

      const response = {
        message: "Jobs along route fetched successfully",
        mode: "route",
        distanceFrom,
        data: tagCorridorMatches(pageRows, corridor.boxes),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalCount,
          limit: parseInt(limit),
        },
        filters: {
          applied: filters,
          activeStatusIds,
        },
        corridor: {
          pointCount: corridor.pointCount,
          tileCount: corridor.boxes.length,
          sampleKm: corridor.sampleKm,
          radiusKm: corridor.radiusKm,
          routeLengthKm: Number(corridor.track.cumulativeKm.at(-1).toFixed(1)),
          driverKmAlongRoute: Number(driverKm.toFixed(1)),
          behindKm: effectiveBehindKm,
          direction: "pickupAhead",
          ...(totalCount >= ROUTE_MATCH_CAP
            ? { truncated: true, matchCap: ROUTE_MATCH_CAP }
            : {}),
        },
      };

      return response;
    }

    // Feed mode still needs its count, and now that LIMIT/OFFSET are bound
    // separately we can count with the same values.
    const [countResults] = await pool.query(countQuery, values);
    totalCount = countResults[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Metadata is cheap and load-bearing for clients: `mode` says which search
    // ran, `distanceFrom` says what distanceKm was measured from (so the app can
    // label "12 km away" honestly), and pointCount distinguishes a 1-sample short
    // hop from a 47-sample 1150 km run.
    const response = {
      message: "Active shipper requests fetched successfully",
      mode: "feed",
      distanceFrom,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalCount,
        limit: parseInt(limit),
      },
      filters: {
        applied: whereConditions.length > 0 ? filters : {},
        activeStatusIds,
      },
    };

    return response;
  } catch (error) {
    logger.error("Error in getAllActiveRequests", {
      error: error.message,
      stack: error.stack,
      mode: corridor ? "route" : "feed",
    });
    return {
      status: "error",
      error: "Unable to retrieve active ride requests",
      details: Config.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};

/**
 * Fetches a single ShipperRequest by its UUID.
 *
 * This is the dedicated, reusable service function for looking up a shipper
 * request by unique ID. Used by CompanyAssignment.service.js and any other
 * service that needs to resolve a shipperRequestUniqueId → row without
 * duplicating raw SQL.
 *
 * @param {string} shipperRequestUniqueId  - UUID of the request
 * @param {string} [shipperRequestBatchUniqueId] - Optional: also validates batch membership
 * @returns {Promise<Object>}  The matched row or null if not found
 * @throws {AppError} 404 if not found, 400 if batchId provided but does not match
 */

/**
 * Fetches a single ShipperRequest by its UUID.
 *
 * This is the dedicated, reusable service function for looking up a shipper
 * request by unique ID. Used by CompanyAssignment.service.js and any other
 * service that needs to resolve a shipperRequestUniqueId → row without
 * duplicating raw SQL.
 *
 * @param {string} shipperRequestUniqueId  - UUID of the request
 * @param {string} [shipperRequestBatchUniqueId] - Optional: also validates batch membership
 * @returns {Promise<Object>}  The matched row or null if not found
 * @throws {AppError} 404 if not found, 400 if batchId provided but does not match
 */

module.exports = {
  getAllActiveRequests,
};
