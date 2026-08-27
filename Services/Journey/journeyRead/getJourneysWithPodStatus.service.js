"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const AppError = require("../../../Utils/AppError");
const { usersRoles } = require("../../../Utils/ListOfSeedData");
const { PAGINATION } = require("../../../Utils/Constants");

// POD statuses supported by the `podStatus` filter. `NONE` means the journey's
// delivery has no delivery confirmation at all ("not proofed"). Because
// DeliveryConfirmations.journeyUniqueId is UNIQUE, a LEFT JOIN can only ever
// produce at most one confirmation row per journey — i.e. "only one pod".
const POD_STATUSES = ["NONE", "PENDING", "CONFIRMED", "DISPUTED"];

// Fetch deliveries (journeys) with their single proof-of-delivery status.
//
// Callers: driver (sees only deliveries where they are the driver), shipper
// (their own), company admin/dispatcher (deliveries assigned to their company
// via targetCompanyUniqueId), and admin (everything).
//
// Filters: journeyStatusId, podStatus (NONE/PENDING/CONFIRMED/DISPUTED),
// fromDate/toDate, plus optional ownerUserUniqueId for admin views.
// Paginated, filter-based.
const getJourneysWithPodStatus = async ({
  journeyStatusId,
  podStatus,
  ownerUserUniqueId,
  viewerUserUniqueId,
  roleId,
  fromDate,
  toDate,
  page = 1,
  limit = 10
} = {}) => {
  const executor = transactionStorage.getStore() || pool;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_PAGE_SIZE), PAGINATION.MAX_PAGE_SIZE);
  const offset = (safePage - 1) * safeLimit;

  const whereParts = [];
  const params = [];

  if (journeyStatusId) {
    whereParts.push(`j.journeyStatusId = ?`);
    params.push(journeyStatusId);
  }

  // Pod status filter — NONE is the "not proofed yet" case (no confirmation row).
  if (podStatus) {
    if (!POD_STATUSES.includes(podStatus)) {
      throw new AppError(
        `Invalid podStatus. Must be one of: ${POD_STATUSES.join(", ")}`,
        AppError.BAD_REQUEST
      );
    }
    if (podStatus === "NONE") {
      whereParts.push(`dc.deliveryConfirmationUniqueId IS NULL`);
    } else {
      whereParts.push(`dc.deliveryConfirmationStatus = ?`);
      params.push(podStatus);
    }
  }

  // Date range filters
  if (fromDate && toDate) {
    whereParts.push(`DATE(j.journeyStartedAt) >= DATE(?) AND DATE(j.journeyCompletedAt) <= DATE(?)`);
    params.push(fromDate, toDate);
  } else if (fromDate) {
    whereParts.push(`DATE(j.journeyStartedAt) >= DATE(?)`);
    params.push(fromDate);
  } else if (toDate) {
    whereParts.push(`DATE(j.journeyCompletedAt) <= DATE(?)`);
    params.push(toDate);
  }

  // Visibility scoping based on the viewer's role.
  const roleIdNum = Number(roleId);
  const adminRoleIds = [
    Number(usersRoles.adminRoleId),
    Number(usersRoles.supperAdminRoleId)
  ];
  if (adminRoleIds.includes(roleIdNum)) {
    // Admin may optionally narrow down to a specific owner (driver or shipper).
    if (ownerUserUniqueId) {
      whereParts.push(`(dr.userUniqueId = ? OR sr.userUniqueId = ?)`);
      params.push(ownerUserUniqueId, ownerUserUniqueId);
    }
  } else if (roleIdNum === Number(usersRoles.driverRoleId)) {
    // Driver: userUniqueId=self → their own deliveries.
    whereParts.push(`dr.userUniqueId = ?`);
    params.push(viewerUserUniqueId);
  } else if (roleIdNum === Number(usersRoles.shipperRoleId)) {
    whereParts.push(`sr.userUniqueId = ?`);
    params.push(viewerUserUniqueId);
  } else if (
    roleIdNum === Number(usersRoles.companyAdminRoleId) ||
    roleIdNum === Number(usersRoles.dispatcherRoleId)
  ) {
    // Company: deliveries targeted at the company the viewer belongs to.
    const companyUniqueId = await resolveCompanyForUser(executor, viewerUserUniqueId);
    if (companyUniqueId) {
      whereParts.push(`sr.targetCompanyUniqueId = ?`);
      params.push(companyUniqueId);
    } else {
      whereParts.push(`1 = 0`);
    }
  } else {
    // Unknown role — nothing to show.
    whereParts.push(`1 = 0`);
  }

  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  const selectSql = `
    SELECT
      j.journeyUniqueId,
      j.journeyStartedAt,
      j.journeyCompletedAt,
      j.fare,
      j.journeyStatusId,
      js.journeyStatusName,
      sr.shipperRequestId,
      b.batchId AS batchId,
      sr.userUniqueId AS shipperUserUniqueId,
      su.fullName AS shipperFullName,
      su.phoneNumber AS shipperPhone,
      sr.shippableItemName,
      sr.shippableItemQtyInQuintal,
      sr.originPlace,
      sr.destinationPlace,
      sr.shippingDate,
      sr.deliveryDate,
      dr.userUniqueId AS driverUserUniqueId,
      du.fullName AS driverFullName,
      du.phoneNumber AS driverPhone,
      dc.deliveryConfirmationUniqueId,
      dc.deliveryConfirmationStatus,
      dc.confirmedByUserUniqueId,
      dc.deliveryConfirmationConfirmedAt
    FROM Journey j
    INNER JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
    INNER JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
    INNER JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
    INNER JOIN Users su ON su.userUniqueId = sr.userUniqueId
    INNER JOIN Users du ON du.userUniqueId = dr.userUniqueId
    INNER JOIN JourneyStatus js ON js.journeyStatusId = j.journeyStatusId
    LEFT JOIN ShipperRequestBatch b ON b.batchUniqueId = sr.shipperRequestBatchUniqueId
    LEFT JOIN DeliveryConfirmations dc
      ON dc.journeyUniqueId = j.journeyUniqueId
     AND dc.deliveryConfirmationDeletedAt IS NULL
    ${whereClause}
    ORDER BY j.journeyId DESC
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, safeLimit, offset];
  const [rows] = await executor.query(selectSql, dataParams);

  const countSql = `
    SELECT COUNT(*) AS total
    FROM Journey j
    INNER JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
    INNER JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
    INNER JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
    INNER JOIN Users su ON su.userUniqueId = sr.userUniqueId
    INNER JOIN Users du ON du.userUniqueId = dr.userUniqueId
    INNER JOIN JourneyStatus js ON js.journeyStatusId = j.journeyStatusId
    LEFT JOIN ShipperRequestBatch b ON b.batchUniqueId = sr.shipperRequestBatchUniqueId
    LEFT JOIN DeliveryConfirmations dc
      ON dc.journeyUniqueId = j.journeyUniqueId
     AND dc.deliveryConfirmationDeletedAt IS NULL
    ${whereClause}
  `;
  const [countRows] = await executor.query(countSql, params);
  const totalCount = countRows[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / safeLimit);

  const data = rows.map((item) => ({
    journey: {
      journeyUniqueId: item.journeyUniqueId,
      journeyStatusId: item.journeyStatusId,
      journeyStatusName: item.journeyStatusName,
      journeyStartedAt: item.journeyStartedAt,
      journeyCompletedAt: item.journeyCompletedAt,
      fare: item.fare
    },
    shipper: {
      shipperRequestId: item.shipperRequestId,
      batchId: item.batchId,
      userUniqueId: item.shipperUserUniqueId,
      fullName: item.shipperFullName,
      phoneNumber: item.shipperPhone,
      shippableItemName: item.shippableItemName,
      shippableItemQtyInQuintal: item.shippableItemQtyInQuintal,
      originPlace: item.originPlace,
      destinationPlace: item.destinationPlace,
      shippingDate: item.shippingDate,
      deliveryDate: item.deliveryDate
    },
    driver: {
      userUniqueId: item.driverUserUniqueId,
      fullName: item.driverFullName,
      phoneNumber: item.driverPhone
    },
    deliveryConfirmation: item.deliveryConfirmationUniqueId
      ? {
          deliveryConfirmationUniqueId: item.deliveryConfirmationUniqueId,
          deliveryConfirmationStatus: item.deliveryConfirmationStatus,
          confirmedByUserUniqueId: item.confirmedByUserUniqueId,
          confirmedAt: item.deliveryConfirmationConfirmedAt
        }
      : null,
    podStatus: item.deliveryConfirmationUniqueId
      ? item.deliveryConfirmationStatus
      : "NONE",
    hasPod: Boolean(item.deliveryConfirmationUniqueId)
  }));

  return {
    message: "Deliveries fetched successfully",
    data,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalItems: totalCount,
      limit: safeLimit
    }
  };
};

// Resolve the company the viewer belongs to (first active membership).
const resolveCompanyForUser = async (executor, userUniqueId) => {
  const [rows] = await executor.query(
    `SELECT companyUniqueId
     FROM CompanyMembership
     WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL
     ORDER BY membershipId ASC
     LIMIT 1`,
    [userUniqueId]
  );
  return rows[0]?.companyUniqueId || null;
};

module.exports = {
  getJourneysWithPodStatus
};