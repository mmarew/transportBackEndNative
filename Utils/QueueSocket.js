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
    messageTypes: messageTypes[messageType] || messageTypes.queue_position_changed,
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
      const socketId = await getSocket("queueOrgAdmin", member.phoneNumber?.replace(/\D/g, ""));
      if (!socketId) continue;
      const payload = JSON.stringify({
        message: "success",
        messageTypes: messageTypes[messageType] || messageTypes.queue_position_changed,
        data: message || { queueOrganizationUniqueId },
      });
      const res = await emitMessage({ socketId, eventName, messageDetails: payload });
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

module.exports = {
  orgRoom,
  dayRoom,
  emitToQueueRoom,
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
};
