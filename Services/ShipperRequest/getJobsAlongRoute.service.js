const axios = require("axios");
const Config = require("../../Utils/Config");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const { decodePolyline } = require("../../Utils/polyline");
const { pool } = require("../../Middleware/Database.config");
const { PAGINATION } = require("../../Utils/Constants");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

const EARTH_RADIUS_M = 6371000;
const METERS_PER_KM = 1000;

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

const sampleCorridor = (polylineStr, sampleKm = 25) => {
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

const bboxFromPoints = (points, paddingKm = 25) => {
  if (points.length === 0) {
    return null;
  }
  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p[0] < minLng) minLng = p[0];
    if (p[0] > maxLng) maxLng = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }
  const padDeg = paddingKm / 111 + 0.01; // eslint-disable-line no-magic-numbers
  return {
    minLng: minLng - padDeg,
    maxLng: maxLng + padDeg,
    minLat: minLat - padDeg,
    maxLat: maxLat + padDeg,
  };
};

const minDistanceToCorridor = (point, corridorPoints) => {
  if (!corridorPoints || corridorPoints.length === 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < corridorPoints.length; i += 1) {
    const d = distanceMeters(point, corridorPoints[i]);
    if (d < min) {
      min = d;
      if (min < 100) break; // close enough
    }
  }
  return min;
};

const getJobsAlongRoute = async (filters = {}) => {
  const {
    startLat,
    startLng,
    endLat,
    endLng,
    vehicleTypeUniqueId,
    // Cargo is free text on ShipperRequest.shippableItemName — there is no
    // cargoTypeId column, so this is a substring match, not a FK lookup.
    shippableItemName,
    radiusKm = Config.ROUTE_CORRIDOR_RADIUS_KM || 25,
    sampleKm = Config.ROUTE_CORRIDOR_SAMPLE_KM || 25,
    requestMode,
    page = 1,
    limit = PAGINATION.DEFAULT_PAGE_SIZE,
  } = filters;

  const radiusM = Number(radiusKm) * METERS_PER_KM;

  const coordsStr = `${Number(startLng)},${Number(startLat)};${Number(endLng)},${Number(endLat)}`;
  const osrmUrl = `${Config.OSRM_BASE_URL}/route/v1/driving/${coordsStr}?overview=full&geometries=polyline`;
  let polylineStr;
  try {
    const response = await axios.get(osrmUrl, { timeout: Config.OSRM_TIMEOUT_MS || 8000 });
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

  // Sample the corridor independently of the match radius: sampling every
  // `radiusKm` would leave gaps whenever radius is large, and oversample
  // whenever it is small.
  const corridorPoints = sampleCorridor(polylineStr, Number(sampleKm));
  const bbox = bboxFromPoints(corridorPoints, Number(radiusKm));
  if (!bbox) {
    throw new AppError("Route geometry is empty", AppError.BAD_REQUEST);
  }

  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];
  let where = `
    WHERE sr.journeyStatusId IN (?)
      AND sr.shipperRequestDeletedAt IS NULL
      AND (srb.queueOrganizationUniqueId IS NULL OR sr.isBiddingApproved = TRUE)
      AND (
           (sr.originLatitude  BETWEEN ? AND ? AND sr.originLongitude BETWEEN ? AND ?)
        OR (sr.destinationLatitude BETWEEN ? AND ? AND sr.destinationLongitude BETWEEN ? AND ?)
      )
  `;
  const values = [
    activeStatusIds,
    bbox.minLat,
    bbox.maxLat,
    bbox.minLng,
    bbox.maxLng,
    bbox.minLat,
    bbox.maxLat,
    bbox.minLng,
    bbox.maxLng,
  ];

  // Optional: without it the driver sees every vehicle type along the corridor.
  if (vehicleTypeUniqueId) {
    where += " AND sr.vehicleTypeUniqueId = ?";
    values.push(vehicleTypeUniqueId);
  }

  if (shippableItemName) {
    where += " AND sr.shippableItemName LIKE ?";
    values.push(`%${shippableItemName}%`);
  }
  if (requestMode) {
    where += " AND sr.requestMode = ?";
    values.push(requestMode);
  }

  const baseSelect = `
    SELECT sr.*,
           u.fullName,
           u.phoneNumber,
           u.email,
           u.userCreatedAt AS userCreatedAt,
           vt.vehicleTypeName,
           js.journeyStatusName,
           srb.batchId,
           srb.queueOrganizationUniqueId AS batchQueueOrganizationUniqueId
    FROM ShipperRequest sr
    JOIN Users u ON u.userUniqueId = sr.userUniqueId
    LEFT JOIN VehicleTypes vt ON vt.vehicleTypeUniqueId = sr.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON js.journeyStatusId = sr.journeyStatusId
    LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
    ${where}
    ORDER BY sr.shipperRequestCreatedAt DESC
  `;

  let candidates = [];
  try {
    const [rows] = await pool.query(baseSelect, values);
    candidates = rows;
  } catch (error) {
    logger.error("Error fetching route corridor candidates", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      "Unable to retrieve jobs along route",
      AppError.INTERNAL_SERVER_ERROR,
    );
  }

  // Measure each candidate against the corridor, keep those within radius, and
  // rank nearest-first. Distances are carried in a wrapper rather than written
  // onto the row, so nothing internal can leak into the response.
  const ranked = candidates
    .map((row) => {
      const origin = [Number(row.originLongitude), Number(row.originLatitude)];
      const destination = [
        Number(row.destinationLongitude),
        Number(row.destinationLatitude),
      ];
      const originM = minDistanceToCorridor(origin, corridorPoints);
      const destinationM = minDistanceToCorridor(destination, corridorPoints);
      return {
        row,
        originM,
        destinationM,
        nearestM: Math.min(originM, destinationM),
      };
    })
    .filter((c) => c.nearestM <= radiusM)
    .sort((a, b) => {
      if (a.nearestM !== b.nearestM) return a.nearestM - b.nearestM;
      // Tie-break: newest first, matching the active-jobs feed's default order.
      return (
        new Date(b.row.shipperRequestCreatedAt).getTime() -
        new Date(a.row.shipperRequestCreatedAt).getTime()
      );
    })
    .map((c) => ({
      ...c.row,
      distanceToCorridorKm: c.nearestM / METERS_PER_KM,
      originOnCorridor: c.originM <= radiusM,
      destinationOnCorridor: c.destinationM <= radiusM,
    }));

  const totalItems = ranked.length;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_PAGE_SIZE);
  const startIdx = (p - 1) * l;
  const paged = ranked.slice(startIdx, startIdx + l);

  return {
    message: "Jobs along route fetched successfully",
    data: paged,
    pagination: {
      currentPage: p,
      totalPages: Math.ceil(totalItems / l) || 0,
      totalItems,
      limit: l,
    },
    filters: {
      applied: {
        startLat,
        startLng,
        endLat,
        endLng,
        vehicleTypeUniqueId,
        shippableItemName: shippableItemName || null,
        requestMode: requestMode || null,
        radiusKm: Number(radiusKm),
        sampleKm: Number(sampleKm),
      },
    },
    corridor: {
      pointCount: corridorPoints.length,
      sampleKm: Number(sampleKm),
      radiusKm: Number(radiusKm),
    },
  };
};

module.exports = { getJobsAlongRoute };
