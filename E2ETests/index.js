// ── E2E Test Runner ───────────────────────────────────────────────────────────
// Runs the complete freight transport lifecycle from a clean database.
// Order is critical — each phase depends on the previous one having succeeded.

const { testDriverOnboardingFlow } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { usersData } = require("./constants");

// ── Core setup ────────────────────────────────────────────────────────────────
const { testCreateAdminFlow, testUserRoleWorkflow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const {
  createCompanyAdminFlow,
  testCompanyDelinquencyWorkflow,
  testCompanyMembershipWorkflow,
  testCompanyRoleWorkflow,
  testCompanyRatingWorkflow,
} = require("./Company");
const { testSMSSenderWorkflow } = require("./Admin/SMSSender");

// ── Reference data CRUD ───────────────────────────────────────────────────────
const { testGetRoles, testRolesWorkFlows } = require("./Roles");
const {
  testDelinquencyTypesWorkflows,
} = require("./Delinquency/DelinquencyTypes");
const { testDelinquencyWorkflow } = require("./Delinquency/Delinquency");
const {
  testDelinquencyResponseWorkflow,
} = require("./Delinquency/DelinquencyResponse");
const { testAdminDecisionWorkflow } = require("./Delinquency/AdminDecision");
const { testBanWorkflow } = require("./Delinquency/BannedUsers");

// ── Journey CRUD ──────────────────────────────────────────────────────────────
const {
  testJourneyStatusWorkflow,
  testCancellationReasonsTypeWorkflow,
  testJourneyWorkflow,
  testJourneyDecisionsWorkflow,
  testCanceledJourneysWorkflow,
  testJourneyRoutePointsWorkflow,
} = require("./Journey");

// ── Vehicle CRUD ──────────────────────────────────────────────────────────────
const {
  testVehicleTypeWorkflow,
  testVehicleStatusTypeWorkflow,
  testVehicleProfileWorkflow,
  testVehicleDriverWorkflow,
  testVehicleOwnershipWorkflow,
  testVehicleStatusWorkflow,
} = require("./Vehicles");

// ── Document CRUD ─────────────────────────────────────────────────────────────
const {
  testDocumentTypesWorkflow,
  testRoleDocumentRequirementsWorkflow,
} = require("./Documents");

// ── Status CRUD ───────────────────────────────────────────────────────────────
const {
  testStatusWorkflow,
  testUserRoleStatusWorkflow,
  testMarkAsSeenWorkflow,
} = require("./Status");

// ── Analytics & System Admin ──────────────────────────────────────────────────
const {
  testAnalyticsWorkflow,
  testSystemAdminWorkflow,
} = require("./Analytics");

// ── Auth / Account ────────────────────────────────────────────────────────────
const { testAccountWorkflow } = require("./Auth/Account");

// ── Finance CRUD ──────────────────────────────────────────────────────────────
const {
  testTariffRateWorkflow,
  testDepositSourceWorkflow,
  testFinancialInstitutionAccountWorkflow,
  testSubscriptionPlanWorkflow,
  testRatingsWorkflow,
  testCommissionStatusWorkflow,
  testPaymentStatusWorkflow,
  testPaymentMethodWorkflow,
  testCommissionRatesWorkflow,
  testSubscriptionPlanPricingWorkflow,
  testTariffRateForVehicleTypeWorkflow,
  testUserRefundWorkflow,
  testCommissionWorkflow,
  testDriverEarningWorkflow,
  testPaymentsWorkflow,
  testJourneyPaymentsWorkflow,
} = require("./Finance");

// ── Journey flow helpers ──────────────────────────────────────────────────────
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
  testShipperRequestBatchWorkflow,
} = require("./Shipper/ShipperRequestBatch");
const {
  initiateCompanyBiddingWorkFlow,
  acceptCompanyOffer,
  getBids,
} = require("./Company/BidManagement");
const { assignVehicleToCompany } = require("./Company/CompanyVehicle");
const { assignDrivers } = require("./Company/AssignDrivers");

// ─────────────────────────────────────────────────────────────────────────────

