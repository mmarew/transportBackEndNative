"use strict";

const { db } = require("./CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const logger = require("../Utils/logger");
const AppError = require("../Utils/AppError");

/**
 * Open/close the bidding board for SPECIFIC orders (per-order control).
 *
 * Each given ShipperRequest.isBiddingApproved (the SOLE bidding signal) is
 * toggled independently, so orders within one batch can diverge — e.g. some
 * hired via FIFO at status 3+ while others are opened to bidding. Orders keep
 * their ordinary journeyStatusId (there is no 'bidding' status or mode).
 *
 * While FALSE (default) an order is a normal FIFO queue order: never distance-
 * matched. Once TRUE it becomes distance-matched (findNearbyDrivers/Shippers)
 * and FIFO skips it.
 *
 * On approval, this triggers the driver-matching pass (handleWaitingRequest) for
 * each order that is STILL WAITING (journeyStatusId 1), creating JourneyDecisions
 * so the shipper/driver connection opens. Orders already hired (status 3+) are
 * flagged but not re-matched.
 *
 * @param {Object} params
 * @param {string[]} params.shipperRequestUniqueIds - the orders to open/close
 * @param {boolean} [params.approved=true] - TRUE to open bidding, FALSE to hide again
 * @param {Object} params.user - actor (shipper or queue-admin)
 * @returns {Promise<{message: string, data: Object}>}
 */
exports.approveBidding = async ({
  shipperRequestUniqueIds,
  approved = true,
  user,
}) => {
  const executor = db();
  const ids = [...new Set(shipperRequestUniqueIds || [])];
  if (ids.length === 0) {
    throw new AppError("shipperRequestUniqueIds is required", AppError.BAD_REQUEST);
  }
  const placeholders = ids.map(() => "?").join(", ");

  // 1. Load the requested orders joined with their batch (for queue org +
  //    ownership) — the flag lives PER-ORDER on ShipperRequest.
  const [orders] = await executor.query(
    `SELECT sr.shipperRequestId, sr.shipperRequestUniqueId,
            sr.shipperRequestBatchUniqueId, sr.vehicleTypeUniqueId,
            sr.journeyStatusId, sr.originLatitude, sr.originLongitude,
            sr.requestMode, sr.shipperRequestCreatedAt,
            srb.queueOrganizationUniqueId, srb.shipperUserUniqueId
       FROM ShipperRequest sr
       LEFT JOIN ShipperRequestBatch srb
         ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
      WHERE sr.shipperRequestUniqueId IN (${placeholders})
        AND sr.shipperRequestDeletedAt IS NULL`,
    ids,
  );

  // 2. Validate: every id must resolve to a live QUEUE order.
  if (orders.length !== ids.length) {
    throw new AppError(
      "One or more orders were not found (or are deleted)",
      AppError.NOT_FOUND,
    );
  }
  if (!orders.every((o) => o.queueOrganizationUniqueId)) {
    throw new AppError(
      "Only queue orders can be opened to the bidding board",
      AppError.BAD_REQUEST,
    );
  }

  // 3. Ownership fence. An actor may open/close the bidding board if they are:
  //      - the shipper who owns EVERY order's batch, OR
  //      - a SuperAdmin, OR
  //      - an active QueueOrgAdmin (role 11) member of the order's queue org.
  const isSuperAdmin = user?.roleId === usersRoles.supperAdminRoleId;
  const ownsAll = orders.every(
    (o) => o.shipperUserUniqueId === user.userUniqueId,
  );
  const isQueueOrgAdmin =
    user?.roleId === usersRoles.queueOrgAdminRoleId;
  if (!isSuperAdmin && !ownsAll && !isQueueOrgAdmin) {
    throw new AppError(
      "You are not authorized to approve one or more of these orders",
      AppError.FORBIDDEN,
    );
  }
  // If a QueueOrgAdmin (not the owner), require an active membership in the
  // queue org of the orders being toggled.
  if (isQueueOrgAdmin && !ownsAll && !isSuperAdmin) {
    const orgUniqueIds = [
      ...new Set(orders.map((o) => o.queueOrganizationUniqueId)),
    ];
    const [memberships] = await executor.query(
      `SELECT 1 FROM QueueOrganizationMembership
        WHERE queueOrganizationUniqueId IN (${orgUniqueIds.map(() => "?").join(", ")})
          AND userUniqueId = ? AND roleId = ? AND isActive = TRUE
        LIMIT 1`,
      [...orgUniqueIds, user.userUniqueId, usersRoles.queueOrgAdminRoleId],
    );
    if (memberships.length === 0) {
      throw new AppError(
        "You are not authorized to approve one or more of these orders",
        AppError.FORBIDDEN,
      );
    }
  }

  // 4. Persist the per-order approval gate.
  await executor.query(
    `UPDATE ShipperRequest
        SET isBiddingApproved = ?
      WHERE shipperRequestUniqueId IN (${placeholders})
        AND shipperRequestDeletedAt IS NULL`,
    [approved ? 1 : 0, ...ids],
  );

  // 5. On approval, distance-match each order that is STILL WAITING.
  let matched = 0;
  if (approved) {
    const waitingOrders = orders.filter(
      (o) => o.journeyStatusId === journeyStatusMap.waiting,
    );
    if (waitingOrders.length > 0) {
      const { handleWaitingRequest } = require("./ShipperRequest/statusVerification.service");
      const notifiedDrivers = new Set();
      for (const order of waitingOrders) {
        const localDriversData = [];
        const localDrivers = [];
        const localDecisions = [];
        const orderWithBatch = {
          ...order,
          isBiddingApproved: true,
          userUniqueId: user.userUniqueId,
        };
        const found = await handleWaitingRequest({
          shipperRequest: orderWithBatch,
          shipperRequestId: order.shipperRequestId,
          totalRecords: null,
          pageSize: null,
          page: null,
          driversData: localDriversData,
          drivers: localDrivers,
          decisions: localDecisions,
          notifiedDrivers,
          userUniqueId: user.userUniqueId,
        });
        if (found) matched += 1;
      }
    }
  }

  // 6. Notify each affected shipper (once per distinct shipper, non-blocking).
  const shipperUniqueIds = [...new Set(orders.map((o) => o.shipperUserUniqueId))];
  try {
    if (shipperUniqueIds.length > 0) {
      const [shipperRows] = await executor.query(
        `SELECT userUniqueId, phoneNumber FROM Users
          WHERE userUniqueId IN (${shipperUniqueIds.map(() => "?").join(", ")})`,
        shipperUniqueIds,
      );
      const { sendSocketIONotificationToShipper } = require("../Utils/Notifications");
      const messageTypes = require("../Utils/MessageTypes");
      for (const s of shipperRows) {
        if (!s.phoneNumber) continue;
        sendSocketIONotificationToShipper({
          message: {
            messageTypes: approved
              ? messageTypes.bidding_board_approved
              : messageTypes.bidding_board_hidden,
            message: approved
              ? `${ids.length} order(s) opened to bidding`
              : `${ids.length} order(s) hidden from bidding`,
            status: journeyStatusMap.waiting,
            data: {
              shipperRequestUniqueIds: ids,
              isBiddingApproved: approved,
              count: ids.length,
            },
          },
          phoneNumber: s.phoneNumber,
        }).catch((e) =>
          logger.warn("Bidding approval notification failed", { error: e.message }),
        );
      }
    }
  } catch (e) {
    logger.warn("Could not notify shipper of bidding approval", {
      error: e.message,
    });
  }

  return {
    message: approved
      ? "Orders opened to bidding and matched to nearby drivers"
      : "Orders hidden from bidding",
    data: {
      shipperRequestUniqueIds: ids,
      isBiddingApproved: approved,
      count: ids.length,
      waitingMatched: matched,
    },
  };
};

/**
 * List all driver bids for a single queue order (one ShipperRequest slot).
 *
 * @param {Object} params
 * @param {string} params.shipperRequestUniqueId - the order's unique id
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<{message: string, data: Array, pagination: Object}>}
 */
exports.getBidsForOrder = async ({ shipperRequestUniqueId, page = 1, limit = 20 }) => {
  const executor = db();
  const offset = (page - 1) * limit;

  // Ensure the order exists.
  const [orderRows] = await executor.query(
    `SELECT shipperRequestUniqueId, journeyStatusId, requestMode
       FROM ShipperRequest
      WHERE shipperRequestUniqueId = ? AND shipperRequestDeletedAt IS NULL
      LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (orderRows.length === 0) {
    throw new AppError("Order not found", AppError.NOT_FOUND);
  }

  const [[{ total }]] = await executor.query(
    `SELECT COUNT(*) AS total FROM DriverBid
      WHERE shipperRequestUniqueId = ? AND driverBidDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );

  const [bids] = await executor.query(
    `SELECT db.driverBidUniqueId, db.driverBidId,
            db.shipperRequestUniqueId, db.shipperRequestBatchUniqueId,
            db.driverUserUniqueId, db.driverRequestUniqueId,
            db.bidAmount, db.bidNotes, db.bidStatus,
            db.driverBidCreatedAt,
            u.fullName, u.phoneNumber
       FROM DriverBid db
       LEFT JOIN Users u ON u.userUniqueId = db.driverUserUniqueId
      WHERE db.shipperRequestUniqueId = ? AND db.driverBidDeletedAt IS NULL
      ORDER BY db.bidAmount ASC, db.driverBidCreatedAt ASC
      LIMIT ? OFFSET ?`,
    [shipperRequestUniqueId, Number(limit), Number(offset)],
  );

  return {
    message: "Driver bids fetched successfully",
    data: bids,
    pagination: {
      currentPage: page,
      limit,
      totalItems: Number(total) || 0,
      totalPages: Math.ceil((Number(total) || 0) / limit),
    },
  };
};
