// Utils/QueueSocket.js
//
// Real-time helpers for the queue-dispatch feature. Push events over socket.io
// (rooms) so drivers and queue org admins get live queue changes instead of
// polling the REST API. All REST writes in Services/Queue*/ call these after
// committing, so the socket is a read-model push on top of the authoritative DB.
const { socketIO, emitMessage } = require("./WsServerResponder");
const { getSocket } = require("./WsConnectionStore");
const { db } = require("../Services/CompanyHelper.service");
const messageTypes = require("./MessageTypes");
const logger = require("./logger");
const { SocketUserTypes } = require("./SocketUserTypes");
const { usersRoles } = require("./ListOfSeedData");

// Room layout:
//   queueOrg:<queueOrganizationUniqueId>            → queue org admins (all dates)
//   queueOrg:<queueOrganizationUniqueId>:<queueDate> → that day's queue (drivers + admins)
const ORG_ROOM_PREFIX = "queueOrg";

const orgRoom = (queueOrganizationUniqueId) =>
  `${ORG_ROOM_PREFIX}:${queueOrganizationUniqueId}`;

const dayRoom = (queueOrganizationUniqueId, queueDate) =>
  `${ORG_ROOM_PREFIX}:${queueOrganizationUniqueId}:${queueDate}`;

/**
 * Push a JSON payload to everyone subscribed to an org+day queue room.
 * Drivers join after check-in; queue org admins join on load.
 */
const emitToQueueRoom = ({
  queueOrganizationUniqueId,
  queueDate,
  eventName = "queue",
  messageType = "queue_position_changed",
  data = null,
}) => {
  const io = socketIO.io;
  if (!io) {
    logger.warn("Socket.io not initialized — skipping queue room emit", {
      queueOrganizationUniqueId,
      queueDate,
    });
    return { status: "error", message: "Socket not initialized" };
  }
  const payload = JSON.stringify({
    message: "success",
    messageTypes:
      messageTypes[messageType] || messageTypes.queue_position_changed,
    data,
  });
  io.to(dayRoom(queueOrganizationUniqueId, queueDate)).emit(eventName, payload);
  return { status: "success" };
};

/**
 * Push a live queue state snapshot to the org+day room. `rows` is the same
 * shape returned by the REST status endpoint, so clients can render it directly.
 */
const emitQueueSnapshot = async ({
  queueOrganizationUniqueId,
  queueDate,
  eventName = "queue",
}) => {
  try {
    const [rows] = await db().query(
      `SELECT dq.queueUniqueId, dq.queueNumber, dq.joinedAt, dq.status,
              vd.driverUserUniqueId, v.vehicleTypeUniqueId, u.fullName, u.phoneNumber,
              sr.shipperRequestUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId
       JOIN Users u            ON u.userUniqueId            = vd.driverUserUniqueId
       LEFT JOIN ShipperRequest sr ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber ASC`,
      [queueOrganizationUniqueId, queueDate],
    );
    emitToQueueRoom({
      queueOrganizationUniqueId,
      queueDate,
      eventName,
      messageType: "queue_position_changed",
      data: { queueOrganizationUniqueId, queueDate, entries: rows },
    });
  } catch (error) {
    logger.error("emitQueueSnapshot failed", {
      error: error.message,
      stack: error.stack,
      queueOrganizationUniqueId,
      queueDate,
    });
  }
};

/**
 * Live company-bid event for the queue organization that owns a batch.
 *
 * Fired when a company joins a queue-org job (bid submitted) or when a
 * company is selected (bid accepted). Two delivery channels so both connected
 * queue screens and individual staff get the live message:
 *   1. Broadcast to the org-wide room `queueOrg:<uid>` (any client subscribed).
 *   2. Targeted Redis push to every ACTIVE staff member (roles 11 & 12).
 * Skips silently when the batch has no queue org.
 */
