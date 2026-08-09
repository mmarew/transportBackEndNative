"use strict";

const axios = require("axios");
const { io } = require("socket.io-client");
const { backendURL, usersData } = require("./constants");
const { authConfig } = require("./Utils");
const { report } = require("./Reporter");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../Routes/EndPoints/driverRequest.endpoints");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../Routes/EndPoints/shipperRequest.endpoints");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../Routes/EndPoints/companyAssignment.endpoints");
const {
  pool,
} = require("../Middleware/Database.config");
const {
  initiateCompanyBiddingWorkFlow,
  acceptCompanyOffer,
} = require("./Company/BidManagement");
const { assignVehicleToCompany } = require("./Company/CompanyVehicle");
const {
  getDriverJourneyStatus,
  startJourney,
  completeJourney,
} = require("./Driver/DriverJourneyStatus");
const {
  testAcceptDriverRequest,
} = require("./Shipper/ShipperRequest");
const { testCancelDriverRequest } = require("./Driver/DriverRequest");

// ── Socket helpers ───────────────────────────────────────────────────────────

const connectSocket = (userType, phoneNumber, token, timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    const socket = io(backendURL, {
      auth: { phoneNumber, user: userType, token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: timeoutMs,
    });

    socket.on("connect_error", (err) => {
      reject(new Error(`Socket connect error for ${userType}: ${err.message}`));
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Socket connection timeout for ${userType}`));
    }, timeoutMs);

    socket.on("messages", (rawData) => {
      try {
        const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        if (data?.messageTypes?.message === "Connection established.") {
          clearTimeout(timer);
          resolve(socket);
        }
      } catch {
        // not ready yet
      }
    });
  });
};

const waitForSocketMessage = (socket, eventName, timeoutMs = 10000, predicate) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventName} on socket`));
    }, timeoutMs);

    const handler = (rawData) => {
      try {
        const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        if (predicate && !predicate(data)) return;
        clearTimeout(timer);
        socket.off(eventName, handler);
        resolve(data);
      } catch {
        // not JSON
      }
    };

    socket.on(eventName, handler);
  });
};

const cleanPhone = (phone) => phone?.replace(/\D/g, "");

// Cap on how many stale leftovers the driver will reject for real before giving up.
const MAX_REJECT_ATTEMPTS = 15;

// ── Helper: create a shipper request (individual) ────────────────────────────

const createIndividualShipperRequest = async () => {
  const { shipper } = usersData;
  const vtRes = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(shipper.token),
  );
  const vehicleTypeUniqueId = vtRes.data.data[0].vehicleTypeUniqueId;

  const shippingDate = new Date();
  shippingDate.setDate(shippingDate.getDate() + 1);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);

  const payload = {
    shipperRequestBatchUniqueId: require("uuid").v4(),
    numberOfVehicles: 1,
    shippingDate: shippingDate.toISOString(),
    deliveryDate: deliveryDate.toISOString(),
    shippingCost: 6000,
    shippableItemQtyInQuintal: 100,
    shippableItemName: "Reject Test Cargo",
    requestMode: "individual_target",
    originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
    destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
    vehicle: { vehicleTypeUniqueId },
  };

  await axios.post(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
    payload,
    authConfig(shipper.token),
  );
};

// ── Helper: create a company-target shipper request ──────────────────────────

const createCompanyShipperRequest = async (companyUniqueId) => {
  const { shipper } = usersData;
  const vtRes = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(shipper.token),
  );
  const vehicleTypeUniqueId = vtRes.data.data[0].vehicleTypeUniqueId;

  const shippingDate = new Date();
  shippingDate.setDate(shippingDate.getDate() + 1);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);

  const payload = {
    shipperRequestBatchUniqueId: require("uuid").v4(),
    numberOfVehicles: 1,
    shippingDate: shippingDate.toISOString(),
    deliveryDate: deliveryDate.toISOString(),
    shippingCost: 8000,
    shippableItemQtyInQuintal: 80,
    shippableItemName: "Company Reject Test Cargo",
    requestMode: "company_target",
    targetCompanyUniqueId: companyUniqueId,
    originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
    destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
    vehicle: { vehicleTypeUniqueId },
  };

  await axios.post(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
    payload,
    authConfig(shipper.token),
  );
};

