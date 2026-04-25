"use strict";

const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");

// ── Updatable columns (whitelist) ─────────────────────────────────────────────
// Only these fields may be changed via PATCH. The order does not matter.
const UPDATABLE_COLS = [
  "totalVehicles",
  "requestMode",
  "targetCompanyUniqueId",
  "vehicleTypeUniqueId",
  "originPlace",
  "destinationPlace",
  "shippableItemName",
  "shippableItemQtyInQuintal",
  "shippingDate",
  "deliveryDate",
  "shippingCost",
  "journeyStatusId",
];

// ── CREATE / UPSERT ──────────────────────────────────────────────────────────

/**
 * ### Single Source of Truth — Create or sync a batch header
 *
 * Called by `createNewPassengerRequest` every time a new individual request
 * is added to a batch.  Rules:
 *
 * - **First request in a batch** → INSERT the batch header row.
 * - **Subsequent requests in the same batch** → UPDATE only `totalVehicles`
 *   and `journeyStatusId` so the counter stays accurate.
 *
 * **Junior Note: Why not `ON DUPLICATE KEY UPDATE`?**
 * MySQL pre-increments `AUTO_INCREMENT` BEFORE checking for a duplicate key.
 * If a duplicate is found it rolls back the insert but keeps the incremented
 * counter, creating permanent gaps (e.g. 1, 5, 9…).  The SELECT-first pattern
 * below avoids this entirely: we only reach the INSERT branch when we are
 * certain the row does not yet exist.
 *
 * @param {Object} data - All batch metadata needed for the header row.
 */
exports.upsertBatch = async ({
  batchUniqueId,
  shipperUserUniqueId,
  vehicleTypeUniqueId,
  totalVehicles,
  requestMode,
  targetCompanyUniqueId,
  originPlace,
  destinationPlace,
  shippableItemName,
  shippableItemQtyInQuintal,
  shippingDate,
  deliveryDate,
  shippingCost,
  journeyStatusId,
}) => {
  // 1. Check existence first — avoids AUTO_INCREMENT wastage
  const [existing] = await db().query(
    `SELECT batchId FROM PassengerRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
    [batchUniqueId],
  );

  if (existing.length === 0) {
    // First request in this batch → create the header row
    await db().query(
      `INSERT INTO PassengerRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, targetCompanyUniqueId, originPlace, destinationPlace,
         shippableItemName, shippableItemQtyInQuintal, shippingDate, deliveryDate,
         shippingCost, journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchUniqueId,
        shipperUserUniqueId,
        vehicleTypeUniqueId,
        totalVehicles,
        requestMode,
        targetCompanyUniqueId,
        originPlace,
        destinationPlace,
        shippableItemName,
        shippableItemQtyInQuintal,
        shippingDate,
        deliveryDate,
        shippingCost,
        journeyStatusId,
        currentDate(),
      ],
    );
  } else {
    // Subsequent request in same batch → sync mutable counters only
    await db().query(
      `UPDATE PassengerRequestBatch
         SET totalVehicles = ?, journeyStatusId = ?, batchUpdatedAt = ?
       WHERE batchUniqueId = ?`,
      [totalVehicles, journeyStatusId, currentDate(), batchUniqueId],
    );
  }
};

// ── GET with filters + pagination ─────────────────────────────────────────────

/**
 * ### List PassengerRequestBatches
 *
 * Supports any combination of optional filters. Only the filters actually
 * sent in `query` are added to the WHERE clause — everything else is ignored.
 *
 * **Junior Note: "Only filter what was sent"**
 * We build the WHERE clause dynamically using an array of clauses and a
 * parallel params array.  Each `if (filters.xxx)` block appends both the
 * SQL fragment AND its binding value, keeping them perfectly in sync.
 *
 * @param {Object} filters - Validated query-string values.
 * @returns {Promise<Object>} Paginated list with `data` and `pagination`.
 */