// ── Phase A: Reference/Lookup Data CRUD ──────────────────────────────────────
// Tests CRUD for seed-level tables. Safe to run before any journey flow.
const runReferenceCRUD = async () => {
  console.log("\n=======================================================");
  console.log("   📋 REFERENCE DATA CRUD TESTS");
  console.log("=======================================================\n");

  await testVehicleTypeWorkflow({});
  await testVehicleStatusTypeWorkflow({});
  await testJourneyStatusWorkflow({});
  await testCancellationReasonsTypeWorkflow({});
  await testDocumentTypesWorkflow({});
  await testRoleDocumentRequirementsWorkflow({});
  await testStatusWorkflow({});
  await testDelinquencyTypesWorkflows({});
  await testTariffRateWorkflow({});
  await testDepositSourceWorkflow({});
  await testFinancialInstitutionAccountWorkflow({});
  await testCommissionStatusWorkflow({});
  await testPaymentStatusWorkflow({});
  await testPaymentMethodWorkflow({});
  await testCommissionRatesWorkflow({});
  await testSubscriptionPlanWorkflow({});
  await testSubscriptionPlanPricingWorkflow({});
  await testTariffRateForVehicleTypeWorkflow({});
  await testRolesWorkFlows();
  await testSMSSenderWorkflow({});
  await testCompanyRoleWorkflow({});
  await testVehicleStatusWorkflow({});
  await testUserRefundWorkflow({ user: usersData.admin });
  await testDriverEarningWorkflow({ user: usersData.driver });
  await testUserRoleWorkflow({ user: usersData.admin });

  console.log("\n✅ Reference data CRUD complete\n");
};

// ── Phase B: Individual Journey Flow ─────────────────────────────────────────
const runIndividualFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 STARTING INDIVIDUAL TARGET FLOW");
  console.log("=======================================================\n");

  await testShipperOnboardingFlow({
    userType: "shipper",
    requestMode: "individual_target",
  });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  await testCreateDriverRequest(usersData.driver.token);
  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

  if (driverStatus?.status == 2) {
    await acceptShipperRequest({
      userType: "driver",
      shippingCostByDriver: 5000,
    });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 3) {
    await testAcceptDriverRequest({ uniqueIds: driverStatus?.uniqueIds });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 4) {
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 5) {
    // Snapshot the journeyDecisionUniqueId before completeJourney wipes the status
    const jdId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (jdId) usersData.driver.lastJourneyDecisionUniqueId = jdId;

    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ INDIVIDUAL TARGET FLOW COMPLETED\n");
};

// ── Phase C: Company Journey Flow ─────────────────────────────────────────────
const runCompanyFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🏢 STARTING COMPANY TARGET FLOW");
  console.log("=======================================================\n");

  // 1. Shipper creates a company_target request FIRST — before company setup
  //    so the request is visible in the available bids pool when company looks
  await testShipperOnboardingFlow({
    userType: "shipper",
    requestMode: "company_target",
  });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  // 2. Set up company (auth + profile + docs + approval) — no bidding yet
  await createCompanyAdminFlow({});

  // 3. NOW company can find the shipper's request in the available bids pool
  const bidToAccept = await initiateCompanyBiddingWorkFlow({
    userType: "companyAdmin",
  });
  if (!bidToAccept)
    throw new Error("Company failed to find or participate in a bid.");

  // 4. Shipper accepts the company's bid
  await acceptCompanyOffer({ userType: "shipper", bid: bidToAccept });

  // 5. Company assigns vehicle and driver
  await getBids({ userType: "companyAdmin", bidStatus: "accepted_by_shipper" });
  const acceptedBid = usersData.companyAdmin.bids["accepted_by_shipper"]?.[0];
  if (!acceptedBid)
    throw new Error("No accepted company bid found to assign drivers.");

  await assignVehicleToCompany({});
  await assignDrivers({ bid: acceptedBid });

  // 6. Driver confirms the company assignment
  await getDriverJourneyStatus({ userType: "driver" });
  await acceptCompanyAssignment({ userType: "driver" });

  // 7. Driver starts and completes the journey
  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  if (driverStatus?.status == 4) {
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 5) {
    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ COMPANY TARGET FLOW COMPLETED\n");
};