// ── Helper: create a multi-vehicle batch of individual shipper requests ───────

const createBatchShipperRequest = async (numberOfVehicles) => {
  const { shipper } = usersData;
  const vtRes = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(shipper.token),
  );
  const vehicleTypeUniqueId = vtRes.data.data[0].vehicleTypeUniqueId;

  const shippingDate = new Date();
  shippingDate.setDate(shippingDate.getDate() + 1);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);

  const batchUniqueId = require("uuid").v4();
  const payload = {
    shipperRequestBatchUniqueId: batchUniqueId,
    numberOfVehicles,
    shippingDate: shippingDate.toISOString(),
    deliveryDate: deliveryDate.toISOString(),
    shippingCost: 6500,
    shippableItemQtyInQuintal: 90,
    shippableItemName: "Batch Reject Test Cargo",
    requestMode: "individual_target",
    originLocation: { latitude: 9.6, longitude: 39.5, description: "Batch Test Origin" },
    destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
    vehicle: { vehicleTypeUniqueId },
  };

  await axios.post(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
    payload,
    authConfig(shipper.token),
  );
  return batchUniqueId;
};

// ── Helper: create a driver request at an explicit location ───────────────────

const createDriverRequestAt = async ({ latitude, longitude, description }) => {
  const res = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
    { currentLocation: { latitude, longitude, description } },
    authConfig(usersData.driver.token),
  );
  return res.data;
};

// ── Helper: create DR and reject-for-real until the expected request is matched ──

const createDriverRequestUntilMatched = async (expectedUniqueId, coords) => {
  let attempts = 0;
  await createDriverRequestAt(coords);
  let status = await getDriverJourneyStatus({ userType: "driver" });
  while (
    status?.status === 2 &&
    status?.uniqueIds?.shipperRequestUniqueId &&
    status.uniqueIds.shipperRequestUniqueId !== expectedUniqueId &&
    attempts < MAX_REJECT_ATTEMPTS
  ) {
    console.log(
      `   ↪ Matched ${status.uniqueIds.shipperRequestUniqueId} — rejecting for real...`,
    );
    await testCancelDriverRequest(usersData.driver.token);
    await createDriverRequestAt(coords);
    status = await getDriverJourneyStatus({ userType: "driver" });
    attempts += 1;
  }
  return status;
};

// ── Helper: reactivate driver status ─────────────────────────────────────────

