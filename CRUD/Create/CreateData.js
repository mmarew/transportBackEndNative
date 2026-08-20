const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { getData } = require("../Read/ReadData");
const { transactionStorage } = require("../../Utils/TransactionContext");
const formatDateToReadable = require("../../Utils/FormatDateToReadable");
const {
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");
const { currentDate } = require("../../Utils/CurrentDate");
// Single source of truth for ShipperRequestBatch writes

// create afunction that can accept a table name and an array of values with coloumns names. it should return a promise and can insert any value to any table
const insertData = async ({ tableName, colAndVal, connection = null }) => {
  // Extract columns and values from the colAndVal object
  const columns = Object.keys(colAndVal);
  const values = Object.values(colAndVal);

  if (columns.length === 0 || values.length === 0) {
    throw new Error("Columns and values cannot be empty.");
  }

  // Build the SQL query dynamically
  const columnsString = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");

  const sqlQuery = `INSERT INTO ${tableName} (${columnsString}) VALUES (${placeholders})`;

    // Use context connection first, then provided connection, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result;
};

const createNewShipperRequest = async (
  body,
  userUniqueId,
  journeyStatusId = journeyStatusMap.waiting, // 1
  connection = null, // Optional: connection for transaction support
) => {
  const shippableItemName = body?.shippableItemName,
    shippableItemQtyInQuintal = body?.shippableItemQtyInQuintal,
    shippingDate = formatDateToReadable(body?.shippingDate),
    deliveryDate = formatDateToReadable(body?.deliveryDate),
    shippingCost = body?.shippingCost,
    shipperRequestBatchUniqueId = body?.shipperRequestBatchUniqueId,
    shipperRequestCreatedBy = body?.shipperRequestCreatedBy,
    shipperRequestCreatedByRoleId = body?.shipperRequestCreatedByRoleId;

  if (!body || !userUniqueId || !journeyStatusId) {
    throw new Error("Invalid input parameters to create shipper request");
  }

  const { vehicle, destination, originLocation } = body;

  if (!vehicle || !destination || !originLocation) {
    throw new Error("Invalid request body");
  }

  const { vehicleTypeUniqueId } = vehicle;

  if (!vehicleTypeUniqueId) {
    throw new Error("Invalid vehicle type");
  }

  // Validate vehicle type using transaction connection if provided (for consistency within transaction)
  const verifyVehicleType = await getData({
    tableName: "VehicleTypes",
    conditions: { vehicleTypeUniqueId },
    connection, // Pass connection for transaction support - validation now part of transaction
  });

  if (verifyVehicleType.length === 0) {
    throw new Error("Vehicle type not found");
  }

  const originLatitude = originLocation.latitude,
    originLongitude = originLocation.longitude,
    originPlace = originLocation.description;

  const destinationLatitude = destination.latitude || null,
    destinationLongitude = destination.longitude || null,
    destinationPlace = destination.description || null;

  const shipperRequestUniqueId = uuidv4();
  const requestPayload = {
    userUniqueId,

    shipperRequestUniqueId,
    shipperRequestCreatedBy,
    shipperRequestCreatedByRoleId,

    vehicleTypeUniqueId,
    originLatitude,
    originLongitude,
    originPlace,
    destinationLatitude,
    destinationLongitude,
    destinationPlace,
    shipperRequestCreatedAt: currentDate(),
    journeyStatusId, // Initial status: Waiting
    shippableItemName,
    shippableItemQtyInQuintal,
    shippingDate,
    deliveryDate,
    shippingCost,
    shipperRequestBatchUniqueId,
    // Receipt-based POD: copied from batch header at creation time. When false,
    // completeJourney auto-confirms with source='AUTO_NO_POD'. When true (default),
    // the driver must submit receipt photos or the shipper must submit formal POD.
    isPodRequired: body?.isPodRequired !== undefined ? body.isPodRequired : true,
    // Bidding mode: 'individual_target' (open to all drivers) or 'company_target'
    // Falls back to schema default ('individual_target') if not provided.
    ...(body?.requestMode && { requestMode: body.requestMode }),
    // The specific company this batch is targeting (only set when requestMode = 'company_target')
    ...(body?.targetCompanyUniqueId && {
      targetCompanyUniqueId: body.targetCompanyUniqueId,
    }),
    // Queue dispatch: the queue org this order is placed against (if any). When set,
    // create.service.js routes to handleQueueDispatch instead of distance-based matching.
    ...(body?.queueOrganizationUniqueId && {
      queueOrganizationUniqueId: body.queueOrganizationUniqueId,
    }),
  };

  // Insert the new request into the database
    const result = await insertData({
      tableName: "ShipperRequest",
      colAndVal: requestPayload,
      connection,
    });

    // NOTE: upsertBatch is intentionally NOT called here.
    // It must be called ONCE by the caller before spawning parallel requests,
    // so that concurrent Promise.all calls don't race to INSERT the same batchUniqueId.

    return {
      message: "success",
      data: [{ ...requestPayload, shipperRequestId: result.insertId }],
    };
};
const createDriverRequest = async (
  body,
  userUniqueId,
  journeyStatusId,
  connection = null,
) => {
  try {
    if (!body || !userUniqueId) {
      throw new Error("Invalid input parameters to create driver request");
    }

    // Use context connection first, then provided connection, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;

    const sqlToCheckActiveRequest = `
  SELECT * FROM DriverRequest 
  WHERE userUniqueId = ? 
  AND journeyStatusId IN (${activeJourneyStatuses.join(", ")}
  )`;

    const [existingRequest] = await queryExecutor.query(
      sqlToCheckActiveRequest,
      [userUniqueId],
    );

    if (existingRequest?.length > 0) {
      return { message: "success", data: existingRequest };
    }

    const { currentLocation } = body;
    if (
      !currentLocation ||
      !currentLocation.latitude ||
      !currentLocation.longitude
      //|| !currentLocation.description
    ) {
      throw new Error("Invalid current location data");
    }

    const originLatitude = currentLocation.latitude;
    const originLongitude = currentLocation.longitude;
    const originPlace = currentLocation.description;

    const driverRequestUniqueId = uuidv4();

    const requestPayload = {
      driverRequestUniqueId,
      userUniqueId,
      originLatitude,
      originLongitude,
      originPlace,
      driverRequestCreatedAt: currentDate(),
      journeyStatusId: journeyStatusId || journeyStatusMap.waiting, // Default to 'waiting' if not provided
    };

    const result = await insertData({
      tableName: "DriverRequest",
      colAndVal: requestPayload,
      connection, // Pass connection for transaction support
    });

    return {
      message: "success",
      data: [{ ...requestPayload, driverRequestId: result.insertId }],
    };
  } catch (error) {
    // DB-level guard: the unique index (userUniqueId, activeRequestGuard) makes a
    // second active request per driver IMPOSSIBLE. If two concurrent calls (e.g.
    // go-online + accept) race, one INSERT hits ER_DUP_ENTRY — return the existing
    // active request instead of failing, so the losing call simply sees the journey.
    if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) { // eslint-disable-line no-magic-numbers -- MySQL duplicate-key errno
      const queryExecutor = transactionStorage.getStore() || connection || pool;
      const [existingRequest] = await queryExecutor.query(
        `SELECT * FROM DriverRequest
         WHERE userUniqueId = ?
         AND journeyStatusId IN (${activeJourneyStatuses.join(", ")})`,
        [userUniqueId],
      );
      if (existingRequest?.length > 0) {
        return { message: "success", data: existingRequest };
      }
    }
    throw error;
  }
};

const createData = async ({ tableName, insertValues = {}, connection = null }) => {
  const result = await insertData({
    tableName,
    colAndVal: insertValues,
    connection,
  });
  return result;
};

module.exports = {
  createData,
  createDriverRequest,
  createNewShipperRequest,
  insertData,
};
