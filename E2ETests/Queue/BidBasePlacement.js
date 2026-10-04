"use strict";

// Bid-base queue placement (QBB-01..05) — verifies that a queue order created
// with isBiddingApproved=TRUE:
//   QBB-01  is persisted with isBiddingApproved=TRUE;
//   QBB-02  is NOT FIFO-offered to the front waiting driver (stays waiting with
//           zero journey decisions, and the front driver has no 'requested'
//           decision for it);
//   QBB-03  validation rejects isBiddingApproved=TRUE without queueOrganizationUniqueId;
//   QBB-04  a normal queue order (no bid flag) IS FIFO-offered (regression guard);
//   QBB-05  a bid winner who never held a queue row is AUTO-ENROLLED at accept
//           (entry created `agreed`, linked to the order, carrying a yard
//           loadingOrderNumber).

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData, journeyStatusMap } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { pool } = require("../../Middleware/Database.config");
const {
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  createQueueOrder,
  cancelOrder,
  checkin,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  dbToday,
  waitFor,
  expectStatus,
} = require("./helpers");

const shipperToken = () => usersData.shipper?.token;
const superAdminToken = () => usersData.supperAdmin?.token;

const ORG = () => queueState.bidBase.orgUniqueId;

const FRONT_DRIVER = "queueDriver1";

// A queue order is "FIFO-offered" when a JourneyDecision with status 'requested'
// points at it (the front driver was offered/requested the order).
const hasRequestedDecisionForOrder = async (orderUniqueId) => {
  const [rows] = await pool.query(
    `SELECT jd.journeyDecisionUniqueId
     FROM JourneyDecisions jd
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     JOIN Users u ON u.userUniqueId = dr.userUniqueId
     WHERE sr.shipperRequestUniqueId = ?
       AND u.phoneNumber = ?
       AND jd.journeyStatusId = ?`,
    [orderUniqueId, usersData[FRONT_DRIVER].phoneNumber, journeyStatusMap.requested],
  );
  return rows.length > 0;
};

const testQBB01PersistBidFlag = async () => {
  try {
    const { isBiddingApproved } = await getOrderByUniqueId(queueState.bidBase.orderUniqueId);
    if (isBiddingApproved !== 1 && isBiddingApproved !== true) {
      throw new Error(`expected isBiddingApproved TRUE(1), got ${isBiddingApproved}`);
    }
    report.pass("QBB-01: bid-base order persisted with isBiddingApproved=TRUE");
  } catch (error) {
    report.fail("QBB-01: persist bid flag", error);
  }
};

const testQBB02NoFifoOffer = async () => {
  try {
    const { orderUniqueId } = queueState.bidBase;
    const order = await getOrderByUniqueId(orderUniqueId);
    if (order.journeyStatusId !== journeyStatusMap.waiting) {
      throw new Error(`bid-base order should stay waiting(1), got ${order.journeyStatusId}`);
    }
    if ((await getJourneyDecisionCount(orderUniqueId)) !== 0) {
      throw new Error("bid-base order should have ZERO journey decisions (no FIFO offer)");
    }
    const frontRequested = await hasRequestedDecisionForOrder(orderUniqueId);
    if (frontRequested) {
      throw new Error("front queue driver should NOT have been offered the bid-base order");
    }
    report.pass("QBB-02: bid-base order NOT FIFO-offered (stays waiting, front driver untouched)");
  } catch (error) {
    report.fail("QBB-02: no FIFO offer for bid-base order", error);
  }
};

const testQBB03ValidationGuard = async () => {
  try {
    const pay = {
      shipperRequestBatchUniqueId: uuidv4(),
      numberOfVehicles: 1,
      isBiddingApproved: true,
      requestMode: "individual_target",
      originLocation: { latitude: 9.03, longitude: 38.74 },
      destination: { latitude: 8.54, longitude: 39.27 },
      shippingCost: 6000,
      shippingDate: new Date().toISOString(),
      deliveryDate: new Date(Date.now() + 3 * 864e5).toISOString(),
      vehicle: { vehicleTypeUniqueId: queueState.vehicleTypes.typeA },
    };
    await expectStatus(
      axios.post(
        backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
        pay,
        authConfig(shipperToken()),
      ),
      400,
      "QBB-03 bid-flag-without-org",
    );
    report.pass("QBB-03: isBiddingApproved without queueOrganizationUniqueId rejected (400)");
  } catch (error) {
    report.fail("QBB-03: validation guard", error);
  }
};

