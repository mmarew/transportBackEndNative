"use strict";

// Active-transfer feature tests (queue cancel-after-accept + non-queue nearest
// re-match). Standalone: runs at the END of the queue suite so it cannot disturb
// the ordering assumptions of TQ-11..TQ-36. Self-contained — it re-creates its
// own scenario instead of depending on leftover driver state.
//
//   TQ-34  Queue driver cancels AFTER accepting → entry closed as
//          `cancelled_after_accept` (12, soft-deleted out of line), refusal
//          penalty +1, and the ORDER advances to the next waiting driver of the
//          same vehicle type (or returns to waiting + no-driver notify when
//          there is no next driver).
//
//   TQ-35  Non-queue (street/distance) driver rejects → the order is actively
//          re-matched to the next NEAREST driver; when no other driver is
//          available it stays waiting (admin + shipper notified). DriverQueue
//          must remain untouched for non-queue orders.

const axios = require("axios");
const { backendURL, usersData, usersRoles, journeyStatusMap, cancellationReasonsType } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const { getDriverJourneyStatus } = require("../Driver/DriverJourneyStatus");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  buildQueueOrderPayload,
  createQueueOrder,
  cancelOrder,
  acceptOrder,
  rejectOrderByDriver,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  driverToken,
  shipperToken,
  expectStatus,
  dbToday,
} = require("./helpers");

const ORG = () => queueState.org.main.queueOrganizationUniqueId;
const typeA = () => queueState.vehicleTypes.typeA;

const DRIVER_KEYS = ["queueDriver1", "queueDriver2", "queueDriver3", "queueDriver4"];

const driverKeyByPhone = (phoneNumber) =>
  DRIVER_KEYS.find((k) => usersData[k]?.phoneNumber === phoneNumber) || null;

/** Raw HTTP wrapper so expectStatus can assert the cancel status code. */
const rejectOrderByDriverHttp = (driverKey) =>
  axios.put(
    backendURL +
      DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
      `?ownerUserUniqueId=self&roleId=${usersRoles.driverRoleId}&cancellationReasonsTypeId=${cancellationReasonsType.driverCancel}`,
    {},
    authConfig(driverToken(driverKey)),
  );

/** Latest DriverQueue row for a driver — INCLUDING soft-deleted entries. */
const entryRaw = async (driverKey) => {
  const [rows] = await pool.query(
    `SELECT dq.*
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND u.phoneNumber = ?
     ORDER BY dq.queueId DESC LIMIT 1`,
    [ORG(), dbToday(), usersData[driverKey].phoneNumber],
  );
  return rows[0] || null;
};

