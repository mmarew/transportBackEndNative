"use strict";

const AppError = require("../../Utils/AppError");
const { currentDate } = require("../../Utils/CurrentDate");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { createCanceledJourney } = require("../CanceledJourneys.service");
const { getData } = require("../../CRUD/Read/ReadData");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const { UPDATABLE_COLS, assertCompanyCancellationReason } = require("./batchHelper");

/**
 * ### List ShipperRequestBatches
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

  // Exact match / range filters for remaining batch columns
  if (filters.totalVehicles) {
    clauses.push("b.totalVehicles = ?");
    params.push(Number(filters.totalVehicles));
  }
  if (filters.shippableItemName) {
    clauses.push("b.shippableItemName LIKE ?");
    params.push(`%${filters.shippableItemName}%`);
  }

  // shippingDate range: ?shippingDateFrom=2026-01-01&shippingDateTo=2026-12-31
  if (filters.shippingDateFrom) {
    clauses.push("b.shippingDate >= ?");
    params.push(filters.shippingDateFrom);
  }
  if (filters.shippingDateTo) {
    clauses.push("b.shippingDate <= ?");
    params.push(filters.shippingDateTo);
  }

  // deliveryDate range: ?deliveryDateFrom=...&deliveryDateTo=...
  if (filters.deliveryDateFrom) {
    clauses.push("b.deliveryDate >= ?");
    params.push(filters.deliveryDateFrom);
  }
  if (filters.deliveryDateTo) {
    clauses.push("b.deliveryDate <= ?");
    params.push(filters.deliveryDateTo);
  }

  // shippingCost range: ?shippingCostMin=100&shippingCostMax=5000
  if (filters.shippingCostMin !== undefined) {
    clauses.push("b.shippingCost >= ?");
    params.push(Number(filters.shippingCostMin));
  }
  if (filters.shippingCostMax !== undefined) {
    clauses.push("b.shippingCost <= ?");
    params.push(Number(filters.shippingCostMax));
  }

  // batchCreatedAt range: ?createdFrom=2026-01-01&createdTo=2026-12-31
  if (filters.createdFrom) {
    clauses.push("b.batchCreatedAt >= ?");
    params.push(filters.createdFrom);
  }
  if (filters.createdTo) {
    clauses.push("b.batchCreatedAt <= ?");
    params.push(filters.createdTo);
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
    FROM ShipperRequestBatch b
    LEFT JOIN Users          u  ON b.shipperUserUniqueId   = u.userUniqueId
    LEFT JOIN VehicleTypes   vt ON b.vehicleTypeUniqueId   = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus  js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
    ${where}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ShipperRequestBatch b
    LEFT JOIN JourneyStatus    js ON b.journeyStatusId       = js.journeyStatusId
    LEFT JOIN TransportCompany tc ON b.targetCompanyUniqueId = tc.companyUniqueId
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
 * ### List all ShipperRequest slots for a batch with cancellability flag.
 *
 * Supports pagination (page / limit) and optional filter by cancellable status.
 * Each slot has a `cancellable` boolean so the frontend can show which rows
 * the shipper is allowed to cancel.
 *
 * Cancellable states (can be cancelled):
 *   1=waiting, 2=requested, 3=acceptedByDriver, 4=acceptedByShipper
 *
 * Non-cancellable states (already terminal or in-transit):
 *   5=journeyStarted, 6=journeyCompleted, 7=cancelledByShipper,
 *   9=cancelledByDriver, 10=cancelledByAdmin, 12=cancelledBySystem
 *
 * @param {string}  batchUniqueId
 * @param {Object}  filters
 * @param {boolean} filters.cancellable  - If true, returns only cancellable slots.
 * @param {number}  filters.page         - Page number (default 1).
 * @param {number}  filters.limit        - Page size (default 20, max 100).
 */
