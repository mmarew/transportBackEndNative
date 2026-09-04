const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { VerifyIfShipperRequestWasNotRejected } = require("../../Utils/RejectedRequests");

// Maximum matching radius in kilometres for driver ↔ shipper proximity
const MAX_RADIUS_KM = 10;
// Bounding-box pre-filter in degrees (1° lat ≈ 111 km → 10 km ≈ 0.09°).
// Slightly enlarged to avoid clipping true great-circle matches near the edge.
const DEGREE_BUFFER = MAX_RADIUS_KM / 111 + 0.01; // eslint-disable-line no-magic-numbers -- km-per-degree and buffer padding // ≈ 0.10°

const findNearbyDrivers = async ({ shipperRequest }) => {
  // Queue orders are dispatched exclusively via queue FIFO (handleQueueDispatch)
  // — never by distance — EXCEPT when an individual order's bidding board is open
  // (isBiddingApproved=TRUE on the ShipperRequest row), which makes it distance-
  // matchable. The per-order flag is the SOLE bidding signal; the order's
  // journeyStatusId is NOT a factor.
  if (shipperRequest?.queueOrganizationUniqueId) {
    if (!shipperRequest?.isBiddingApproved) {
      return [];
    }
    // Approved bidding-board order — fall through to distance matching below.
  }
  // Destructure the relevant data from the shipperRequest
  const {
    originLatitude,
    originLongitude,
    vehicleTypeUniqueId,
    shipperRequestId,
  } = shipperRequest;

  const lat = Number.parseFloat(originLatitude);
  const lng = Number.parseFloat(originLongitude);

  // For a bidding-board order (has a queue org), prioritize QUEUED drivers first,
  // then non-queued, both nearest-first, capped at 5 (max, not exact). isQueued is
  // TRUE when the driver has an active DriverQueue entry today for the order's org.
  const isBiddingOrder = Boolean(shipperRequest?.queueOrganizationUniqueId);
  const queueDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, same as DriverQueue.service.js

  // Bounding-box pre-filter (fast index scan) then exact Haversine check (≤ MAX_RADIUS_KM)
  // Haversine formula gives the great-circle distance in km between two lat/lng points.
  const sqlQuery = `
      SELECT
         *,
         Users.userUniqueId AS driverUserUniqueId,
         ${
           isBiddingOrder
             ? `EXISTS (
                  SELECT 1 FROM DriverQueue dq
                  JOIN VehicleDriver qvd ON qvd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
                 WHERE qvd.driverUserUniqueId = Users.userUniqueId
                   AND dq.queueOrganizationUniqueId = ?
                   AND dq.queueDate = ?
                   AND dq.status IN ('waiting', 'requested', 'notagreed')
                   AND dq.queueDeletedAt IS NULL
                ) AS isQueued,
                `
             : ""
         }
         (
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS(DriverRequest.originLatitude - ?) / 2), 2) +
             COS(RADIANS(?)) * COS(RADIANS(DriverRequest.originLatitude)) *
             POWER(SIN(RADIANS(DriverRequest.originLongitude - ?) / 2), 2)
           ))
         ) AS distanceKm
      FROM DriverRequest
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      JOIN VehicleDriver vd ON vd.driverUserUniqueId = Users.userUniqueId
      JOIN Vehicle ON vd.vehicleUniqueId = Vehicle.vehicleUniqueId
      JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      WHERE
        DriverRequest.originLatitude  BETWEEN ? AND ?
        AND DriverRequest.originLongitude BETWEEN ? AND ?
        AND DriverRequest.journeyStatusId = 1 -- Status 'Waiting'
        AND vd.assignmentStatus = 'active'
        AND Vehicle.vehicleTypeUniqueId = ?
      HAVING distanceKm <= ?
      ORDER BY ${
        isBiddingOrder
          ? "isQueued DESC, distanceKm ASC, DriverRequest.driverRequestId ASC"
          : "distanceKm ASC, DriverRequest.driverRequestId ASC"
      }
      LIMIT 20
    `;

  const values = [
    // isQueued lookup (only for bidding orders)
    ...(isBiddingOrder
      ? [shipperRequest.queueOrganizationUniqueId, queueDate]
      : []),
    // Haversine inputs
    lat,
    lat,
    lng,
    // Bounding-box pre-filter
    lat - DEGREE_BUFFER,
    lat + DEGREE_BUFFER,
    lng - DEGREE_BUFFER,
    lng + DEGREE_BUFFER,
    vehicleTypeUniqueId,
    MAX_RADIUS_KM,
  ];

  // Execute the query
  const queryExecutor = transactionStorage.getStore() || pool;
  const [drivers] = await queryExecutor.query(sqlQuery, values);
  const listOfDrivers = [];
  for (const driver of drivers) {
    const { message } = await VerifyIfShipperRequestWasNotRejected({
      shipperRequestId,
      shipperRequestBatchUniqueId: shipperRequest?.shipperRequestBatchUniqueId,
      driverUserUniqueId: driver?.userUniqueId,
    });
    if (message === "success") {
      // Cap of 5 per order — a maximum, not exact: fewer offered if fewer eligible.
      // eslint-disable-next-line no-magic-numbers -- max drivers to offer per request
      if (listOfDrivers.length >= 5) {
        break;
      }
      // push driver to list of drivers
      listOfDrivers?.push(driver);
    }
  }
  // Return the list of nearby drivers (queued-first when bidding order)
  return listOfDrivers;
};