const emitBidEventToQueueOrg = async ({
  queueOrganizationUniqueId,
  messageType = "company_bid_joined",
  message = null,
  data = null,
  eventName = "messages",
}) => {
  if (!queueOrganizationUniqueId) {
    return { status: "success", data: "Not a queue-org job — skipped" };
  }
  const payload = JSON.stringify({
    message: "success",
    messageTypes: messageTypes[messageType] || messageTypes.company_bid_joined,
    data,
  });

  try {
    const io = socketIO.io;
    if (io) {
      io.to(orgRoom(queueOrganizationUniqueId)).emit(eventName, payload);
    }

    const [members] = await db().query(
      `SELECT u.phoneNumber
       FROM QueueOrganizationMembership qm
       JOIN Users u ON qm.userUniqueId = u.userUniqueId
       WHERE qm.queueOrganizationUniqueId = ?
         AND qm.roleId IN (?, ?)
         AND qm.isActive = 1
         AND qm.membershipDeletedAt IS NULL`,
      [queueOrganizationUniqueId,
       usersRoles.queueOrgAdminRoleId,
       usersRoles.queueDispatcherRoleId],
    );

    const results = [];
    for (const member of members) {
      const cleaned = member.phoneNumber?.replace(/\D/g, "");
      const socketId = await getSocket(SocketUserTypes.QUEUE_ORG_ADMIN, cleaned);
      if (!socketId) continue;
      const res = await emitMessage({ socketId, eventName, messageDetails: payload });
      results.push({ phoneNumber: cleaned, status: res.status });
    }

    logger.debug("emitBidEventToQueueOrg done", {
      queueOrganizationUniqueId,
      messageType,
      message,
      sockets: results.length,
    });
    return { status: "success", data: results };
  } catch (error) {
    logger.error("emitBidEventToQueueOrg failed", {
      error: error.message,
      stack: error.stack,
      queueOrganizationUniqueId,
      messageType,
    });
    return { status: "error", message: error.message };
  }
};

/**
 * Notify all QueueOrgAdmin members (role 11) of a queue organization.
 * Reuses the same socket registration as other user types.
 */
const notifyQueueOrgAdmins = async ({
  queueOrganizationUniqueId,
  eventName = "queue",
  messageType = "queue_position_changed",
  message = null,
}) => {
  try {
    const [members] = await db().query(
      `SELECT u.phoneNumber
       FROM QueueOrganizationMembership qm
       JOIN Users u ON qm.userUniqueId = u.userUniqueId
       WHERE qm.queueOrganizationUniqueId = ?
         AND qm.roleId = 11
         AND qm.isActive = 1
         AND qm.membershipDeletedAt IS NULL`,
      [queueOrganizationUniqueId],
    );

    const results = [];
    for (const member of members) {
      const socketId = await getSocket(
        SocketUserTypes.QUEUE_ORG_ADMIN,
        member.phoneNumber?.replace(/\D/g, ""),
      );
      if (!socketId) continue;
      const payload = JSON.stringify({
        message: "success",
        messageTypes:
          messageTypes[messageType] || messageTypes.queue_position_changed,
        data: message || { queueOrganizationUniqueId },
      });
      const res = await emitMessage({
        socketId,
        eventName,
        messageDetails: payload,
      });
      results.push({ phoneNumber: member.phoneNumber, status: res.status });
    }
    return { status: "success", data: results };
  } catch (error) {
    logger.error("notifyQueueOrgAdmins failed", {
      error: error.message,
      stack: error.stack,
      queueOrganizationUniqueId,
    });
    return { status: "error", message: error.message };
  }
};

/**
 * Push a loading-stage update for a QUEUE order to a queue organization.
 * Resolves the order's queue org through its batch header (the canonical link —
 * `ShipperRequest` has no queueOrganizationUniqueId column) and skips silently
 * when the order is NOT a queue order. Sends to the org admins directly and
 * broadcasts a live event to the org room so any subscribed client (drivers,
 * admins) sees it.
 *
 * Stages match the flow: `going_to_loading_place` (5), `started_loading` (6),
 * `completed_loading` (7), and `started_journey` (8).
 */
