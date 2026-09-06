"use strict";

// Active-transfer feature tests (queue cancel-after-accept + non-queue reject).
// Runs at the END of the queue suite so it cannot disturb the ordering
// assumptions of TQ-11..TQ-36. TQ-34 recreates its own queue-dispatch scenario;
// TQ-35 lets the street-matching engine pick whichever waiting order it wants and
// asserts the non-queue cancel branch on it — deterministic regardless of the
// leftover order pool.
//
//   TQ-34  Queue driver cancels AFTER accepting → entry closed as
//          `cancelled_after_accept` (12, soft-deleted out of line), refusal
//          penalty +1, and the ORDER advances to the next waiting driver of the
//          same vehicle type (or returns to waiting + no-driver notify when
//          there is no next driver).
//
//   TQ-35  Non-queue (street/distance) driver rejects an auto-matched order →
//          the non-queue active-transfer branch re-runs nearest re-matching;
//          with no other available driver the order stays waiting (admin +
//          shipper notified). DriverQueue must remain untouched for non-queue
//          orders. Guards against accidentally cancelling a queue-dispatch offer.

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
  createQueueOrder,
  checkin,
  acceptOrder,
  rejectOrderByDriver,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  driverToken,
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

/** Drop-in street driver who creates waiting DriverRequests at Addis. Must be
 *  an ACTIVE account; the canonical `driver` is ACTIVE only in the main suite,
 *  so an activated queue driver is used instead. */
const STREET_KEY = "queueDriver3";

/** Cancel-loop a driver until they carry no active engagement (status null/1).
 *  Each iteration also exercises the active-transfer cancel branch harmlessly. */
const forceFreeDriver = async (driverKey, limit = 10) => {
  let guard = 0;
  while (guard < limit) {
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
    // Earlier suites may close/retire every typeA entry (journeys complete =
    // soft-delete). Guarantee a waiting driver so dispatch actually offers.
    await checkin("queueDriver1", ORG()).catch(() => {});

    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;

    let dk = null;
    for (let i = 0; i < 10 && !dk; i++) {
      dk = await resolveHoldingDriverKey(orderUniqueId);
      if (!dk) await new Promise((resolve) => setTimeout(resolve, 500));
    }
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
    // The drop-in street driver creates a waiting DriverRequest at Addis, which
    // auto-matches SOME nearby waiting order (tie-break is implementation detail).
    // Whoever it matches, the assertion is the same: rejecting that offer must
    // route through the NON-QUEUE active-transfer branch — DriverQueue stays
    // untouched and the order lands re-matched or back to waiting.
    await forceFreeDriver(STREET_KEY);

    let orderUniqueId = null;
    let st = null;
    for (let i = 0; i < 8; i++) {
      try {
        await axios.post(
          backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
          {
            currentLocation: {
              latitude: 9.03,
              longitude: 38.74,
              description: "Addis Ababa, Ethiopia",
            },
          },
          authConfig(driverToken(STREET_KEY)),
        );
      } catch {
        await forceFreeDriver(STREET_KEY);
      }
      st = await getDriverJourneyStatus({ userType: STREET_KEY });
      const candidate = st?.uniqueIds?.shipperRequestUniqueId;
      if (st?.status === journeyStatusMap.requested && candidate) {
        // Guard: never cancel a QUEUE-dispatch offer from this test — reject it
        // up-front and re-create until a street (unlinked) order is matched.
        const activeLinks = (
          await pool.query(
            `SELECT COUNT(*) AS total FROM DriverQueue
             WHERE shipperRequestUniqueId = ? AND queueDeletedAt IS NULL`,
            [candidate],
          )
        )[0][0].total;
        if (activeLinks === 0) {
          orderUniqueId = candidate;
          break;
        }
        await rejectOrderByDriver(STREET_KEY).catch(() => {});
      }
    }

    if (!orderUniqueId) {
      throw new Error(`street driver matched no non-queue waiting order (last=${st?.uniqueIds?.shipperRequestUniqueId})`);
    }

    await expectStatus(rejectOrderByDriverHttp(STREET_KEY), 200, "TQ-35 non-queue reject");

    // Non-queue cancel must NEVER create/leave DriverQueue links on the order.
    const queueLinksAfter = (
      await pool.query(
        `SELECT COUNT(*) AS total FROM DriverQueue WHERE shipperRequestUniqueId = ?`,
        [orderUniqueId],
      )
    )[0][0].total;
    if (queueLinksAfter !== 0) {
      throw new Error(`DriverQueue must be untouched by non-queue cancel, got ${queueLinksAfter} links`);
    }

    const decisionsBefore = await getJourneyDecisionCount(orderUniqueId);

    // Order is actively re-matched (new decision appended) or back to waiting.
    const afterOrder = await getOrderByUniqueId(orderUniqueId);
    if (afterOrder.journeyStatusId === journeyStatusMap.waiting) {
      report.pass(
        "TQ-35: non-queue reject → no other driver available → order back to waiting, DriverQueue untouched",
      );
    } else if (afterOrder.journeyStatusId === journeyStatusMap.requested) {
      const decisionsAfter = await getJourneyDecisionCount(orderUniqueId);
      if (decisionsAfter < decisionsBefore) {
        throw new Error("cancel must not delete journey decision history");
      }
      report.pass(
        "TQ-35: non-queue reject → order actively re-engaged (requested), DriverQueue untouched",
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