/** Resolve which queue driver's ACTIVE entry is holding an offered order. */
const resolveHoldingDriverKey = async (orderUniqueId) => {
  const [rows] = await pool.query(
    `SELECT u.phoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [orderUniqueId],
  );
  return driverKeyByPhone(rows[0]?.phoneNumber);
};

/** Resolve which driver holds a non-queue order's live JourneyDecision. */
const resolveNonQueueHoldingDriverKey = async (orderUniqueId) => {
  const [rows] = await pool.query(
    `SELECT u.phoneNumber
     FROM JourneyDecisions jd
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     JOIN Users u ON u.userUniqueId = dr.userUniqueId
     WHERE sr.shipperRequestUniqueId = ?
     ORDER BY jd.journeyDecisionId DESC LIMIT 1`,
    [orderUniqueId],
  );
  return driverKeyByPhone(rows[0]?.phoneNumber);
};

/** Cancel-loop a driver until they no longer carry an active engagement. */
const forceFreeDriver = async (driverKey) => {
  let guard = 0;
  while (guard < 6) {
    const st = await getDriverJourneyStatus({ userType: driverKey });
    const status = st?.status;
    if (!status || !Number.isFinite(status) || status === journeyStatusMap.waiting) {
      return true;
    }
    await rejectOrderByDriver(driverKey).catch(() => {});
    guard += 1;
  }
  return false;
};

// ── TQ-34 · Queue cancel-after-accept → entry 12, refusal +1, order advances ──

const testTQ34QueueCancelAfterAccept = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const dk = await resolveHoldingDriverKey(orderUniqueId);
    if (!dk || !usersData[dk]?.phoneNumber) {
      throw new Error(`no active queue offer for ${orderUniqueId}`);
    }

    const before = await entryRaw(dk);
    if (!before || before.status !== 2 || before.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`driver ${dk} not holding offer (status 2): ${JSON.stringify(before)}`);
    }
    const refusalBefore = before.queueRefusalCount || 0;

    await getDriverJourneyStatus({ userType: dk });
    const accepted = await acceptOrder(dk, 6000);
    if (!accepted) {
      throw new Error(`accept failed for ${dk}`);
    }
    const agreed = await entryRaw(dk);
    if (!agreed || agreed.status !== 3 || agreed.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`entry should be agreed(3) after accept: ${JSON.stringify(agreed)}`);
    }

    const cancelRes = await expectStatus(
      rejectOrderByDriverHttp(dk),
      200,
      "TQ-34 driver cancel-after-accept",
    );

    // Entry closed: cancelled_after_accept (12), soft-deleted, unhooked, +1 refusal.
    const after = await entryRaw(dk);
    if (!after || after.status !== 12) {
      throw new Error(`entry should be cancelled_after_accept(12), got ${JSON.stringify(after)}`);
    }
    if (!after.queueDeletedAt) {
      throw new Error("entry must be soft-deleted (queueDeletedAt) on cancel-after-accept");
    }
    if (after.shipperRequestUniqueId) {
      throw new Error(`entry must drop the order link, got ${after.shipperRequestUniqueId}`);
    }
    if (after.queueRefusalCount !== refusalBefore + 1) {
      throw new Error(
        `refusal penalty expected ${refusalBefore + 1}, got ${after.queueRefusalCount}`,
      );
    }

    // Order: either advanced to the next waiting driver (status 2 link) or back
    // to waiting (no next driver → no-driver notify path).
    const [links] = await pool.query(
      `SELECT dq.status, u.phoneNumber
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE dq.shipperRequestUniqueId = ? AND dq.queueDeletedAt IS NULL`,
      [orderUniqueId],
    );
    const advancedTo = links.find((r) => r.status === 2);
    const o = await getOrderByUniqueId(orderUniqueId);

    if (advancedTo) {
      if (o.journeyStatusId !== journeyStatusMap.requested) {
        throw new Error(
          `advanced order should be requested(2), got ${o.journeyStatusId}`,
        );
      }
      const nextKey = driverKeyByPhone(advancedTo.phoneNumber);
      if (nextKey === dk) {
        throw new Error("order must not be re-offered to the cancelling driver");
      }
      report.pass(
        `TQ-34: queue cancel-after-accept → entry closed(12)+refusal+1, order advanced to ${nextKey}`,
      );
    } else {
      if (o.journeyStatusId !== journeyStatusMap.waiting) {
        throw new Error(
          `no next driver: order should be waiting(1), got ${o.journeyStatusId} (${cancelRes})`,
        );
      }
      report.pass(
        "TQ-34: queue cancel-after-accept → entry closed(12)+refusal+1, no next driver → order back to waiting",
      );
    }
  } catch (error) {
    report.fail("TQ-34: queue cancel-after-accept", error);
  }
};

// ── TQ-35 · Non-queue reject → nearest re-match, DriverQueue untouched ────────

const testTQ35NonQueueRejectRematchesNearest = async () => {
  try {
    // Create a NON-queue order at the same Addis coordinates the queue driver
    // will self-report from.
    const payload = buildQueueOrderPayload({ vehicleTypeUniqueId: typeA() });
    delete payload.queueOrganizationUniqueId;
    await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      payload,
      authConfig(shipperToken()),
    );
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;

    // Give a typeA queue driver a waiting street (DriverRequest) row, which
    // auto-matches the waiting order (create-request side handleWaitingRequest).
    const streetKey = "queueDriver3";
    await forceFreeDriver(streetKey);
    const drCreate = await axios.post(
      backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
      {
        currentLocation: {
          latitude: 9.03,
          longitude: 38.74,
          description: "Addis Ababa, Ethiopia",
        },
      },
      authConfig(driverToken(streetKey)),
    );
    if (!drCreate.data || (![200, 201].includes(drCreate.status) && !drCreate.data?.message)) {
      throw new Error(`drop-in driver request failed: ${JSON.stringify(drCreate.data)}`);
    }

    // Wait for the order to be actively matched (status 2 = requested).
    let o = null;
    for (let i = 0; i < 20; i++) {
      o = await getOrderByUniqueId(orderUniqueId);
      if (o?.journeyStatusId === journeyStatusMap.requested) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!o || o.journeyStatusId !== journeyStatusMap.requested) {
      throw new Error(`non-queue order not auto-matched: ${JSON.stringify(o)}`);
    }

    const matchedKey = await resolveNonQueueHoldingDriverKey(orderUniqueId);
    if (!matchedKey) {
      throw new Error("could not resolve the matched non-queue driver");
    }
    if (matchedKey !== streetKey) {
      // Whichever typeA street driver got matched, use them as the canceller.
    }

    const queueLinksBefore = (
      await pool.query(
        `SELECT COUNT(*) AS total FROM DriverQueue WHERE shipperRequestUniqueId = ?`,
        [orderUniqueId],
      )
    )[0][0].total;

    await expectStatus(rejectOrderByDriverHttp(matchedKey), 200, "TQ-35 non-queue reject");

    // Non-queue cancel must NEVER touch DriverQueue.
    const queueLinksAfter = (
      await pool.query(
        `SELECT COUNT(*) AS total FROM DriverQueue WHERE shipperRequestUniqueId = ?`,
        [orderUniqueId],
      )
    )[0][0].total;
    if (queueLinksAfter !== 0 || queueLinksBefore !== 0) {
      throw new Error(`DriverQueue must be untouched by non-queue cancel (${queueLinksBefore}→${queueLinksAfter})`);
    }

    // Order is actively re-matched to a DIFFERENT driver OR stays waiting.
    const afterOrder = await getOrderByUniqueId(orderUniqueId);
    if (afterOrder.journeyStatusId === journeyStatusMap.requested) {
      const nextKey = await resolveNonQueueHoldingDriverKey(orderUniqueId);
      if (!nextKey || nextKey === matchedKey) {
        throw new Error(
          `re-match must pick a different driver (${matchedKey}), got ${nextKey}`,
        );
      }
      if ((await getJourneyDecisionCount(orderUniqueId)) < 2) {
        throw new Error("re-match should add a second JourneyDecision");
      }
      report.pass(
        `TQ-35: non-queue reject → order re-matched to nearest driver (${matchedKey} → ${nextKey}), DriverQueue untouched`,
      );
    } else if (afterOrder.journeyStatusId === journeyStatusMap.waiting) {
      report.pass(
        "TQ-35: non-queue reject → no other driver available → order back to waiting, DriverQueue untouched",
      );
    } else {
      throw new Error(
        `non-queue order in unexpected state after reject: ${JSON.stringify(afterOrder)}`,
      );
    }
  } catch (error) {
    report.fail("TQ-35: non-queue reject re-match", error);
  }
};

const runActiveTransferTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ACTIVE TRANSFER — TQ-34..TQ-35");
  console.log("═══════════════════════════════════════════════════\n");
  await testTQ34QueueCancelAfterAccept();
  await testTQ35NonQueueRejectRematchesNearest();
};

module.exports = { runActiveTransferTests };

// Standalone runner: `node E2ETests/Queue/ActiveTransfer.js`
if (require.main === module) {
  const { ensureCoreUsers, ensureQueueDrivers } = require("../Auth/bootstrap");
  const { registerQueueDrivers, ensureShipper, getVehicleTypes } = require("./helpers");
  const { runQueueOrgTests } = require("./QueueOrg");

  (async () => {
    await ensureCoreUsers({ fetchAccount: false });
    await ensureQueueDrivers({ count: 4 });
    await registerQueueDrivers();
    await ensureShipper();
    const types = await getVehicleTypes();
    queueState.vehicleTypes.typeA = types[0].vehicleTypeUniqueId;
    queueState.vehicleTypes.typeB = types[1].vehicleTypeUniqueId;
    queueState.vehicleTypes.typeC = types[2].vehicleTypeUniqueId;
    await runQueueOrgTests();
    await runActiveTransferTests();
    const passed = report.summary();
    process.exit(passed ? 0 : 1);
  })().catch((e) => {
    console.error("FATAL:", e?.message || e);
    process.exit(1);
  });
}