exports.getCancellableSlots = async (batchUniqueId, filters = {}) => {
  const { page, limit, offset } = paginate({ ...filters, defaultLimit: 20 });

  // Cancellable = waiting / requested / acceptedByDriver / acceptedByShipper
  const CANCELLABLE_STATUS_IDS = [
    journeyStatusMap.waiting, // 1
    journeyStatusMap.requested, // 2
    journeyStatusMap.acceptedByDriver, // 3
    journeyStatusMap.acceptedByShipper, // 4
  ];
  const cancellableIn = CANCELLABLE_STATUS_IDS.join(",");

  // ── Build dynamic WHERE filters ───────────────────────────────────────────
  const clauses = [
    "pr.shipperRequestBatchId = ?",
    "pr.shipperRequestDeletedAt IS NULL",
  ];
  const params = [batchUniqueId];

  // Convenience shortcut: ?cancellable=true → only statuses 1-4
  const onlyCancellable =
    filters.cancellable === true || filters.cancellable === "true";
  if (onlyCancellable) {
    clauses.push(`pr.journeyStatusId IN (${cancellableIn})`);
  }

  // Filter by exact status ID — single integer OR array of integers.
  if (
    filters.journeyStatusId !== undefined &&
    filters.journeyStatusId !== null
  ) {
    const ids = Array.isArray(filters.journeyStatusId)
      ? filters.journeyStatusId.map(Number)
      : [Number(filters.journeyStatusId)];
    if (ids.length === 1) {
      clauses.push("pr.journeyStatusId = ?");
      params.push(ids[0]);
    } else {
      clauses.push(`pr.journeyStatusId IN (${ids.map(() => "?").join(", ")})`);
      params.push(...ids);
    }
  }

  // Filter by status name — single string OR array of strings.
  // Normalise to an array so the SQL always uses IN (?) consistently.
  if (filters.journeyStatusName) {
    const names = Array.isArray(filters.journeyStatusName)
      ? filters.journeyStatusName
      : [filters.journeyStatusName];
    if (names.length === 1) {
      clauses.push("js.journeyStatusName = ?");
      params.push(names[0]);
    } else {
      clauses.push(
        `js.journeyStatusName IN (${names.map(() => "?").join(", ")})`,
      );
      params.push(...names);
    }
  }

  // ── slotState filter ────────────────────────────────────────────────────────
  // Maps directly to the breakdown categories in verifyShipperStatus.company:
  //
  //   notAssigned       — status=4, no active assignment, never had a driver
  //   needsReassignment — status=4, no active assignment, previous driver cancelled
  //   assigned          — active assignment with assignmentStatus='assigned'
  //   driverConfirmed   — active assignment confirmed or heading to loading
  //
  // Use ?slotState=notAssigned to get the list behind the notAssigned counter.
  if (filters.slotState) {
    switch (filters.slotState) {
    case "notAssigned":
      // Free slot: status=acceptedByShipper, no active assignment, no cancelled history
      clauses.push(
        `pr.journeyStatusId = ?
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus NOT IN (
                 'rejected_by_driver','cancelled_by_company',
                 'cancelled_by_shipper','cancelled_by_driver'
               )
           )
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba2
             WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba2.assignmentDeletedAt IS NULL
               AND cba2.assignmentStatus = 'cancelled_by_driver'
           )`,
      );
      params.push(journeyStatusMap.acceptedByShipper);
      break;

    case "needsReassignment":
      // Free slot: status=acceptedByShipper, no active assignment, prev driver cancelled
      clauses.push(
        `pr.journeyStatusId = ?
           AND NOT EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus NOT IN (
                 'rejected_by_driver','cancelled_by_company',
                 'cancelled_by_shipper','cancelled_by_driver'
               )
           )
           AND EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba2
             WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba2.assignmentDeletedAt IS NULL
               AND cba2.assignmentStatus = 'cancelled_by_driver'
           )`,
      );
      params.push(journeyStatusMap.acceptedByShipper);
      break;

    case "assigned":
      // Driver notified, waiting for confirmation
      clauses.push(
        `EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus = 'assigned'
           )`,
      );
      break;

    case "driverConfirmed":
      // Driver confirmed or heading to loading point
      clauses.push(
        `EXISTS (
             SELECT 1 FROM CompanyBidVehicleAssignment cba
             WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
               AND cba.assignmentDeletedAt IS NULL
               AND cba.assignmentStatus IN ('confirmed_by_driver','going_to_loading')
           )`,
      );
      break;

    default:
      break;
    }
  }

  const where = `WHERE ${clauses.join(" AND ")}`;

  const dataSql = `
    SELECT
      pr.shipperRequestUniqueId,
      pr.shipperRequestId,
      pr.journeyStatusId,
      js.journeyStatusName,
      pr.originPlace,
      pr.destinationPlace,
      pr.shipperRequestCreatedAt,
      CASE WHEN pr.journeyStatusId IN (${cancellableIn}) THEN 1 ELSE 0 END AS cancellable
    FROM ShipperRequest pr
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    ${where}
    ORDER BY pr.shipperRequestId ASC
    LIMIT ? OFFSET ?`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM ShipperRequest pr
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    ${where}`;

  const [[rows], [[countRow]]] = await Promise.all([
    db().query(dataSql, [...params, limit, offset]),
    db().query(countSql, params),
  ]);

  const total = Number(countRow?.total) || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    message: "success",
    data: rows,
    pagination: { page, limit, total, totalPages },
  };
};

// ── PARTIAL CANCEL ────────────────────────────────────────────────────────────
