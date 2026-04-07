"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const logger = require("../Utils/logger");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");

/**
 * Submits a bid for a passenger request batch.
 * Ensures full-batch bid, company approval, and no duplicate bids.
 *
 * @param {Object} data - Bid submission data
 * @param {string} data.passengerRequestBatchId - Batch ID to bid on
 * @param {string} data.companyUniqueId - Company submitting the bid
 * @param {string} data.bidSubmittedByUserUniqueId - User submitting the bid
 * @param {number} data.numberOfVehiclesOffered - Number of vehicles offered (must match batch count)
 * @param {string} data.vehicleTypeUniqueId - Vehicle type ID
 * @param {number} [data.proposedCostPerVehicle] - Proposed cost per vehicle
 * @param {number} [data.proposedTotalCost] - Proposed total cost
 * @param {string} [data.proposedShippingDate] - Proposed shipping date
 * @param {string} [data.proposedDeliveryDate] - Proposed delivery date
 * @param {string} [data.bidNotes] - Additional notes
 * @returns {Promise<Object>} Result with bidUniqueId
 */
exports.submitBid = async (data) => {
  const {
    passengerRequestBatchId,
    companyUniqueId,
    bidSubmittedByUserUniqueId,
    numberOfVehiclesOffered,
    vehicleTypeUniqueId,
    proposedCostPerVehicle,
    proposedTotalCost,
    proposedShippingDate,
    proposedDeliveryDate,
    bidNotes,
  } = data;

  // Company must be approved
  const company = await findOne(
    "TransportCompany",
    { companyUniqueId, isDeleted: 0 },
    "Company not found",
  );
  if (company.approvalStatus !== "approved")
    throw new AppError("Only approved companies can submit bids", 400);

  // Verify the batch exists and count its rows
  const [countRows] = await db().query(
    `SELECT COUNT(*) AS batchCount
     FROM PassengerRequest
     WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestBatchId],
  );
  const batchCount = Number(countRows?.[0]?.batchCount ?? 0);
  if (batchCount === 0)
    throw new AppError("Passenger request batch not found", 404);

  // Check company-targeting
  try {
    const [tRows] = await db().query(
      `SELECT requestMode, targetCompanyUniqueId FROM PassengerRequest
       WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL LIMIT 1`,
      [passengerRequestBatchId],
    );
    if (tRows?.length > 0) {
      const { requestMode, targetCompanyUniqueId } = tRows[0];
      if (
        requestMode === "company_target" &&
        targetCompanyUniqueId !== null &&
        targetCompanyUniqueId !== companyUniqueId
      ) {
        throw new AppError(
          "This batch is targeted at a different company",
          403,
        );
      }
    }
  } catch (e) {
    if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
  }

  // Full-batch bid only
  if (Number(numberOfVehiclesOffered) !== batchCount)
    throw new AppError(
      `Full batch bid required. Batch has ${batchCount} vehicles; you offered ${numberOfVehiclesOffered}`,
      400,
    );

  // One bid per company per batch
  const [existing] = await db().query(
    "SELECT companyBidRequestId FROM CompanyBidRequest WHERE companyUniqueId = ? AND passengerRequestBatchId = ? AND companyBidRequestDeletedAt IS NULL",
    [companyUniqueId, passengerRequestBatchId],
  );
  if (existing.length > 0)
    throw new AppError(
      "This company has already submitted a bid for this batch",
      409,
    );

  const [jsRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'waiting' LIMIT 1",
  );
  const journeyStatusId = jsRows?.[0]?.journeyStatusId ?? 1;

  const companyBidRequestUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidRequest
      (companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
       bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
       proposedCostPerVehicle, proposedTotalCost, proposedShippingDate,
       proposedDeliveryDate, bidNotes, bidStatus, journeyStatusId,
       companyBidRequestCreatedBy, companyBidRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
    [
      companyBidRequestUniqueId,
      passengerRequestBatchId,
      companyUniqueId,
      bidSubmittedByUserUniqueId,
      numberOfVehiclesOffered,
      vehicleTypeUniqueId,
      proposedCostPerVehicle ?? null,
      proposedTotalCost ?? null,
      proposedShippingDate ?? null,
      proposedDeliveryDate ?? null,
      bidNotes ?? null,
      journeyStatusId,
      bidSubmittedByUserUniqueId,
      currentDate(),
    ],
  );
  return { message: "success", data: { companyBidRequestUniqueId } };
};

/**
 * Gets available passenger requests (batches) targeted at the company
 * that haven't been bidded on yet.
 *
 * @param {string} userUniqueId - User seeking available requests
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated list of PassengerRequest batches
 */
exports.getAvailableRequests = async (userUniqueId, filters = {}) => {
  const { page, limit, offset } = paginate(filters);

  // 1. Identify the company for this user
  const [membership] = await db().query(
    `SELECT companyUniqueId FROM CompanyMembership 
     WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL LIMIT 1`,
    [userUniqueId],
  );
  if (!membership || membership.length === 0) {
    throw new AppError(
      "User is not an active member of any transport company",
      403,
    );
  }
  const companyUniqueId = membership[0].companyUniqueId;

  // 2. Fetch requests targeted at this company where no bid exists from this company
  const activeStatusIds = [journeyStatusMap.requested, journeyStatusMap.waiting];

  const clauses = [
    "pr.passengerRequestDeletedAt IS NULL",
    "pr.requestMode = 'company_target'",
    "pr.targetCompanyUniqueId = ?",
    "pr.journeyStatusId IN (?)",
    `NOT EXISTS (
      SELECT 1 FROM CompanyBidRequest cbr 
      WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId 
      AND cbr.companyUniqueId = ? AND cbr.companyBidRequestDeletedAt IS NULL
    )`,
  ];
  const params = [companyUniqueId, activeStatusIds, companyUniqueId];

  const where = `WHERE ${clauses.join(" AND ")}`;

  // Select unique batches using a subquery to find a representative row (MIN ID) per batch.
  // This ensures compatibility with ONLY_FULL_GROUP_BY.
  const baseSql = `
    SELECT pr.*, vt.vehicleTypeName, js.journeyStatusName
    FROM PassengerRequest pr
    INNER JOIN (
      SELECT MIN(passengerRequestId) as minId
      FROM PassengerRequest
      WHERE passengerRequestDeletedAt IS NULL
      GROUP BY passengerRequestBatchId
    ) as batch_rep ON pr.passengerRequestId = batch_rep.minId
    LEFT JOIN VehicleTypes vt ON pr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    ${where}
  `;

  const countSql = `
    SELECT COUNT(DISTINCT pr.passengerRequestBatchId) AS total 
    FROM PassengerRequest pr ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY pr.shipperRequestCreatedAt DESC`,
    countSql,
    params,
    page,
    limit,
    offset,
  );
};

exports.getBids = async (filters = {}, userUniqueId = null) => {
  if (filters.target === "available") {
    if (!userUniqueId) throw new AppError("Authentication required", 401);
    return exports.getAvailableRequests(userUniqueId, filters);
  }
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyBidRequestDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) {
    clauses.push("companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.passengerRequestBatchId) {
    clauses.push("passengerRequestBatchId = ?");
    params.push(filters.passengerRequestBatchId);
  }
  if (filters.companyUniqueId) {
    clauses.push("companyUniqueId = ?");
    params.push(filters.companyUniqueId);
  }
  if (filters.bidStatus) {
    clauses.push("bidStatus = ?");
    params.push(filters.bidStatus);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyBidRequest ${where} ORDER BY companyBidRequestCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidRequest ${where}`,
    params,
    page,
    limit,
    offset,
  );
};