const testQBB04NormalOrderStillFifo = async () => {
  try {
    const org = ORG();
    await createQueueOrder({
      queueOrganizationUniqueId: org,
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
    });
    const [latest] = await getLatestOrders(1);
    const order = await getOrderByUniqueId(latest.shipperRequestUniqueId);
    if (order.journeyStatusId !== journeyStatusMap.requested) {
      const msg = `normal queue order should be FIFO-offered (requested=2), got ${order.journeyStatusId}`;
      if (order.journeyStatusId === journeyStatusMap.waiting) {
        throw new Error(`${msg} — front driver may be absent; order not offered`);
      }
      throw new Error(msg);
    }
    report.pass("QBB-04: normal queue order still FIFO-offered (requested)");
  } catch (error) {
    report.fail("QBB-04: normal FIFO regression guard", error);
  }
};

// ── QBB-05 ───────────────────────────────────────────────────────────────────
// A bid winner who NEVER held a queue row is auto-enrolled at accept and still
// receives the yard loadingOrderNumber.
//
// Strictly ordered, and every step asserts the state the next step depends on:
//   1. create the bid-base order and WAIT until the distance matcher has really
//      offered it (the matcher runs after the order is written);
//   2. from the drivers it selected, take one that provably holds NO live queue
//      entry in this org — that is the case under test;
//   3. accept that bid;
//   4. WAIT for the auto-enrolled yard row, then check agreed + linked + number.
//
// The winner is chosen from the matcher's own selection rather than a
// hard-coded driver: matching is capped at the 5 nearest drivers, and every
// earlier test run leaves drivers parked on the same seeded coordinates, so a
// fixed driver is regularly squeezed out of the cap. The assertion that matters
// — the winner has no queue row and is auto-enrolled at accept — still holds.
const testQBB05AutoEnrollBidWinner = async ({ queueOrganizationUniqueId }) => {
  // 1. Bid-base order at the DEFAULT origin so the distance matcher reaches the
  //    seeded drivers (the far-origin order used by QBB-02 matches nobody).
  await createQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: queueState.drivers.queueDriver1.vehicleTypeUniqueId,
    isBiddingApproved: true,
  });
  const [latest] = await getLatestOrders(1);
  const orderUniqueId = latest.shipperRequestUniqueId;

  // Wait for the matcher to hand the order to somebody.
  const offered = await waitFor(
    async () => {
      const [rows] = await pool.query(
        `SELECT dr.driverRequestUniqueId,
                jd.journeyDecisionUniqueId,
                vd.driverUserUniqueId,
                u.phoneNumber,
                dq.queueUniqueId
           FROM JourneyDecisions jd
           JOIN DriverRequest dr  ON dr.driverRequestId = jd.driverRequestId
           JOIN Users u           ON u.userUniqueId    = dr.userUniqueId
           JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
           JOIN VehicleDriver vd
                 ON vd.driverUserUniqueId = u.userUniqueId
                AND vd.assignmentStatus = 'active'
           LEFT JOIN DriverQueue dq
                  ON dq.vehicleDriverUniqueId = vd.vehicleDriverUniqueId
                 AND dq.queueOrganizationUniqueId = ?
                 AND dq.queueDate = ?
                 AND dq.queueDeletedAt IS NULL
          WHERE sr.shipperRequestUniqueId = ?
            AND jd.journeyStatusId = ?`,
        [
          queueOrganizationUniqueId,
          dbToday(),
          orderUniqueId,
          journeyStatusMap.requested,
        ],
      );
      return rows.length ? rows : null;
    },
    { label: "distance matcher to offer the bid-base order" },
  );
  console.log(`   ↪ matcher offered the order to ${offered.length} driver(s)`);

  // 2. The case under test: a winner with NO live queue entry in this org.
  const winner = offered.find((d) => !d.queueUniqueId) || offered[0];
  if (winner.queueUniqueId) {
    throw new Error(
      `QBB-05: every offered driver already holds a live queue entry (${offered.length} offered) — cannot test the no-row path`,
    );
  }
  console.log(`   ↪ testing winner ${winner.phoneNumber} (no queue row, status requested)`);

  // 3. Accept the bid.
  await axios.put(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_OFFER,
    {
      driverRequestUniqueId: winner.driverRequestUniqueId,
      journeyDecisionUniqueId: winner.journeyDecisionUniqueId,
      shipperRequestUniqueId: orderUniqueId,
    },
    authConfig(shipperToken()),
  );

  // 4. Wait for the auto-enrolled yard row.
  const entry = await waitFor(
    async () => {
      const [rows] = await pool.query(
        `SELECT dq.status, dq.shipperRequestUniqueId, dq.loadingOrderNumber
           FROM DriverQueue dq
           JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
          WHERE dq.queueOrganizationUniqueId = ?
            AND dq.queueDate = ?
            AND vd.driverUserUniqueId = ?
            AND dq.queueDeletedAt IS NULL
          ORDER BY dq.queueId DESC
          LIMIT 1`,
        [queueOrganizationUniqueId, dbToday(), winner.driverUserUniqueId],
      );
      return rows[0] || null;
    },
    { label: `${winner.phoneNumber} auto-enrolled into the yard` },
  );

  if (entry.status !== journeyStatusMap.acceptedByDriver) {
    throw new Error(
      `QBB-05: auto-enrolled entry should be agreed(3), got ${entry.status}`,
    );
  }
  if (entry.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error(
      `QBB-05: auto-enrolled entry should carry the order linkage, got ${entry.shipperRequestUniqueId}`,
    );
  }
  if (entry.loadingOrderNumber === null || entry.loadingOrderNumber === undefined) {
    throw new Error(
      "QBB-05: auto-enrolled entry has no loadingOrderNumber — the yard cannot number this truck",
    );
  }

  report.pass(
    `QBB-05: bid winner without a queue row auto-enrolled (agreed, loadingOrderNumber=${entry.loadingOrderNumber})`,
  );
  return orderUniqueId;
};

