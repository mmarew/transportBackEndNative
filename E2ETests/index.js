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
const {
  testCreateShipperRequest,
  testAcceptDriverRequest,
} = require("./Shipper/ShipperRequest");
const {
  testGetCancellationNotification,
  testMarkJourneyCancellationAsSeen,
} = require("./Shipper/Index");
const {
  initiateCompanyBiddingWorkFlow,
  acceptCompanyOffer,
  getBids,
} = require("./Company/BidManagement");
const { assignVehicleToCompany } = require("./Company/CompanyVehicle");
const { assignDrivers } = require("./Company/AssignDrivers");

// ─────────────────────────────────────────────────────────────────────────────

const runIndividualFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 STARTING INDIVIDUAL TARGET FLOW");
  console.log("=======================================================\n");

  // 1. Shipper creates individual target request
  await testShipperOnboardingFlow({ userType: "shipper", requestMode: "individual_target" });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  // 2. Driver posts location and auto-matches
  console.log("\n── Phase 4: Driver Posts Location (Auto-Match) ──");
  await testCreateDriverRequest(usersData.driver.token);

  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

  // 3. Driver accepts match and submits bid
  if (driverStatus?.status == 2) {
    console.log("\n── Phase 5: Driver Accepts Shipper Match & Submits Bid ──");
    await acceptShipperRequest({ userType: "driver", shippingCostByDriver: 5000 });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  // 4. Shipper accepts driver's bid
  if (driverStatus?.status == 3) {
    console.log("\n── Phase 6: Shipper Accepts Driver's Offer ──");
    await testAcceptDriverRequest({ uniqueIds: driverStatus?.uniqueIds });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  // 5. Driver starts journey
  if (driverStatus?.status == 4) {
    console.log("\n── Phase 7: Driver Starts Journey ──");
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  // 6. Driver completes journey
  if (driverStatus?.status == 5) {
    console.log("\n── Phase 8: Driver Completes Journey ──");
    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ INDIVIDUAL TARGET FLOW COMPLETED\n");
};

const runCompanyFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🏢 STARTING COMPANY TARGET FLOW");
  console.log("=======================================================\n");

  // 1. Shipper creates company target request
  await testShipperOnboardingFlow({ userType: "shipper", requestMode: "company_target" });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  // 2. Company setup
  await createCompanyAdminFlow({});

  // 3. Company participates in bid and returns the submitted bid
  console.log("\n── Phase 4: Company Participates in Bid ──");
  const bidToAccept = await initiateCompanyBiddingWorkFlow({ userType: "companyAdmin" });

  if (!bidToAccept) {
    throw new Error("Company failed to find or participate in a bid.");
  }

  // 4. Shipper accepts the company's bid
  console.log("\n── Phase 5: Shipper Accepts Company's Bid ──");
  await acceptCompanyOffer({ userType: "shipper", bid: bidToAccept });

  // 5. Company assigns vehicle and driver
  console.log("\n── Phase 6: Company Assigns Vehicle and Driver ──");
  await getBids({ userType: "companyAdmin", bidStatus: "accepted_by_shipper" });
  const bidsAcceptedByShipper = usersData.companyAdmin.bids["accepted_by_shipper"];
  const acceptedBid = bidsAcceptedByShipper?.[0];
  
  if (!acceptedBid) {
    throw new Error("No accepted company bid found to assign drivers.");
  }

  await assignVehicleToCompany({});
  await assignDrivers({ bid: acceptedBid });

  // 6. Driver accepts the company assignment
  console.log("\n── Phase 7: Driver Accepts Company Assignment ──");
  await acceptCompanyAssignment({ userType: "driver" });
  
  // 7. Driver starts and completes journey
  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

  if (driverStatus?.status == 4) {
    console.log("\n── Phase 8: Driver Starts Journey ──");
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  if (driverStatus?.status == 5) {
    console.log("\n── Phase 9: Driver Completes Journey ──");
    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ COMPANY TARGET FLOW COMPLETED\n");
};

const initiateTest = async () => {
  try {
    // ── Base Setup (DB, Admins, Base Driver) ──────────────────────────────────
    await resetDatabase();
    if (!usersData?.supperAdmin?.token) throw new Error("SuperAdmin token not set");

    await testCreateAdminFlow({});
    if (!usersData?.admin?.token) throw new Error("Admin token not set");

    await testGetRoles();

    // Setup base driver once
    await testDriverOnboardingFlow({ userType: "driver" });
    if (!usersData?.driver?.token) throw new Error("Driver token not set");

    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    // ── Run Both Flows ────────────────────────────────────────────────────────
    await runIndividualFlow();
    await runCompanyFlow();

    // ── Optional: Delinquency system ─────────────────────────────────────────
    // await testDelinquencyTypesWorkflows({});
    // await testDelinquencyWorkflow({});
    // await testDelinquencyResponseWorkflow({});
    // await testAdminDecisionWorkflow({});
    // await testBanWorkflow({});

    console.log("\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n");
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