exports.updateBidStatus = async (
  companyBidRequestUniqueId,
  bidStatus,
  updatedBy,
) => {
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.companyBidRequestDeletedAt)
    throw new AppError("Bid has been deleted", 400);

  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET bidStatus = ?, bidStatusUpdatedAt = ?, bidStatusUpdatedBy = ?,
         companyBidRequestUpdatedBy = ?, companyBidRequestUpdatedAt = ?
     WHERE companyBidRequestUniqueId = ?`,
    [
      bidStatus,
      currentDate(),
      updatedBy,
      updatedBy,
      currentDate(),
      companyBidRequestUniqueId,
    ],
  );
  if (res.affectedRows === 0) throw new AppError("Bid update failed", 500);

  let newPRStatus = null;
  if (bidStatus === "accepted_by_shipper") {
    newPRStatus = journeyStatusMap.acceptedByPassenger;
  } else if (
    bidStatus === "cancelled_by_company" ||
    bidStatus === "rejected_by_shipper" ||
    bidStatus === "expired"
  ) {
    newPRStatus = journeyStatusMap.waiting;
  }

  if (newPRStatus !== null) {
    await db().query(
      `UPDATE PassengerRequest
       SET journeyStatusId = ?
       WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
      [newPRStatus, bid.passengerRequestBatchId],
    );
  }

  const notificationMap = {
    accepted_by_shipper: {
      title: "Bid accepted",
      body: "The shipper has accepted your company's freight bid.",
    },
    rejected_by_shipper: {
      title: "Bid rejected",
      body: "The shipper has rejected your company's freight bid.",
    },
    cancelled_by_company: {
      title: "Bid cancelled",
      body: "Your company's bid has been cancelled.",
    },
    expired: {
      title: "Bid expired",
      body: "Your company's bid has expired without a response.",
    },
  };
  const notif = notificationMap[bidStatus];
  if (notif && bid.bidSubmittedByUserUniqueId) {
    sendFCMNotificationToUser({
      userUniqueId: bid.bidSubmittedByUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: notif,
      data: {
        type: "company_bid_status",
        bidStatus,
        companyBidRequestUniqueId,
        passengerRequestBatchId: bid.passengerRequestBatchId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for bid status update", {
        error: e.message,
        companyBidRequestUniqueId,
        bidStatus,
      }),
    );
  }

  return { message: "success", data: `Bid status updated to ${bidStatus}` };
};

exports.deleteBid = async (companyBidRequestUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET companyBidRequestDeletedAt = ?, companyBidRequestDeletedBy = ?
     WHERE companyBidRequestUniqueId = ? AND companyBidRequestDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0)
    throw new AppError("Bid not found or already deleted", 404);
  return { message: "success", data: "Bid deleted" };
};