// ── Phase D: Post-Journey CRUD ────────────────────────────────────────────────
// Tests entities that need journey data to exist first
const runPostJourneyCRUD = async () => {
  console.log("\n=======================================================");
  console.log("   📊 POST-JOURNEY CRUD TESTS");
  console.log("=======================================================\n");

  await testJourneyWorkflow({});
  await testJourneyDecisionsWorkflow({});
  await testCanceledJourneysWorkflow({});
  await testJourneyRoutePointsWorkflow({ user: usersData.driver });
  await testRatingsWorkflow({ user: usersData.shipper });
  await testVehicleProfileWorkflow({ user: usersData.driver });
  await testVehicleDriverWorkflow({ user: usersData.admin });
  await testVehicleOwnershipWorkflow({ user: usersData.admin });
  await testUserRoleStatusWorkflow({});
  await testShipperRequestBatchWorkflow({ user: usersData.shipper });
  await testAccountWorkflow();
  await testMarkAsSeenWorkflow();
  await testCommissionWorkflow({ user: usersData.admin });
  await testPaymentsWorkflow({ user: usersData.admin });
  await testJourneyPaymentsWorkflow({ user: usersData.admin });
  await testCompanyMembershipWorkflow({ user: usersData.companyAdmin });
  await testCompanyRatingWorkflow({ user: usersData.shipper });

  console.log("\n✅ Post-journey CRUD complete\n");
};

// ── Phase E: Delinquency Lifecycle ────────────────────────────────────────────
const runDelinquencyTests = async () => {
  console.log("\n=======================================================");
  console.log("   ⚠️  DELINQUENCY LIFECYCLE TESTS");
  console.log("=======================================================\n");

  await testDelinquencyWorkflow({ user: usersData.admin });
  await testDelinquencyResponseWorkflow({ user: usersData.driver });
  await testAdminDecisionWorkflow({ user: usersData.admin });
  await testBanWorkflow({ user: usersData.admin });
  await testCompanyDelinquencyWorkflow({});

  console.log("\n✅ Delinquency lifecycle tests complete\n");
};

// ── Phase F: Analytics & Admin Tests ──────────────────────────────────────────
const runAnalyticsAndAdminTests = async () => {
  console.log("\n=======================================================");
  console.log("   📈 ANALYTICS & SYSTEM ADMIN TESTS");
  console.log("=======================================================\n");

  await testAnalyticsWorkflow({ user: usersData.admin });
  await testSystemAdminWorkflow({ user: usersData.admin });

  console.log("\n✅ Analytics & Admin tests complete\n");
};

// ─────────────────────────────────────────────────────────────────────────────

const initiateTest = async () => {
  try {
    // ── Phase 0: Clean slate ──────────────────────────────────────────────────
    await resetDatabase();
    if (!usersData?.supperAdmin?.token)
      throw new Error("SuperAdmin token not set");

    // ── Phase 1: Core users ───────────────────────────────────────────────────
    await testCreateAdminFlow({});
    if (!usersData?.admin?.token) throw new Error("Admin token not set");

    await testGetRoles();

    // ── Phase 2: Driver onboarding + doc approval ─────────────────────────────
    await testDriverOnboardingFlow({ userType: "driver" });
    if (!usersData?.driver?.token) throw new Error("Driver token not set");

    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    // ── Phase A: Reference data CRUD (safe to run early) ─────────────────────
    await runReferenceCRUD();

    // ── Phase B: Individual journey flow ──────────────────────────────────────
    await runIndividualFlow();

    // ── Phase C: Company journey flow ─────────────────────────────────────────
    await runCompanyFlow();

    // ── Phase D: Post-journey CRUD ────────────────────────────────────────────
    await runPostJourneyCRUD();

    // ── Phase E: Delinquency lifecycle ────────────────────────────────────────
    await runDelinquencyTests();

    // ── Phase F: Analytics & Admin Tests ──────────────────────────────────────
    await runAnalyticsAndAdminTests();

    console.log("\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n");
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
};

initiateTest();
