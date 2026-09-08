"use strict";

// Bid-base queue placement (QBB-01..04) — verifies that a queue order created
// with isBiddingApproved=TRUE:
//   QBB-01  is persisted with isBiddingApproved=TRUE;
//   QBB-02  is NOT FIFO-offered to the front waiting driver (stays waiting with
//           zero journey decisions, and the front driver has no 'requested'
//           decision for it);
//   QBB-03  validation rejects isBiddingApproved=TRUE without queueOrganizationUniqueId;
//   QBB-04  a normal queue order (no bid flag) IS FIFO-offered (regression guard).

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
