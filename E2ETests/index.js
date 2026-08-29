const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { initLogCapture } = require("./logCapture");
initLogCapture();
const { testDriverOnboardingFlow } = require("./Driver");
const { testCreateAdminFlow } = require("./Admin");
const {
  resetDatabase,
  ensureJourneyLocationColumns,
} = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { testGetRoles } = require("./Roles");
const { testUpdateUserWithFileUpload } = require("./Auth/User");
const { testGetAccountData } = require("./Auth/Account");
const {
  testDeleteUser,
  testUpdateCompany,
  testDeleteCompany,
  testUpdateBatch,
  testDeleteBatch,
  testVehicleDocumentUpload,
} = require("./Untested");
const {
  testSocketNotifications,
  testCompanySocketNotifications,
} = require("./Socket");
const { runDriverRejectionTests } = require("./testDriverRejectionFlow");
const { runSystemAdminTests } = require("./Admin");
const { runShipperSupplementaryTests } = require("./Shipper");
const { runCompanySupplementaryTests } = require("./Company");
const { runCancelRulesTests } = require("./Company/CancelRules");
const { runUserBalanceTests } = require("./Finance");
const { runDelinquencySupplementaryTests } = require("./Delinquency");
const {
  testGetAttachedDocuments,
  testDeleteAttachedDocument,
  testGetDocumentHistory,
  testUpdateAttachedDocument,
  testGetCompanyAttachedDocuments,
  testGetCompanyDocumentHistory,
  testGetVehicleAttachedDocuments,
  testGetVehicleDocumentHistory,
  testGetProfileHistory,
} = require("./Documents");
const {
  testUpsertFCMToken,
  testGetFCMToken,
  testUpdateFCMToken,
  testDeleteFCMToken,
} = require("./FCMToken");
const { runJourneyCountsTests } = require("./Journey");
const { testGetCompanyAssignments, testGetCompanyBids } = require("./Company");
const {
  testCreateUserBalanceTransfer,
  testGetUserBalanceTransfers,
  testGetUserBalanceTransferById,
  testUpdateUserBalanceTransfer,
  testDeleteUserBalanceTransfer,
  testCreateUserDeposit,
  testGetUserDeposits,
  testUpdateUserDeposit,
  testDeleteUserDeposit,
  testInitiateSantimPay,
  testSantimPayWebhook,
  testCreateUserSubscription,
  testGetUserSubscriptions,
  testUpdateUserSubscription,
  testDeleteUserSubscription,
} = require("./Finance");
const {
  testReportWrongEmail,
  testVerifyEmail,
  testVerifyPhoneGet,
  testVerifyPhonePost,
} = require("./Auth/User");
const { usersData, USER_STATUS } = require("./constants");
const { report } = require("./Reporter");
const { ensureCoreUsers } = require("./Auth/bootstrap");

const { runReferenceCRUD } = require("./Phases/runReferenceCRUD");
const { runIndividualFlow } = require("./Phases/runIndividualFlow");
const { runTakeFromStreetFlow } = require("./Phases/runTakeFromStreetFlow");
const { runCompanyFlow } = require("./Phases/runCompanyFlow");
const { runPostJourneyCRUD } = require("./Phases/runPostJourneyCRUD");
const { runDelinquencyTests } = require("./Phases/runDelinquencyTests");
const {
  runAnalyticsAndAdminTests,
} = require("./Phases/runAnalyticsAndAdminTests");

// ── Newly integrated tests (converted from __tests__/) ─────────────────────
const {
  testDeliveryConfirmationRules,
} = require("./Journey/DeliveryConfirmationRules");
const {
  testDocumentUrlWorkflow,
} = require("./Documents/DocumentUrl");
const {
  testCurrentDateWorkflow,
} = require("./Utils/CurrentDateE2E");
const {
  testShipperRequestValidationWorkflow,
} = require("./Shipper/ShipperRequestValidation");
const {
  testCompanyTargetLazyCreationWorkflow,
} = require("./Company/CompanyTargetLazyCreation");
const {
  testShipperRequestJourneyWorkflow,
} = require("./Shipper/ShipperRequestJourney");
const {
  testJourneyPodStatusWorkflow,
} = require("./Journey/JourneyPodStatus");

// Never swallow a failed step silently — it MUST be counted as a failure so
// the tally (and exit code) reflect reality.
const safe = (label, fn) => async () => {
  try {
    await fn();
  } catch (e) {
    report.fail(label, e);
  }
};

