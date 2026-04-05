"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");
const logger = require("../Utils/logger");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");

exports.submitBid = async (data) => {
  const {
    passengerRequestBatchId, companyUniqueId, bidSubmittedByUserUniqueId,
    numberOfVehiclesOffered, vehicleTypeUniqueId,
    proposedCostPerVehicle, proposedTotalCost,
    proposedShippingDate, proposedDeliveryDate, bidNotes,
  } = data;

  // Company must be approved
  const company = await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");
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
  if (batchCount === 0) throw new AppError("Passenger request batch not found", 404);

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
        throw new AppError("This batch is targeted at a different company", 403);
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
    throw new AppError("This company has already submitted a bid for this batch", 409);

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
    [companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
      bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
      proposedCostPerVehicle ?? null, proposedTotalCost ?? null,
      proposedShippingDate ?? null, proposedDeliveryDate ?? null,
      bidNotes ?? null, journeyStatusId,
      bidSubmittedByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyBidRequestUniqueId } };
};

exports.getBids = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyBidRequestDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) { clauses.push("companyBidRequestUniqueId = ?"); params.push(filters.companyBidRequestUniqueId); }
  if (filters.passengerRequestBatchId) { clauses.push("passengerRequestBatchId = ?"); params.push(filters.passengerRequestBatchId); }
  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.bidStatus) { clauses.push("bidStatus = ?"); params.push(filters.bidStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyBidRequest ${where} ORDER BY companyBidRequestCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidRequest ${where}`,
    params, page, limit, offset,
  );
};

exports.updateBidStatus = async (companyBidRequestUniqueId, bidStatus, updatedBy) => {
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
    [bidStatus, currentDate(), updatedBy, updatedBy, currentDate(), companyBidRequestUniqueId],
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
    accepted_by_shipper:   { title: "Bid accepted",   body: "The shipper has accepted your company's freight bid." },
    rejected_by_shipper:   { title: "Bid rejected",   body: "The shipper has rejected your company's freight bid." },
    cancelled_by_company:  { title: "Bid cancelled",  body: "Your company's bid has been cancelled." },
    expired:               { title: "Bid expired",    body: "Your company's bid has expired without a response." },
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
  if (res.affectedRows === 0) throw new AppError("Bid not found or already deleted", 404);
  return { message: "success", data: "Bid deleted" };
};