const cleanup = async () => {
  const { orderUniqueId } = queueState.bidBase || {};
  if (orderUniqueId) {
    try {
      await cancelOrder({ orderUniqueId, cancelAs: "admin" });
    } catch (error) {
      console.log(`  ⚠ QBB cleanup (cancel bid order) skipped: ${error?.message || error}`);
    }
  }
  const org = ORG();
  if (org) {
    try {
      await deleteQueueOrganization(org);
      console.log("  ✅ QBB throwaway org cleaned up");
    } catch (error) {
      console.log(`  ⚠ QBB cleanup (delete org) skipped: ${error?.message || error}`);
    }
  }
};

const runBidBasePlacementTests = async () => {
  console.log("───── Bid-base placement (QBB) ─────");
  try {
    // Fresh throwaway org so the main suite's state machine is untouched.
    const org = await createQueueOrganization(
      `QBB-org-${Date.now()}`,
      superAdminToken(),
    );
    const queueOrganizationUniqueId = org.queueOrganizationUniqueId || org?.data?.queueOrganizationUniqueId;
    queueState.bidBase.orgUniqueId = queueOrganizationUniqueId;

    await approveQueueOrganization({
      queueOrganizationUniqueId,
      approvalStatus: "approved",
      queueEnabled: true,
      token: superAdminToken(),
    });

    // Check in the front driver so there is a waiting candidate FIFO would grab.
    await checkin(FRONT_DRIVER, queueOrganizationUniqueId);

    // Create a BID-BASE queue order with an origin FAR from all drivers so
    // distance matching finds no candidate. If the order were offered at all it
    // could ONLY be via FIFO (the front driver is checked in) — so zero decisions
    // here proves the FIFO skip (QBB-02).
    await createQueueOrder({
      queueOrganizationUniqueId,
      vehicleTypeUniqueId: queueState.drivers[FRONT_DRIVER].vehicleTypeUniqueId,
      isBiddingApproved: true,
      origin: { latitude: 14.14, longitude: 38.97, description: "Mekelle (far)" },
    });
    const [latest] = await getLatestOrders(1);
    queueState.bidBase.orderUniqueId = latest.shipperRequestUniqueId;

    await testQBB01PersistBidFlag();
    await testQBB02NoFifoOffer();
    await testQBB03ValidationGuard();
    await testQBB04NormalOrderStillFifo();

    // QBB-05 needs its own order near the drivers (the QBB-02 order is far away
    // on purpose), so it runs last and cleans up after itself.
    let autoEnrolledOrderUniqueId = null;
    try {
      autoEnrolledOrderUniqueId = await testQBB05AutoEnrollBidWinner({
        queueOrganizationUniqueId,
      });
    } catch (error) {
      report.fail("QBB-05: auto-enroll a bid winner with no queue row", error);
    }
    if (autoEnrolledOrderUniqueId) {
      try {
        await cancelOrder({
          orderUniqueId: autoEnrolledOrderUniqueId,
          cancelAs: "admin",
        });
      } catch (error) {
        console.log(
          `  ⚠ QBB-05 cleanup (cancel auto-enrolled order) skipped: ${error?.message || error}`,
        );
      }
    }

    // Clean up the normal FIFO order too (it is requested by the front driver).
    try {
      const [extra] = await getLatestOrders(1);
      if (extra && extra.shipperRequestUniqueId !== queueState.bidBase.orderUniqueId) {
        await cancelOrder({ orderUniqueId: extra.shipperRequestUniqueId, cancelAs: "admin" });
      }
    } catch (error) {
      console.log(`  ⚠ QBB cleanup (cancel normal order) skipped: ${error?.message || error}`);
    }
  } catch (error) {
    report.fail("QBB setup: bid-base placement", error);
  } finally {
    await cleanup();
    queueState.bidBase.orgUniqueId = null;
  }
};

module.exports = { runBidBasePlacementTests };

if (require.main === module) {
  (async () => {
    try {
      await runBidBasePlacementTests();
      process.exit(report.summary() ? 0 : 1);
    } catch (error) {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    }
  })();
}
