"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { createData } = require("../../CRUD/Create/CreateData");
const { sendSocketIONotificationToDriver, sendSocketIONotificationToShipper } = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSms } = require("../../Utils/smsSender");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const { updateData } = require("../../CRUD/Update/Data.update");
const logger = require("../../Utils/logger");
const {
  today, queueOrgReady, logQueueHistory,
} = require("./helpers");

const getShipperRequest = async (executor, shipperRequestUniqueId) => {
  const [rows] = await executor.query(
    `SELECT * FROM ShipperRequest
     WHERE shipperRequestUniqueId = ? AND shipperRequestDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Shipper request not found", AppError.NOT_FOUND);
  }
  return rows[0];
};


const getDriverVehicle = async (executor, driverUserUniqueId) => {
  const [rows] = await executor.query(
    `SELECT v.vehicleUniqueId, v.licensePlate, v.color,
            vt.vehicleTypeName, vt.vehicleTypeUniqueId
     FROM Users u
     JOIN VehicleDriver vd ON vd.driverUserUniqueId = u.userUniqueId
       AND vd.assignmentStatus = 'active' AND vd.vehicleDriverDeletedAt IS NULL
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     WHERE u.userUniqueId = ? LIMIT 1`,
    [driverUserUniqueId],
  );
  return rows[0] || null;
};


/**
 * Ensure the driver has a `DriverRequest` in `waiting` that can receive a new
 * JourneyDecision. `JourneyDecisions.driverRequestId` is UNIQUE — one decision
 * per driver request — so we reuse only a waiting request that has never been
 * linked to a decision, and create a fresh one otherwise (falling back to the
 * queue organization's site as the origin placeholder).
 *
 * Returns `null` when the driver is already holding an active offer elsewhere
 * (their latest request is `requested`) — the caller skips to the next driver.
 */
const ensureWaitingDriverRequest = async (
  executor,
  driverUserUniqueId,
  queueOrganizationUniqueId,
) => {
  // The unique index `uq_driver_active_request` means at most ONE non-terminal
  // request exists per driver (activeRequestGuard = 1 for statuses 1-5). Branch
  // on what that request is:
  //   - no decision attached  → a reusable `waiting` request → return it
  //   - `waiting` + decision   → stale leftover from the expired-offer release
  //                              fix → fall through to release + fresh insert
  //   - requested/accepted/… + decision → a REAL pending offer or in-flight
  //                              journey → return null so the caller advances
  //                              to the next waiting driver (never a second
  //                              order while the driver holds an active one).
  const [activeRows] = await executor.query(
    `SELECT dr.driverRequestId, dr.driverRequestUniqueId, dr.journeyStatusId,
            jd.driverRequestId AS decisionDriverRequestId
     FROM DriverRequest dr
     LEFT JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.activeRequestGuard = 1
       AND dr.driverRequestDeletedAt IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId],
  );
  if (activeRows.length > 0) {
    const latest = activeRows[0];
    if (latest.decisionDriverRequestId === null) {
      return {
        driverRequestId: latest.driverRequestId,
        driverRequestUniqueId: latest.driverRequestUniqueId,
      };
    }
    if (latest.journeyStatusId !== journeyStatusMap.waiting) {
      return null;
    }
  }

  const [rows] = await executor.query(
    `SELECT dr.driverRequestId, dr.driverRequestUniqueId
     FROM DriverRequest dr
     LEFT JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.journeyStatusId = ?
       AND dr.driverRequestDeletedAt IS NULL
       AND jd.driverRequestId IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId, journeyStatusMap.waiting],
  );
  if (rows.length > 0) {
    return rows[0];
  }

  // Leftover state from before the expired-offer release fix: a `waiting`
  // DriverRequest that already has a JourneyDecision attached. It can't be
  // reused (JourneyDecisions.driverRequestId is UNIQUE) and the active-request
  // unique index blocks inserting a fresh one, so every offer for this driver
  // died with ER_DUP_ENTRY. Release it to a terminal status first, then create
  // a clean waiting request below.
  const [staleRows] = await executor.query(
    `SELECT dr.driverRequestId
     FROM DriverRequest dr
     JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.journeyStatusId = ?
       AND dr.driverRequestDeletedAt IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId, journeyStatusMap.waiting],
  );
  if (staleRows.length > 0) {
    await updateData({
      tableName: "DriverRequest",
      updateValues: {
        journeyStatusId: journeyStatusMap.rejectedByDriver,
        driverRequestUpdatedAt: currentDate(),
      },
      conditions: { driverRequestId: staleRows[0].driverRequestId },
    });
  }

  const [orgRows] = await executor.query(
    `SELECT queueOrganizationName, latitude, longitude
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  const org = orgRows[0] || {};
  const driverRequestUniqueId = uuidv4();
  const inserted = await createData({
    tableName: "DriverRequest",
    insertValues: {
      driverRequestUniqueId,
      userUniqueId: driverUserUniqueId,
      originLatitude: org.latitude ?? 0,
      originLongitude: org.longitude ?? 0,
      originPlace: org.queueOrganizationName || "Queue organization",
      journeyStatusId: journeyStatusMap.waiting,
      driverRequestCreatedAt: currentDate(),
    },
  });
  return { driverRequestId: inserted.insertId, driverRequestUniqueId };
};


/**
 * The engine-level offer: create a `JourneyDecision` (requested, decisionBy =
 * shipper) linking the order to the driver's request, and move the order +
 * driver request into `requested` so the existing accept/reject/timeout engine
 * takes over from here.
 */
const createQueueOffer = async (
  executor,
  { shipperRequest, driverRequest, user },
) => {
  const journeyDecisionUniqueId = uuidv4();
  const now = currentDate();
  await createData({
    tableName: "JourneyDecisions",
    insertValues: {
      journeyDecisionUniqueId,
      shipperRequestId: shipperRequest.shipperRequestId,
      driverRequestId: driverRequest.driverRequestId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: now,
      decisionBy: "queue",
      journeyDecisionCreatedBy: user.userUniqueId,
      journeyDecisionCreatedAt: now,
    },
  });
  await updateData({
    tableName: "ShipperRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.requested,
      shipperRequestUpdatedAt: now,
      shipperRequestUpdatedBy: user.userUniqueId,
    },
    conditions: { shipperRequestId: shipperRequest.shipperRequestId },
  });
  await updateData({
    tableName: "DriverRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.requested,
      driverRequestUpdatedAt: now,
      driverRequestUpdatedBy: user.userUniqueId,
    },
    conditions: { driverRequestId: driverRequest.driverRequestId },
  });
  return {
    journeyDecisionUniqueId,
    decision: {
      journeyDecisionUniqueId,
      shipperRequestId: shipperRequest.shipperRequestId,
      driverRequestId: driverRequest.driverRequestId,
      driverRequestUniqueId: driverRequest.driverRequestUniqueId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: now,
      decisionBy: "queue",
    },
  };
};


/**
 * Notify a driver of a queue order offer via socket, FCM, and SMS.
 *
 * Called after a pending order is matched to the front-of-queue driver. The
 * notification is sent through three channels:
 * - **Socket**: real-time push to the driver's connected client.
 * - **FCM**: wake the driver's phone even when the app is backgrounded.
 * - **SMS**: fallback if the driver is offline.
 *
 * Best-effort: if any channel fails, the error is logged but not thrown.
 * The driver's `myPosition` poll and socket reconnect will recover the offer
 * independently.
 *
 * @param {Object} params
 * @param {Object} params.front - The front-of-queue driver entry (DriverQueue row).
 * @param {Object} params.shipperRequest - The order being offered.
 * @param {Object} params.vehicle - The driver's vehicle info.
 * @param {Object} params.offerResult - The offer result from the dispatch logic.
 * @returns {Promise<void>}
 */
const notifyDriverOfQueueOffer = async ({
  front,
  shipperRequest,
  vehicle,
  offerResult,
}) => {
  if (!front?.phoneNumber) return;
  // FCM — wakes the driver's phone even when the app is backgrounded, so a
  // queue placement rings like a company assignment / nearby-match offer
  // instead of being silently missed. Best-effort: the socket is the primary
  // path, and the driver app's REST myPosition poll recovers the offer anyway.
  sendFCMNotificationToUser({
    userUniqueId: front.driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New queue order offered",
      body: shipperRequest?.originPlace
        ? `You have a new queue order from ${shipperRequest.originPlace}. Please accept or reject.`
        : "You have a new queue order. Please accept or reject.",
    },
    data: {
      type: "queue_order_offered",
      queueOrganizationUniqueId: front.queueOrganizationUniqueId,
      queueUniqueId: front.queueUniqueId,
      queueNumber: String(front.queueNumber ?? ""),
      shipperRequestUniqueId: shipperRequest.shipperRequestUniqueId,
      journeyDecisionUniqueId: offerResult.decision.journeyDecisionUniqueId,
    },
  }).catch((e) =>
    logger.error("FCM failed for queue offer notification", {
      error: e.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    }),
  );

  try {
    await sendSocketIONotificationToDriver({
      phoneNumber: front.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_order_offered,
        message: "New queue order offered",
        status: journeyStatusMap.requested,
        shipper: shipperRequest,
        driver: {
          driver: {
            ...front,
            driverRequestUniqueId: offerResult.decision.driverRequestUniqueId,
          },
          vehicle,
        },
        journey: null,
        decisions: offerResult.decision,
        queue: {
          queueOrganizationUniqueId: front.queueOrganizationUniqueId,
          queueUniqueId: front.queueUniqueId,
          queueNumber: front.queueNumber,
          offerWindowMinutes: QUEUE_OFFER_WINDOW_MINUTES,
        },
      },
    });
  } catch (socketErr) {
    logger.error("Socket notification failed for queue offer", {
      error: socketErr.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    });
  }
};


/**
 * Push a `queue` socket event to the SHIPPER who owns a queue order. The
 * shipper is resolved via `ShipperRequest.shipperRequestCreatedBy → Users`.
 * Mirrors `notifyDriverOfQueueOffer`; the bid flow already uses this helper
 * (`sendSocketIONotificationToShipper`). Best-effort: offline shipper or an
 * order created by a queue admin (no `shipper` socket) is skipped silently —
 * the QueueOrgAdmin rooms still get the snapshot push.
 */
const notifyShipperOfQueueEvent = async ({
  executor,
  shipperRequestUniqueId,
  messageType,
  message,
  data = {},
}) => {
  try {
    const [rows] = await executor.query(
      `SELECT u.phoneNumber, u.fullName
       FROM ShipperRequest sr
       JOIN Users u ON u.userUniqueId = sr.shipperRequestCreatedBy
       WHERE sr.shipperRequestUniqueId = ? AND sr.shipperRequestDeletedAt IS NULL`,
      [shipperRequestUniqueId],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;
    await sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes[messageType],
        message,
        shipperRequestUniqueId,
        shipper: {
          fullName: shipper.fullName,
          phoneNumber: shipper.phoneNumber,
        },
        ...data,
      },
    });
  } catch (error) {
    logger.error("notifyShipperOfQueueEvent failed", {
      error: error.message,
      shipperRequestUniqueId,
    });
  }
};


/**
 * Notify a shipper that a driver has reserved their queue position exclusively
 * for the shipper's orders. Best-effort: socket + FCM + SMS, failures are
 * logged but never block the checkin.
 */
const notifyShipperOfQueueReservation = async ({
  executor,
  targetedShipperUserUUID,
  driverFullName,
  driverPhoneNumber,
  queueOrganizationUniqueId,
  queueNumber,
}) => {
  if (!targetedShipperUserUUID) return;
  try {
    const [rows] = await executor.query(
      `SELECT phoneNumber, fullName FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [targetedShipperUserUUID],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;

    // Socket notification
    sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_position_reserved,
        message: "A driver has reserved their queue position for your orders",
        data: {
          targetedShipperUserUUID,
          driverFullName,
          driverPhoneNumber,
          queueOrganizationUniqueId,
          queueNumber,
        },
      },
    }).catch((e) =>
      logger.error("Socket notification failed for queue reservation", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // FCM notification
    sendFCMNotificationToUser({
      userUniqueId: targetedShipperUserUUID,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Queue position reserved",
        body: driverFullName
          ? `Driver ${driverFullName} has reserved their queue position for your orders.`
          : "A driver has reserved their queue position for your orders.",
      },
      data: {
        type: "queue_position_reserved",
        targetedShipperUserUUID,
        driverFullName,
        driverPhoneNumber,
        queueOrganizationUniqueId,
        queueNumber: String(queueNumber ?? ""),
      },
    }).catch((e) =>
      logger.error("FCM failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // SMS notification
    sendSms(
      shipper.phoneNumber,
      null,
      `A driver has reserved their queue position for your orders. Driver: ${driverFullName || "N/A"}, Phone: ${driverPhoneNumber || "N/A"}.`,
    ).catch((e) =>
      logger.error("SMS failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );
  } catch (error) {
    logger.error("notifyShipperOfQueueReservation failed", {
      error: error.message,
      targetedShipperUserUUID,
    });
  }
};



module.exports = {
  getShipperRequest,
  getDriverVehicle,
  ensureWaitingDriverRequest,
  createQueueOffer,
  notifyDriverOfQueueOffer,
  notifyShipperOfQueueEvent,
  notifyShipperOfQueueReservation,
};