const initiateTest = async () => {
  try {
    // ── Phase 0: Clean slate ──────────────────────────────────────────────────
    await resetDatabase();
    if (!usersData?.supperAdmin?.token)
      throw new Error("SuperAdmin token not set");

    // ── Phase 0b: Non-destructive schema verification ─────────────────────────
    // Drop-table operations are permanently disabled — the suite never wipes data.
    // New columns (e.g. Journey.journeyStartingLat/Lng) are added via
    // PUT /api/admin/updateTable/:tableName when missing.
    console.log("\n── Non-destructive Schema Check ──");
    await safe("ensureJourneyLocationColumns", ensureJourneyLocationColumns)();

    // ── Phase 0c: Provision ALL canonical users once ──────────────────────────
    // driver / shipper / systemAdmin / companyAdmin / queueAdmin / supperAdmin
    // / admin are created from the beginning and then REUSED by every suite
    // (see Auth/ensureUser.js). Never re-create a user mid-run.
    await ensureCoreUsers({ fetchAccount: false });

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

    // The driver MUST be ACTIVE after document approval. Concurrent approvals
    // used to race their account-status recalcs, so the stored status could be
    // left PENDING even when every document was accepted. Re-fetch account data
    // (which recomputes against the final committed state) and fail loudly if
    // the driver is not ACTIVE.
    const driverAccount = await testGetAccountData({ userType: "driver" });
    const driverStatus = driverAccount?.data?.status ?? driverAccount?.status;
    if (driverStatus !== USER_STATUS.ACTIVE) {
      throw new Error(
        `Driver must be ACTIVE after document approval, got status ${driverStatus} (expected ${USER_STATUS.ACTIVE})`,
      );
    }
    console.log(
      `✅ Driver is ACTIVE (status ${USER_STATUS.ACTIVE}) after document approval\n`,
    );

    // ── Document Endpoint Tests ────────────────────────────────────────────────
    const runDocumentTests = async () => {
      console.log("\n=======================================================");
      console.log("   📄 TESTING DOCUMENT ENDPOINTS");
      console.log("=======================================================\n");
      await testGetAttachedDocuments();
      await testDeleteAttachedDocument();
      await testGetDocumentHistory();
      await testUpdateAttachedDocument();
      await testGetCompanyAttachedDocuments();
      await testGetCompanyDocumentHistory();
      await testGetVehicleAttachedDocuments();
      await testGetVehicleDocumentHistory();
      await testGetProfileHistory();
      console.log("\n✅ Document endpoint tests complete\n");
    };

    // ── FCM Token Tests ───────────────────────────────────────────────────────
    const runFCMTokenTests = async () => {
      console.log("\n=======================================================");
      console.log("   🔑 TESTING FCM TOKEN ENDPOINTS");
      console.log("=======================================================\n");
      await testUpsertFCMToken();
      await testGetFCMToken();
      await testUpdateFCMToken();
      await testDeleteFCMToken();
      console.log("\n✅ FCM token tests complete\n");
    };

    // ── Journey Counts Tests now uses runJourneyCountsTests from Journey/index.js

    // ── Company Endpoint Tests ────────────────────────────────────────────────
    const runCompanyEndpointTests = async () => {
      console.log("\n── Company Endpoints ──");
      await testGetCompanyAssignments();
      await testGetCompanyBids();
    };

    // ── Finance: UserBalanceTransfer Tests ────────────────────────────────────
    const runUserBalanceTransferTests = async () => {
      console.log("\n── Finance: UserBalanceTransfer CRUD ──");
      await testCreateUserBalanceTransfer();
      await testGetUserBalanceTransfers();
      await testGetUserBalanceTransferById();
      await testUpdateUserBalanceTransfer();
      await testDeleteUserBalanceTransfer();
    };

    // ── Finance: UserDeposit Tests ────────────────────────────────────────────
    const runUserDepositTests = async () => {
      console.log("\n── Finance: UserDeposit CRUD ──");
      await testCreateUserDeposit();
      await testGetUserDeposits();
      await testUpdateUserDeposit();
      await testDeleteUserDeposit();
    };

    // ── Finance: UserSubscription Tests ───────────────────────────────────────
    const runUserSubscriptionTests = async () => {
      console.log("\n── Finance: UserSubscription CRUD ──");
      await testCreateUserSubscription();
      await testGetUserSubscriptions();
      await testUpdateUserSubscription();
      await testDeleteUserSubscription();
    };

    // ── Finance: SantimPay Tests ──────────────────────────────────────────────
    const runSantimPayTests = async () => {
      console.log("\n── Finance: UserDeposit SantimPay ──");
      await testInitiateSantimPay();
      await testSantimPayWebhook();
    };

    // ── Phase A-F ─────────────────────────────────────────────────────────────
    // Ordering rule: the driver must stay ACTIVE through all journey-creating
    // flows (individual, take-from-street, company, post-journey). Document
    // endpoint tests delete a driver document, which recalculates the account
    // status, so they run only AFTER all journey flows complete. Company
    // endpoint tests need the company membership created in runCompanyFlow.
    await safe("runFCMTokenTests", runFCMTokenTests)();
    await safe("runUserBalanceTransferTests", runUserBalanceTransferTests)();
    await safe("runUserDepositTests", runUserDepositTests)();
    await safe("runUserSubscriptionTests", runUserSubscriptionTests)();
    await safe("runSantimPayTests", runSantimPayTests)();
    await safe("testCurrentDateWorkflow", testCurrentDateWorkflow)();
    await safe("runReferenceCRUD", runReferenceCRUD)();
    await safe("testShipperRequestValidationWorkflow", testShipperRequestValidationWorkflow)();
    await safe("runIndividualFlow", runIndividualFlow)();
    await safe("runTakeFromStreetFlow", runTakeFromStreetFlow)();
    await safe("testUpdateUserWithFileUpload", testUpdateUserWithFileUpload)();
    await safe("runCompanyFlow", runCompanyFlow)();
    await safe("runCompanyEndpointTests", runCompanyEndpointTests)();
    await safe("testCompanyTargetLazyCreationWorkflow", testCompanyTargetLazyCreationWorkflow)();
    await safe("runCancelRulesTests", runCancelRulesTests)();
    await safe("runPostJourneyCRUD", runPostJourneyCRUD)();
    await safe("testShipperRequestJourneyWorkflow", testShipperRequestJourneyWorkflow)();
    await safe("testDeliveryConfirmationRules", testDeliveryConfirmationRules)();
    await safe("testJourneyPodStatusWorkflow", testJourneyPodStatusWorkflow)();
    await safe("runDocumentTests", runDocumentTests)();
    await safe("testDocumentUrlWorkflow", testDocumentUrlWorkflow)();
    await safe("runDelinquencyTests", runDelinquencyTests)();
    await safe("runAnalyticsAndAdminTests", runAnalyticsAndAdminTests)();

    // ── Phase G: Socket notification tests (run before delete ops) ──────
    if (!usersData?.driver?.token || !usersData?.shipper?.token) {
      console.warn(
        "⚠️  Missing driver/shipper tokens for socket tests — skipping Phase G",
      );
    } else {
      console.log("\n=======================================================");
      console.log("   🔌 TESTING SOCKET NOTIFICATIONS");
      console.log("=======================================================\n");

      await safe("testSocketNotifications", testSocketNotifications)();
    }

    // ── Phase G2: Company socket notification tests ────────────────
    if (!usersData?.companyAdmin?.token) {
      console.warn(
        "⚠️  Missing companyAdmin token for company socket tests — skipping Phase G2",
      );
    } else {
      console.log("\n=======================================================");
      console.log("   🔌 TESTING COMPANY SOCKET NOTIFICATIONS");
      console.log("=======================================================\n");

      await safe(
        "testCompanySocketNotifications",
        testCompanySocketNotifications,
      )();
    }

    // ── Phase H2: Driver rejection flow tests ─────────────────────────
    if (
      !usersData?.driver?.token ||
      !usersData?.shipper?.token ||
      !usersData?.companyAdmin?.token
    ) {
      console.warn(
        "⚠️  Missing user tokens for rejection tests — skipping Phase H2",
      );
    } else {
      console.log("\n=======================================================");
      console.log("   🚫 TESTING DRIVER REJECTION FLOWS");
      console.log("=======================================================\n");

      await safe("runDriverRejectionTests", runDriverRejectionTests)();
    }

    // ── Phase J: Journey counts, system admin & remaining coverage ─────
    await safe("runJourneyCountsTests", runJourneyCountsTests)();
    await safe("runSystemAdminTests", runSystemAdminTests)();
    await safe("runShipperSupplementaryTests", runShipperSupplementaryTests)();
    await safe("runCompanySupplementaryTests", runCompanySupplementaryTests)();
    await safe("runUserBalanceTests", runUserBalanceTests)();
    await safe(
      "runDelinquencySupplementaryTests",
      runDelinquencySupplementaryTests,
    )();
    await safe("testReportWrongEmail", testReportWrongEmail)();
    await safe("testVerifyEmail", testVerifyEmail)();
    await safe("testVerifyPhoneGet", testVerifyPhoneGet)();
    await safe("testVerifyPhonePost", testVerifyPhonePost)();

    // ── Phase K: Previously untested endpoints (delete operations) ──────
    console.log("\n=======================================================");
    console.log("   🧪 TESTING PREVIOUSLY UNTESTED ENDPOINTS");
    console.log("=======================================================\n");

    await safe("testUpdateCompany", testUpdateCompany)();
    await safe("testDeleteCompany", testDeleteCompany)();
    await safe("testUpdateBatch", testUpdateBatch)();
    await safe("testDeleteBatch", testDeleteBatch)();
    await safe("testVehicleDocumentUpload", testVehicleDocumentUpload)();
    await safe("testDeleteUser", testDeleteUser)();

    const passed = report.summary();
    if (passed) {
      console.log(
        "\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n",
      );
      process.exit(0);
    } else {
      console.error("\n❌ ========== E2E TEST FAILED ==========\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    report.summary();
    process.exit(1);
  }
};

initiateTest();
