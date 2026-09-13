"use strict";

const { currentDate, minutesAgo } = require("../../Utils/CurrentDate");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../../Utils/QueueSocket");
const { sendSocketIONotificationToDriver } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const {
  QUEUE_STATUS,
  HISTORY_EVENT,
  QUEUE_OFFER_WINDOW_MINUTES,
  logQueueHistory,
} = require("./helpers");
const { offerToNextDriver, applyRefusalPolicy } = require("./release.service");
const { notifyShipperOfQueueEvent } = require("./dispatch-notify");

/**
 * Offer-window timeout (implicit, PASSIVE) — find every entry that is still
 * `requested` past the window with a linked order still `requested`, mark the
 * decision + driver request free (implicit no-answer), and move the entry to
 * `no_answer_from_driver` (16) RETAINING the order so the first driver's late
 * accept (after the window, while nobody else has taken the order) is still
 * honoured. The order is then offered to the NEXT waiting driver of the same
 * vehicle type; if one exists, offerToDriver's stale-holder release detaches
 * the order from the 16-entry (position kept, still in line) and the advance
 * completes; if none exists the order stays on the 16-entry until a later
 * check-in/rescan or the first driver's late accept. Called by the background
 * automatic-timeout scan. `actor` is the user stamped on the audit trail (the
 * order's creator).
 */
exports.releaseExpiredOffers = async ({
  windowMinutes = QUEUE_OFFER_WINDOW_MINUTES,
} = {}) => {
  const executor = db();
  // `requestedAt` is written by `currentDate()` as EAT wall-clock; compare against
  // a cutoff computed in the SAME domain. A UTC `Date` here gets serialized by
  // mysql2 in the process timezone, skewing the comparison by the offset — a
  // 3-hour skew made every fresh offer look already-expired (releasing offers
  // seconds after they were made).
  const cutoff = minutesAgo(windowMinutes);

  const [expired] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.queueRefusalCount, dq.vehicleDriverUniqueId, vd.driverUserUniqueId, dq.shipperRequestUniqueId,
            v.vehicleTypeUniqueId,
            sr.shipperRequestId, sr.shipperRequestCreatedBy,
            dr.driverRequestId, dr.driverRequestUniqueId, jd.journeyDecisionUniqueId,
            u.phoneNumber AS driverPhoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
     JOIN DriverRequest dr ON dr.userUniqueId = vd.driverUserUniqueId
       AND dr.journeyStatusId = ?
     JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
       AND jd.shipperRequestId = sr.shipperRequestId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     JOIN QueueOrganization o ON o.queueOrganizationUniqueId = dq.queueOrganizationUniqueId
       AND o.isDeleted = 0
     WHERE dq.status = ${QUEUE_STATUS.REQUESTED} AND dq.queueDeletedAt IS NULL
       AND dq.requestedAt IS NOT NULL AND dq.requestedAt < ?
       AND sr.journeyStatusId = ?
     ORDER BY dq.requestedAt ASC`,
    [journeyStatusMap.requested, cutoff, journeyStatusMap.requested],
  );

  const advanced = [];
  for (const entry of expired) {
    const actor = { userUniqueId: entry.shipperRequestCreatedBy };
    const now = currentDate();

    // NO-ANSWER RETENTION: move to 16 but KEEP the order attached. Unlike an
    // active reject (which frees the order at once), the first driver keeps the
    // right to a late accept while nobody else has taken the order. Only when a
    // concrete next driver is found does offerToDriver release this retention.
    // The first driver's request + decision are deliberately LEFT at `requested`
    // here so the late accept can still land (the accept flow requires the
    // decision at `requested`); they are terminalized to noAnswerFromDriver
    // below ONLY when the order actually advances to another driver.
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.OFFER_TIMEOUT,
      performedBy: actor.userUniqueId,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.NO_ANSWER_FROM_DRIVER,
        requestedAt: null,
        queueUpdatedAt: now,
        queueUpdatedBy: actor.userUniqueId,
      },
      conditions: { queueId: entry.queueId },
    });

    await applyRefusalPolicy({ executor, entry, user: actor });

    // Tell the released driver their offer window expired — the app otherwise
    // keeps showing the offer card (or silently drops it on the next poll) with
    // no explanation. Best-effort: offline driver is covered by the REST poll.
    if (entry.driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        phoneNumber: entry.driverPhoneNumber,
        eventName: "queue",
        message: {
          messageTypes: messageTypes.queue_order_rejected,
          message: "Offer window expired",
          status: null,
          queue: {
            queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
            queueUniqueId: entry.queueUniqueId,
            queueNumber: entry.queueNumber,
            status: QUEUE_STATUS.NO_ANSWER_FROM_DRIVER,
          },
          shipper: null,
          driver: null,
          journey: null,
          decision: null,
        },
      });
    }

    await emitQueueSnapshot({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
    });
    notifyQueueOrgAdmins({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      messageType: "queue_order_rejected",
    });

    const next = await offerToNextDriver({
      executor,
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
      vehicleTypeUniqueId: entry.vehicleTypeUniqueId,
      excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      user: actor,
    });

    if (next.offered) {
      // The order is now on ANOTHER driver's entry — the first driver's
      // late accept must be rejected. Terminalize their still-`requested`
      // decision + request to noAnswerFromDriver(16) so (a) the accept flow's
      // `requested` status check fails and the queue pre-gate returns 409
      // ("passed to another driver"), and (b) their NEXT offer is not blocked
      // by a dead active request on the uq_driver_active_request unique index.
      // NOTE: offerToDriver already released the stale 16-entry (→18, order
      // cleared), so no queue-entry write is needed here.
      await executor.query(
        `UPDATE JourneyDecisions jd
         JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
         JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
         SET jd.journeyStatusId = ?,
             jd.journeyDecisionUpdatedAt = ?,
             jd.journeyDecisionUpdatedBy = ?,
             jd.isCancellationByDriverSeenByShipper = 'no need to see it',
             dr.journeyStatusId = ?,
             dr.driverRequestUpdatedAt = ?,
             dr.driverRequestUpdatedBy = ?
         WHERE sr.shipperRequestUniqueId = ? AND dr.userUniqueId = ?
           AND dr.journeyStatusId = ? AND jd.journeyStatusId = ?`,
        [
          journeyStatusMap.noAnswerFromDriver,
          now,
          actor.userUniqueId,
          journeyStatusMap.noAnswerFromDriver,
          now,
          actor.userUniqueId,
          entry.shipperRequestUniqueId,
          entry.driverUserUniqueId,
          journeyStatusMap.requested,
          journeyStatusMap.requested,
        ],
      );
    }

    // A found next driver already detached the order via offerToDriver's
    // stale-holder release (16 → 18, order cleared); the shipper is told the
    // order moved on. When nothing is available, the order stays retained on
    // the 16-entry for the first driver's late accept.
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      messageType: "queue_order_reoffered",
      message: next.offered
        ? "The driver did not respond in time; your order was passed to the next driver."
        : "The driver did not respond in time. The order stays available for your reserved queue; you will be notified once a driver accepts.",
    });
    advanced.push({ queueUniqueId: entry.queueUniqueId, ...next });
  }

  return { message: "success", data: { released: advanced.length, advanced } };
};