const notifyQueueOrgOfLoadingStage = async ({
  shipperRequestUniqueId,
  driverName = "",
  driverPhoneNumber = "",
  latitude,
  longitude,
  stage,
}) => {
  if (!shipperRequestUniqueId || !stage) {
    return {
      status: "error",
      message: "shipperRequestUniqueId and stage are required",
    };
  }

  const stageConfig = {
    going_to_loading_place: {
      messageType: "queue_driver_going_to_loading_place",
      message: `Driver ${driverName} is on the way to the loading place`,
    },
    started_loading: {
      messageType: "queue_driver_started_loading",
      message: `Driver ${driverName} started loading at the loading place`,
    },
    completed_loading: {
      messageType: "queue_driver_completed_loading",
      message: `Driver ${driverName} completed loading and is ready to depart`,
    },
    started_journey: {
      messageType: "queue_driver_started_journey",
      message: `Driver ${driverName} started the journey with your goods`,
    },
  };

  const config = stageConfig[stage];
  if (!config) {
    return { status: "error", message: `Unknown loading stage: ${stage}` };
  }

  try {
    const [orders] = await db().query(
      `SELECT srb.queueOrganizationUniqueId
       FROM ShipperRequest sr
       LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
       WHERE sr.shipperRequestUniqueId = ?
         AND sr.shipperRequestDeletedAt IS NULL
       LIMIT 1`,
      [shipperRequestUniqueId],
    );
    const queueOrganizationUniqueId = orders[0]?.queueOrganizationUniqueId;
    if (!queueOrganizationUniqueId) {
      return { status: "skipped", reason: "not a queue order" };
    }

    const payload = {
      shipperRequestUniqueId,
      queueOrganizationUniqueId,
      driverName,
      driverPhoneNumber,
      latitude,
      longitude,
      stage,
      message: config.message,
    };

    await notifyQueueOrgAdmins({
      queueOrganizationUniqueId,
      messageType: config.messageType,
      message: payload,
    });

    // Live broadcast to the org-wide room (all dates): any socket that called
    // `queue:subscribe` with the org sees the driver's loading-stage update.
    const io = socketIO.io;
    if (io) {
      const eventPayload = JSON.stringify({
        message: "success",
        messageTypes:
          messageTypes[config.messageType] ||
          messageTypes.queue_position_changed,
        data: payload,
      });
      io.to(orgRoom(queueOrganizationUniqueId)).emit("queue", eventPayload);
    }

    return { status: "success", queueOrganizationUniqueId };
  } catch (error) {
    logger.error("notifyQueueOrgOfLoadingStage failed", {
      error: error.message,
      stack: error.stack,
      shipperRequestUniqueId,
      stage,
    });
    return { status: "error", message: error.message };
  }
};

/**
 * emitAssignmentConfirmationToQueueOrg — driver confirmed an assignment
 * ──────────────────────────────────────────────────────────────────────
 * Live (socket-only, no FCM) event for the QUEUE LOADING PLACE when a driver
 * confirms a company freight assignment (`confirmed_by_driver`). Mirrors
 * `emitBidEventToQueueOrg` / `company_selected` so loading-place staff see the
 * confirmation instantly instead of polling. Only relevant for queue-org jobs;
 * individual (distance) flow skips this silently.
 *
 * When to call: from the assignment-status transition service, AFTER the DB
 * commit — fire-and-forget with `.catch(logger.error)` so a socket hiccup
 * never breaks the REST write.
 *
 * Delivery channels (both):
 *   1. Room broadcast → `queueOrg:<queueOrganizationUniqueId>` on the
 *      `eventName` socket event ("messages" by default) — any subscribed
 *      client (queue screens, staff) gets it live.
 *   2. Targeted per-user push → every ACTIVE queue staff member
 *      (`QueueOrganizationMembership` with roleId IN (11, 12), isActive = 1,
 *      membershipDeletedAt IS NULL) via `getSocket(QUEUE_ORG_ADMIN, phone)`.
 *
 * Resolves the owning org through the order's batch header —
 * `ShipperRequest.shipperRequestBatchUniqueId` →
 * `ShipperRequestBatch.queueOrganizationUniqueId` (the canonical org link;
 * `ShipperRequest` has no org column).
 *
 * Socket-only by design: live screens should render immediately; offline staff
 * rely on polling, matching `company_selected`. Do NOT add FCM for this event
 * unless a background/offline user must be woken.
 *
 * Envelope sent to each recipient:
 *   { message: "success",
 *     messageTypes: messageTypes.queue_driver_confirmed_assignment,  // {message, details}
 *     data: <caller payload> | { type: "queue_driver_confirmed_assignment", ... } }
 *
 * @param {object} options
 * @param {string} options.shipperRequestUniqueId  Order that was confirmed (required).
 * @param {string} [options.driverName=""]         Driver display name, put in data/detail.
 * @param {object} [options.data=null]             Payload forwarded verbatim in `data`; when
 *                                                 omitted, a default envelope is built.
 * @param {string} [options.eventName="messages"]  Socket event name (clients listen here).
 * @returns {Promise<{status: "success"|"skipped"|"error", queueOrganizationUniqueId?, reason?, data?}>}
 *   "success" when emitted to 0+ sockets; "skipped" when not a queue order (reason:
 *   "not a queue order"); "error" on failure (logged, never throws).
 */
