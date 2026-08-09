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
  // Destructure the relevant data from the shipperRequest
  const {
    originLatitude,
    originLongitude,
    vehicleTypeUniqueId,
    shipperRequestId,
  } = shipperRequest;

  const lat = Number.parseFloat(originLatitude);
  const lng = Number.parseFloat(originLongitude);

  // Bounding-box pre-filter (fast index scan) then exact Haversine check (≤ MAX_RADIUS_KM)
  // Haversine formula gives the great-circle distance in km between two lat/lng points.
  const sqlQuery = `
      SELECT
         *,
         Users.userUniqueId AS driverUserUniqueId,
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
      ORDER BY distanceKm ASC, DriverRequest.driverRequestId ASC
      LIMIT 10
    `;

  const values = [
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
      // push 5 drivers only
      // eslint-disable-next-line no-magic-numbers -- max drivers to offer per request
      if (listOfDrivers.length >= 5) {
        break;
      }
      // push driver to list of drivers
      listOfDrivers?.push(driver);
    }
  }
  // Return the list of nearby drivers
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
    WHERE
      ShipperRequest.vehicleTypeUniqueId = ?
      AND ShipperRequest.originLatitude  BETWEEN ? AND ?
      AND ShipperRequest.originLongitude BETWEEN ? AND ?
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