const findNearbyShippers = async ({
  originLatitude,
  originLongitude,
  vehicleTypeUniqueId,
}) => {
  const lat = parseFloat(originLatitude);
  const lng = parseFloat(originLongitude);

  // Use Haversine inside a raw query so we can apply the exact radius check.
  // A bounding-box pre-filter on indexed lat/lng columns keeps the scan fast.
  const sqlQuery = `
    SELECT
      Users.*,
      ShipperRequest.*,
      srb.queueOrganizationUniqueId AS queueOrganizationUniqueId,
      (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ShipperRequest.originLatitude - ?) / 2), 2) +
          COS(RADIANS(?)) * COS(RADIANS(ShipperRequest.originLatitude)) *
          POWER(SIN(RADIANS(ShipperRequest.originLongitude - ?) / 2), 2)
        ))
      ) AS distanceKm
    FROM Users
    JOIN ShipperRequest
      ON ShipperRequest.userUniqueId = Users.userUniqueId
      AND (ShipperRequest.requestMode IS NULL OR ShipperRequest.requestMode != 'company_target')
      AND ShipperRequest.shipperRequestDeletedAt IS NULL
    -- queueOrganizationUniqueId is canonical on the batch (srb) and inherited via
    -- join. isBiddingApproved is PER-ORDER on ShipperRequest (already in ShipperRequest.*).
    -- FIFO queue orders are kept out of distance matching UNLESS a given order's
    -- bidding board is open.
    LEFT JOIN ShipperRequestBatch srb
      ON srb.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
    WHERE
      ShipperRequest.vehicleTypeUniqueId = ?
      AND ShipperRequest.originLatitude  BETWEEN ? AND ?
      AND ShipperRequest.originLongitude BETWEEN ? AND ?
      -- Queue orders stay out of distance-matching UNLESS that order's bidding board
      -- is open (ShipperRequest.isBiddingApproved=TRUE — the sole bidding signal;
      -- no status check). Per-order, so orders within one batch can diverge.
      AND (
        srb.queueOrganizationUniqueId IS NULL
        OR ShipperRequest.isBiddingApproved = TRUE
      )
      -- Ordinary lifecycle statuses only (no bidding status exists).
      AND ShipperRequest.journeyStatusId IN (?, ?, ?)
    HAVING distanceKm <= ?
    ORDER BY distanceKm ASC, ShipperRequest.shipperRequestId ASC
  `;

  const values = [
    // Haversine inputs
    lat,
    lat,
    lng,
    // Exact filter conditions
    vehicleTypeUniqueId,
    lat - DEGREE_BUFFER,
    lat + DEGREE_BUFFER,
    lng - DEGREE_BUFFER,
    lng + DEGREE_BUFFER,
    // lifecycle statuses (waiting/requested/acceptedByDriver) — no bidding status
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    MAX_RADIUS_KM,
  ];

  const queryExecutor = transactionStorage.getStore() || pool;
  const [nearByShippers] = await queryExecutor.query(sqlQuery, values);
  return nearByShippers;
};


module.exports = {
  findNearbyDrivers,
  findNearbyShippers
};