const emitAssignmentConfirmationToQueueOrg = async ({
  shipperRequestUniqueId,
  driverName = "",
  data = null,
  eventName = "messages",
}) => {
  if (!shipperRequestUniqueId) {
    return { status: "error", message: "shipperRequestUniqueId is required" };
  }

  try {
    const [orders] = await db().query(
      `SELECT srb.queueOrganizationUniqueId
       FROM ShipperRequest sr
       LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
       WHERE sr.shipperRequestUniqueId = ?
         AND sr.shipperRequestDeletedAt IS NULL
       LIMIT 1`,
      [shipperRequestUniqueId],
    );
    const queueOrganizationUniqueId = orders[0]?.queueOrganizationUniqueId;
    if (!queueOrganizationUniqueId) {
      return { status: "skipped", reason: "not a queue order" };
    }

    const payloadObj = {
      message: "success",
      messageTypes:
        messageTypes.queue_driver_confirmed_assignment ||
        messageTypes.queue_position_changed,
      data: data || {
        type: "queue_driver_confirmed_assignment",
        shipperRequestUniqueId,
        driverName,
        assignmentStatus: "confirmed_by_driver",
      },
    };
    const payload = JSON.stringify(payloadObj);

    const io = socketIO.io;
    if (io) {
      io.to(orgRoom(queueOrganizationUniqueId)).emit(eventName, payload);
    }

    const [members] = await db().query(
      `SELECT u.phoneNumber
       FROM QueueOrganizationMembership qm
       JOIN Users u ON qm.userUniqueId = u.userUniqueId
       WHERE qm.queueOrganizationUniqueId = ?
         AND qm.roleId IN (?, ?)
         AND qm.isActive = 1
         AND qm.membershipDeletedAt IS NULL`,
      [queueOrganizationUniqueId,
       usersRoles.queueOrgAdminRoleId,
       usersRoles.queueDispatcherRoleId],
    );

    const results = [];
    for (const member of members) {
      const cleaned = member.phoneNumber?.replace(/\D/g, "");
      const socketId = await getSocket(SocketUserTypes.QUEUE_ORG_ADMIN, cleaned);
      if (!socketId) continue;
      const res = await emitMessage({ socketId, eventName, messageDetails: payload });
      results.push({ phoneNumber: cleaned, status: res.status });
    }

    logger.debug("emitAssignmentConfirmationToQueueOrg done", {
      queueOrganizationUniqueId,
      shipperRequestUniqueId,
      sockets: results.length,
    });
    return { status: "success", queueOrganizationUniqueId, data: results };
  } catch (error) {
    logger.error("emitAssignmentConfirmationToQueueOrg failed", {
      error: error.message,
      stack: error.stack,
      shipperRequestUniqueId,
    });
    return { status: "error", message: error.message };
  }
};

module.exports = {
  orgRoom,
  dayRoom,
  emitToQueueRoom,
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
  notifyQueueOrgOfLoadingStage,
  emitBidEventToQueueOrg,
  emitAssignmentConfirmationToQueueOrg,
};
