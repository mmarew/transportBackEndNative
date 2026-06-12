// ── E2E Test Runner ───────────────────────────────────────────────────────────
// Runs the complete freight transport lifecycle from a clean database.
// Order is critical — each phase depends on the previous one having succeeded.

const { testDriverOnboardingFlow, driversFinancialFlows } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { usersData } = require("./constants");

const { testCreateAdminFlow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { createCompanyAdminFlow } = require("./Company");
const { testGetRoles } = require("./Roles");
const {
  testDelinquencyTypesWorkflows,
} = require("./Delinquency/DelinquencyTypes");
const { testDelinquencyWorkflow } = require("./Delinquency/Delinquency");
const {
  testDelinquencyResponseWorkflow,
} = require("./Delinquency/DelinquencyResponse");
const { testAdminDecisionWorkflow } = require("./Delinquency/AdminDecision");
const { testBanWorkflow } = require("./Delinquency/BannedUsers");
const { testCreateDriverRequest } = require("./Driver/DriverRequest");
const {
  getDriverJourneyStatus,
  acceptShipperRequest,
  acceptCompanyAssignment,
  startJourney,
  completeJourney,
} = require("./Driver/DriverJourneyStatus");
const { testAcceptDriverRequest } = require("./Shipper/ShipperRequest");
const {
  testGetCancellationNotification,
  testMarkJourneyCancellationAsSeen,
} = require("./Shipper/Index");

// ─────────────────────────────────────────────────────────────────────────────

const initiateTest = async () => {
  try {
    // ── Phase 0: Reset database ───────────────────────────────────────────────
    // Drop all tables → recreate schema → verify SuperAdmin → install seed data
    await resetDatabase();

    if (!usersData?.supperAdmin?.token) {
      throw new Error("SuperAdmin token not set after resetDatabase()");
    }

    // ── Phase 1: Create & login Admin ─────────────────────────────────────────
    // SuperAdmin creates the admin account; admin verifies OTP and logs in.
    await testCreateAdminFlow({});

    if (!usersData?.admin?.token) {
      throw new Error("Admin token not set after testCreateAdminFlow()");
    }

    await testGetRoles();

    // ── Phase 2: Driver — register, verify, upload docs & vehicle ─────────────
    // Auth flow (register → OTP verify → login), create vehicle, upload all
    // required user & vehicle documents. Admin approval happens next.
    await testDriverOnboardingFlow({ userType: "driver" });

    if (!usersData?.driver?.token) {
      throw new Error("Driver token not set after testDriverOnboardingFlow()");
    }

    // ── Phase 2b: Admin approves driver's documents ───────────────────────────
    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    // ── Phase 3: Shipper — register, verify, upload docs, post freight request ─
    // Auth flow, upload required shipper documents, create a shipper request
    // (origin: Addis Ababa → destination: Adama, Coffee Beans 100 quintals).
    await testShipperOnboardingFlow({ userType: "shipper" });

    if (!usersData?.shipper?.token) {
      throw new Error(
        "Shipper token not set after testShipperOnboardingFlow()",
      );
    }

    // ── Phase 4: Driver posts location → backend auto-matches with shipper ────
    console.log("\n── Phase 4: Driver Posts Location (Auto-Match) ──");
    await testCreateDriverRequest(usersData.driver.token);

    // ── Phase 5–8: Drive the full journey lifecycle to completion ─────────────
    // Each step re-fetches journey status so we always work with fresh IDs.

    let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

    // Status 2 → system found a shipper match; driver submits bid price
    if (driverStatus?.status == 2) {
      console.log("\n── Phase 5: Driver Accepts Shipper Match & Submits Bid ──");
      await acceptShipperRequest({ userType: "driver", shippingCostByDriver: 5000 });
      driverStatus = await getDriverJourneyStatus({ userType: "driver" });
    }

    // Status 3 → driver's bid is visible to shipper; shipper confirms the driver
    if (driverStatus?.status == 3) {
      console.log("\n── Phase 6: Shipper Accepts Driver's Offer ──");
      await testAcceptDriverRequest({ uniqueIds: driverStatus?.uniqueIds });
      driverStatus = await getDriverJourneyStatus({ userType: "driver" });
    }

    // Status 4 → shipper confirmed; driver picks up goods and starts journey
    if (driverStatus?.status == 4) {
      console.log("\n── Phase 7: Driver Starts Journey ──");
      await startJourney({ userType: "driver" });
      driverStatus = await getDriverJourneyStatus({ userType: "driver" });
    }

    // Status 5 → goods delivered; driver marks journey as complete
    if (driverStatus?.status == 5) {
      console.log("\n── Phase 8: Driver Completes Journey ──");
      await completeJourney({ userType: "driver" });
      driverStatus = await getDriverJourneyStatus({ userType: "driver" });
    }

    // ── Phase 9 (optional): Check cancellation notifications on shipper side ──
    // Uncomment this block to test the mid-journey cancellation path.
    // const cancellationNotifications = await testGetCancellationNotification();
    // if (cancellationNotifications?.[0]?.journeyDecision?.journeyDecisionUniqueId) {
    //   const { journeyDecision, shipper } = cancellationNotifications[0];
    //   await testMarkJourneyCancellationAsSeen({
    //     journeyDecisionUniqueId: journeyDecision.journeyDecisionUniqueId,
    //     shipperRequestUniqueId: shipper.shipperRequestUniqueId,
    //     rating: 4,
    //   });
    // }

    // ── Optional: Company bidding flow ────────────────────────────────────────
    // Uncomment to test the full company bid lifecycle.
    // await createCompanyAdminFlow({});

    // ── Optional: Delinquency system ─────────────────────────────────────────
    // Uncomment to test ban/delinquency flows.
    // await testDelinquencyTypesWorkflows({});
    // await testDelinquencyWorkflow({});
    // await testDelinquencyResponseWorkflow({});
    // await testAdminDecisionWorkflow({});
    // await testBanWorkflow({});

    console.log(
      "\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n",
    );
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
};

initiateTest();

// ── Iterate multiple times (stress test) ─────────────────────────────────────
// const runIterations = async () => {
//   for (let i = 1; i < 3; i++) {
//     console.log(`\n🔄 Starting E2E Test Iteration ${i}...\n`);
//     await initiateTest();
//   }
// };
// runIterations().catch((error) => {
//   console.error("\n❌ E2E iteration runner failed:", error);
//   process.exit(1);
// });