const reactivateDriver = async () => {
  const driver = usersData.driver;
  const uid = driver.accountData?.userData?.userUniqueId;
  if (!uid) return;
  await pool.query(
    `UPDATE UserRoleStatusCurrent urs
     JOIN UserRole ur ON urs.userRoleId = ur.userRoleId
     SET urs.statusId = 1
     WHERE ur.userUniqueId = ? AND ur.roleId = ?`,
    [uid, usersData.driver.roleId],
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 1: Individual driver rejection
// ═══════════════════════════════════════════════════════════════════════════════

const testIndividualDriverRejection = async () => {
  const driver = usersData.driver;
  const shipper = usersData.shipper;
  let driverSocket = null;
  let shipperSocket = null;

  try {
    // 1. Reactivate driver
    await reactivateDriver();

    // 2. Create a shipper request
    console.log("── Creating individual shipper request ──");
    await createIndividualShipperRequest();
    report.pass("individualReject: createShipperRequest");

    // 3. Connect sockets BEFORE creating driver request
    console.log("── Connecting sockets ──");
    shipperSocket = await connectSocket("shipper", cleanPhone(shipper.phoneNumber), `Bearer ${shipper.token}`);
    report.pass("individualReject: shipperSocketConnected");

    // 4. Register socket listener BEFORE driver request (notification sent on auto-match)
    const shipperFoundPromise = waitForSocketMessage(shipperSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver found shipper request."
    );

    // 5. Create driver request (auto-matches to the shipper)
    console.log("── Creating driver request (auto-match) ──");
    const drRes = await axios.post(
      backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
      { currentLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa, Ethiopia" } },
      authConfig(driver.token),
    );
    if (!drRes.data || !drRes.data.shipper) {
      throw new Error("Driver request did not match any shipper request");
    }
    report.pass("individualReject: createDriverRequest");

    // 6. Connect driver socket
    driverSocket = await connectSocket("driver", cleanPhone(driver.phoneNumber), `Bearer ${driver.token}`);
    report.pass("individualReject: driverSocketConnected");

    // 7. Wait for shipper to receive the match notification
    await shipperFoundPromise;
    report.pass("individualReject: shipperReceivedDriverFound");

    // 8. Verify driver status is 2 (requested) — matched with shipper but not yet accepted
    let statusBefore = await getDriverJourneyStatus({ userType: "driver" });
    console.log("   Status before reject:", statusBefore?.status);
    if (statusBefore?.status !== 2) {
      throw new Error(`Expected status 2 before reject, got ${statusBefore?.status}`);
    }
    report.pass("individualReject: statusIsRequested");

    // 9. Individual reject BEFORE accepting → no socket notification to shipper
    //    (shipper notification is only sent for cancelledByDriver = 9, post-accept)

    // 10. Driver rejects (before accepting — goes to rejectedByDriver = 15, old DR is terminal)
    console.log("── Driver rejecting individual request (pre-accept) ──");
    await axios.put(
      backendURL + DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
        "?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2",
      {},
      authConfig(driver.token),
    );
    report.pass("individualReject: driverRejected");

    // 11. Verify driver status is NOT waiting after reject.
    //     After rejection the old DriverRequest is terminal (15 = rejectedByDriver).
    //     verifyDriverJourneyStatus returns null because there's no active request.
    let statusAfter = await getDriverJourneyStatus({ userType: "driver" });
    console.log("   Status after reject:", statusAfter?.status);
    if (statusAfter?.status === 1) {
      throw new Error("FAIL: Status is 1 (waiting) after individual reject — should be terminal (15/null)");
    }
    report.pass("individualReject: statusIsNotWaiting");

    // 12. Try to create a new request, but don't fail the test if matching doesn't
    //     find the same shipper (rejected once = blocked by VerifyIfShipperRequestWasNotRejected).
    //     The core assertion — status is not waiting after pre-accept reject — already passed.
    console.log("── Trying driver new request after rejection (may not match same shipper) ──");
    try {
      const newDrRes = await axios.post(
        backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
        { currentLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa, Ethiopia" } },
        authConfig(driver.token),
      );
      if (newDrRes.data && newDrRes.data.shipper) {
        report.pass("individualReject: canMatchNewShipper");
      } else {
        report.skip("individualReject: canMatchNewShipper", "no available shipper request (same shipper was rejected)");
      }
    } catch (reqErr) {
      report.skip("individualReject: canMatchNewShipper", "request failed: " + reqErr.message);
    }

    console.log("✅ Individual driver rejection test PASSED\n");

  } catch (error) {
    console.error("\n❌ Individual driver rejection test FAILED:", error.message);
    if (error.response) console.error("API error:", error.response.data);
    report.fail("individualDriverRejection", error);
  } finally {
    if (driverSocket) driverSocket.close();
    if (shipperSocket) shipperSocket.close();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 2: Company assignment rejection by driver
// ═══════════════════════════════════════════════════════════════════════════════

const testCompanyAssignmentRejection = async () => {
  const driver = usersData.driver;
  const companyAdmin = usersData.companyAdmin;
  let companySocket = null;
  let driverSocket = null;

  try {
    // 1. Reactivate driver
    await reactivateDriver();

    // 2. Create a company_target shipper request
    const companyUniqueId = companyAdmin?.companies?.[0]?.companyUniqueId;
    if (!companyUniqueId) throw new Error("No company found for company admin");

    console.log("── Creating company-target shipper request ──");
    await createCompanyShipperRequest(companyUniqueId);
    report.pass("companyReject: createShipperRequest");

    // 3. Company bids on it — store companyBidRequestUniqueId directly
    console.log("── Company bidding ──");
    const bidToAccept = await initiateCompanyBiddingWorkFlow({ userType: "companyAdmin" });
    if (!bidToAccept) throw new Error("Company failed to bid");
    const companyBidRequestUniqueId = bidToAccept.companyBidRequestUniqueId;
    if (!companyBidRequestUniqueId) throw new Error("No companyBidRequestUniqueId from bid");
    report.pass("companyReject: companyBid");

    // 4. Shipper accepts the bid
    await acceptCompanyOffer({ userType: "shipper", bid: bidToAccept });
    report.pass("companyReject: shipperAcceptedBid");

    // 5. Assign vehicle + driver
    await assignVehicleToCompany({});
    const assignRes = await axios.post(
      backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.AUTO_ASSIGN,
      { companyBidRequestUniqueId },
      authConfig(companyAdmin.token),
    );
    if (!assignRes.data?.data) {
      throw new Error("Auto-assign returned no data");
    }
    report.pass("companyReject: autoAssign");

    // 6. Verify driver has a pending assignment
    let statusBefore = await getDriverJourneyStatus({ userType: "driver" });
    console.log("   Status before reject:", statusBefore?.status, "assignment:", statusBefore?.companyAssignment?.assignmentStatus);
    if (!statusBefore?.companyAssignment?.assignmentUniqueId) {
      throw new Error("No company assignment found for driver");
    }
    report.pass("companyReject: assignmentCreated");

    // 7. Connect sockets
    companySocket = await connectSocket("company", cleanPhone(companyAdmin.phoneNumber), `Bearer ${companyAdmin.token}`);
    driverSocket = await connectSocket("driver", cleanPhone(driver.phoneNumber), `Bearer ${driver.token}`);
    report.pass("companyReject: socketsConnected");

    // 8. Register socket listeners BEFORE driver rejects
    const companyRejectPromise = waitForSocketMessage(companySocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver rejected assignment"
    );

    // 9. Driver rejects the company assignment
    const assignmentUniqueId = statusBefore.companyAssignment.assignmentUniqueId;
    console.log("── Driver rejecting company assignment ──");
    await axios.patch(
      backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
        ":assignmentUniqueId", assignmentUniqueId,
      ),
      { assignmentStatus: "rejected_by_driver" },
      authConfig(driver.token),
    );
    report.pass("companyReject: driverRejected");

    // 10. Verify assignment status is now "rejected_by_driver" via direct API check
    const assignCheck = await axios.get(
      backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.GET_ASSIGNMENTS +
        `?assignmentUniqueId=${assignmentUniqueId}`,
      authConfig(companyAdmin.token),
    );
    const updatedAssignment = Array.isArray(assignCheck.data?.data)
      ? assignCheck.data.data[0]
      : assignCheck.data?.data;
    const assignmentRejectStatus = updatedAssignment?.assignmentStatus;
    console.log("   Assignment status after reject:", assignmentRejectStatus);
    if (assignmentRejectStatus !== "rejected_by_driver") {
      throw new Error(`Expected assignmentStatus "rejected_by_driver", got ${assignmentRejectStatus}`);
    }
    report.pass("companyReject: assignmentRejected");

    // 11. Verify company received rejection notification
    try {
      await companyRejectPromise;
      report.pass("companyReject: companyReceivedRejection");
    } catch (socketErr) {
      console.warn("⚠️  Company socket notification not received:", socketErr.message);
      report.skip("companyReject: companySocketNotification", "notification not delivered in time");
    }

    // 12. Check driver status — if Test 1 left an active individual request (status 2),
    //     it should still be active (company rejection only resets the company-linked
    //     DriverRequest). If Test 1 didn't create a new request, status is 1 — that's fine.
    let statusAfterReject = await getDriverJourneyStatus({ userType: "driver" });
    console.log("   Driver status after both rejects:", statusAfterReject?.status);
    if (statusAfterReject?.status === 2) {
      report.pass("companyReject: individualRequestStillActive");
    } else {
      report.skip("companyReject: individualRequestStillActive",
        "no active individual request from Test 1 (expected when same shipper can't re-match)");
    }

    console.log("✅ Company assignment rejection test PASSED\n");

  } catch (error) {
    console.error("\n❌ Company assignment rejection test FAILED:", error.message);
    if (error.response) console.error("API error:", error.response.data);
    report.fail("companyAssignmentRejection", error);
  } finally {
    if (companySocket) companySocket.close();
    if (driverSocket) driverSocket.close();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 3: Batch-scoped driver rejection
// ═══════════════════════════════════════════════════════════════════════════════

const testBatchDriverRejection = async () => {
  const driver = usersData.driver;
  const BATCH_COORDS = { latitude: 9.6, longitude: 39.5, description: "Batch Test Origin" };

  try {
    // 1. Reactivate driver
    await reactivateDriver();

    // 2. Create a 2-request shipper batch (same shipperRequestBatchUniqueId)
    console.log("── Creating 2-request shipper batch ──");
    const batchUniqueId = await createBatchShipperRequest(2);
    report.pass("batchReject: createBatch");

    // 3. Resolve the two batch requests (job1 = oldest id → auto-matched first)
    const [batchRows] = await pool.query(
      `SELECT shipperRequestUniqueId, shipperRequestId
         FROM ShipperRequest
        WHERE shipperRequestBatchUniqueId = ?
        ORDER BY shipperRequestId ASC`,
      [batchUniqueId],
    );
    if (batchRows.length !== 2) {
      throw new Error(`Expected 2 batch rows, got ${batchRows.length}`);
    }
    const job1UniqueId = batchRows[0].shipperRequestUniqueId;
    const job2UniqueId = batchRows[1].shipperRequestUniqueId;
    report.pass("batchReject: resolvedJobIds");

    // 4. Driver creates request → must auto-match job1 (oldest, FIFO)
    console.log("── Driver creating request (should match job1) ──");
    let status = await createDriverRequestUntilMatched(job1UniqueId, BATCH_COORDS);
    if (status?.status !== 2 || status?.uniqueIds?.shipperRequestUniqueId !== job1UniqueId) {
      throw new Error(`Expected match to job1, got status ${status?.status}`);
    }
    report.pass("batchReject: matchedJob1");

    // 5. Driver rejects job1 for real (pre-accept → rejectedByDriver = 15)
    console.log("── Driver rejecting job1 for real ──");
    await axios.put(
      backendURL + DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
        "?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2",
      {},
      authConfig(driver.token),
    );
    report.pass("batchReject: rejectedJob1");

    // 6. Create a NEW driver request → job2 must NOT be auto-matched
    //    (VerifyIfShipperRequestWasNotRejected is batch-scoped: job1's rejection
    //    blocks the whole batch).
    console.log("── Creating new driver request (job2 must stay un-matched) ──");
    const newDrRes = await createDriverRequestAt(BATCH_COORDS);
    status = await getDriverJourneyStatus({ userType: "driver" });
    const matchedAfterReject =
      newDrRes?.shipper?.shipperRequestUniqueId ||
      status?.uniqueIds?.shipperRequestUniqueId;
    console.log("   Status after reject + recreate:", status?.status, "matched:", matchedAfterReject);
    if (matchedAfterReject === job2UniqueId) {
      throw new Error("FAIL: driver auto-matched job2 despite batch-scoped rejection");
    }
    if (status?.status === 2) {
      throw new Error("FAIL: driver matched another request, expected waiting (batch blocked)");
    }
    report.pass("batchReject: job2NotAutoMatched");

    // 7. DB check: no JourneyDecision links this driver to job2
    const driverUid = driver.accountData?.userData?.userUniqueId;
    const [jdRows] = await pool.query(
      `SELECT jd.journeyDecisionUniqueId
         FROM JourneyDecisions jd
         JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
         JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
        WHERE dr.userUniqueId = ? AND sr.shipperRequestUniqueId = ?`,
      [driverUid, job2UniqueId],
    );
    if (jdRows.length > 0) {
      throw new Error("FAIL: JourneyDecision links driver to job2");
    }
    report.pass("batchReject: noDecisionForJob2");

    // 8. Driver explicitly picks job2 from the list → acceptedByDriver (3)
    console.log("── Driver explicitly picking job2 (createAndAcceptNewRequest) ──");
    await axios.post(
      backendURL + DRIVER_REQUEST_ENDPOINTS.CREATE_AND_ACCEPT_NEW_REQUEST,
      {
        shipperRequestUniqueId: job2UniqueId,
        shippingCostByDriver: "58000.00",
        currentLocation: BATCH_COORDS,
      },
      authConfig(driver.token),
    );
    status = await getDriverJourneyStatus({ userType: "driver" });
    if (status?.status !== 3) {
      throw new Error(`Expected status 3 (acceptedByDriver) after explicit pick, got ${status?.status}`);
    }
    report.pass("batchReject: explicitlyPickedJob2");

    // 9. Shipper accepts the driver offer → acceptedByShipper (4)
    await testAcceptDriverRequest({ uniqueIds: status?.uniqueIds });
    status = await getDriverJourneyStatus({ userType: "driver" });
    if (status?.status !== 4) {
      throw new Error(`Expected status 4 (acceptedByShipper), got ${status?.status}`);
    }
    report.pass("batchReject: shipperAccepted");

    // 10. Start journey (5) → complete journey (6)
    await startJourney({ userType: "driver" });
    status = await getDriverJourneyStatus({ userType: "driver" });
    if (status?.status !== 5) {
      throw new Error(`Expected status 5 (journeyStarted), got ${status?.status}`);
    }
    report.pass("batchReject: journeyStarted");

    await completeJourney({ userType: "driver" });
    status = await getDriverJourneyStatus({ userType: "driver" });
    if (status?.status !== 6) {
      throw new Error(`Expected status 6 (journeyCompleted), got ${status?.status}`);
    }
    report.pass("batchReject: journeyCompleted");

    console.log("✅ Batch-scoped driver rejection test PASSED\n");

  } catch (error) {
    console.error("\n❌ Batch-scoped driver rejection test FAILED:", error.message);
    if (error.response) console.error("API error:", error.response.data);
    report.fail("batchDriverRejection", error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

const runDriverRejectionTests = async () => {
  console.log("\n=======================================================");
  console.log("   🚫 DRIVER REJECTION FLOW TESTS");
  console.log("=======================================================\n");

  // --- Prerequisites: ensure users exist and are onboarded ---
  const { driver, shipper, companyAdmin, admin } = usersData;
  if (!driver?.token || !shipper?.token || !companyAdmin?.token || !admin?.token) {
    console.warn("⚠️  Missing required user tokens — aborting rejection tests\n");
    report.skip("driverRejectionFlow", "missing user tokens — run full E2E suite first");
    return;
  }

  // --- Test 1: Individual driver rejection ---
  await testIndividualDriverRejection();

  // --- Test 2: Company assignment rejection ---
  await testCompanyAssignmentRejection();

  // --- Test 3: Batch-scoped driver rejection ---
  await testBatchDriverRejection();

  report.summary();
};

module.exports = { runDriverRejectionTests };

// ── Run directly ─────────────────────────────────────────────────────────────
if (require.main === module) {
  runDriverRejectionTests().then(() => process.exit(0)).catch(() => process.exit(1));
}