exports.getBatches = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);

  const clauses = [];
  const params = [];

  // Soft-delete guard — skip deleted batches unless caller explicitly asks
  if (!filters.includeDeleted) {
    clauses.push("b.batchDeletedAt IS NULL");
  }

  if (filters.batchUniqueId) {
    clauses.push("b.batchUniqueId = ?");
    params.push(filters.batchUniqueId);
  }
  if (filters.shipperUserUniqueId) {
    clauses.push("b.shipperUserUniqueId = ?");
    params.push(filters.shipperUserUniqueId);
  }
  if (filters.vehicleTypeUniqueId) {
    clauses.push("b.vehicleTypeUniqueId = ?");
    params.push(filters.vehicleTypeUniqueId);
  }
  if (filters.requestMode) {
    clauses.push("b.requestMode = ?");
    params.push(filters.requestMode);
  }
  if (filters.targetCompanyUniqueId) {
    clauses.push("b.targetCompanyUniqueId = ?");
    params.push(filters.targetCompanyUniqueId);
  }
  if (filters.journeyStatusId) {
    clauses.push("b.journeyStatusId = ?");
    params.push(filters.journeyStatusId);
  }
  if (filters.journeyStatusName) {
    clauses.push("js.journeyStatusName = ?");
    params.push(filters.journeyStatusName);
  }
  // Partial text match for location filters
  if (filters.originPlace) {
    clauses.push("b.originPlace LIKE ?");
    params.push(`%${filters.originPlace}%`);
  }
  if (filters.destinationPlace) {
    clauses.push("b.destinationPlace LIKE ?");
    params.push(`%${filters.destinationPlace}%`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const baseSql = `
    SELECT
      b.*,
      u.fullName        AS shipperName,
      u.phoneNumber     AS shipperPhone,
      vt.vehicleTypeName,
      js.journeyStatusName,
      tc.companyName    AS targetCompanyName
    FROM PassengerRequestBatch b
    LEFT JOIN Users          u  ON b.shipperUserUniqueId   = u.userUniqueId
    LEFT JOIN VehicleTypes   vt ON b.vehicleTypeUniqueId   = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus  js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
    ${where}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM PassengerRequestBatch b
    LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
    ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY b.batchCreatedAt DESC`,
    countSql,
    params,
    page,
    limit,
    offset,
  );
};

// ── PATCH (partial update) ────────────────────────────────────────────────────


/**
 * ### Partial Update — "Update only what I give you"
 *
 * **Junior Note: Dynamic SET Clause**
 * Instead of a fixed `SET col1=?, col2=?, ...` that would overwrite every
 * field on every call, we build the SET clause from scratch using only the
 * keys present in `fields`.  The result:
 *   - Caller sends `{ shippingCost: 500 }`  → only `shippingCost` changes.
 *   - Caller sends `{ originPlace: "...", totalVehicles: 3 }` → only those two change.
 *   - Nothing else is touched.
 *
 * @param {string} batchUniqueId  - The batch to update (from URL params).
 * @param {Object} fields         - Validated body fields (at least 1 key).
 * @param {string} updatedBy      - userUniqueId of the actor.
 * @returns {Promise<Object>}
 */
exports.updateBatch = async (batchUniqueId, fields, updatedBy) => {
  // 1. Confirm it exists and is not deleted
  const batch = await findOne(
    "PassengerRequestBatch",
    { batchUniqueId },
    "Passenger request batch not found",
  );
  if (batch.batchDeletedAt)
  {throw new AppError("Batch has already been deleted", 400);}

  // 2. Build the SET clause from whitelisted keys only
  const setClauses = [];
  const setValues = [];

  for (const col of UPDATABLE_COLS) {
    if (Object.prototype.hasOwnProperty.call(fields, col)) {
      setClauses.push(`${col} = ?`);
      setValues.push(fields[col]);
    }
  }

  // Defensive guard (schema.min(1) should already prevent this)
  if (setClauses.length === 0)
  {throw new AppError("No valid fields supplied for update", 400);}

  // Always stamp the audit columns
  setClauses.push("batchUpdatedAt = ?");
  setValues.push(currentDate());

  // 3. Execute
  const [res] = await db().query(
    `UPDATE PassengerRequestBatch SET ${setClauses.join(", ")} WHERE batchUniqueId = ?`,
    [...setValues, batchUniqueId],
  );

  if (res.affectedRows === 0)
  {throw new AppError("Batch update failed", 500);}

  return { message: "success", data: { batchUniqueId, updated: fields } };
};

// ── Soft DELETE ───────────────────────────────────────────────────────────────

/**
 * Soft-delete a batch by stamping `batchDeletedAt`.
 *
 * @param {string} batchUniqueId
 * @param {string} deletedBy
 * @returns {Promise<Object>}
 */
exports.deleteBatch = async (batchUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE PassengerRequestBatch
     SET batchDeletedAt = ?
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL`,
    [currentDate(), batchUniqueId],
  );

  if (res.affectedRows === 0)
  {throw new AppError("Batch not found or already deleted", 404);}

  return { message: "success", data: "Batch deleted" };
};
