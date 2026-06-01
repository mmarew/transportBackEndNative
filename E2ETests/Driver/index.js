const { testAuthWorkFlow } = require("../Auth");

const {
  getDriversAccountData,
  evaluateDriversDocumentVehicleRequirement,
} = require("./RequirementOfDriver");
const { usersData } = require("../constants");
const {
  getDriverJourneyStatus,
  acceptCompanyAssignment,
  acceptShipperRequest,
  startJourney,
  completeJourney,
} = require("./DriverJourneyStatus");
const { testDriverBalanceFlow } = require("./DriversFinance/DriverBalance");
const { testDriverDepositFlow } = require("./DriversFinance/DriverDeposit");
const { testDriverTransferFlow } = require("./DriversFinance/DriverTransfer");
const { testDriverWalletFlow } = require("./DriversFinance/DriverWallet");
const {
  testDriverSubscriptionFlow,
} = require("./DriversFinance/DriverSubscription");
const {
  getFinancialInstitutionAccounts,
  createFinancialInstitutionAccount,
} = require("./DriversFinance/FinancialInstitutions");
const { getSubscriptionPlans } = require("./DriversFinance/SubscriptionPlan");

const testDriverOnboardingFlow = async ({ userType = "driver" }) => {
  console.log("\n✅ ========== DRIVER ONBOARDING FLOW STARTED ==========\n");
  await testAuthWorkFlow({ userType });

  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Driver login failed, no token found.");
    return;
  }
  await getDriversAccountData({ token });
  // Creates vehicle if missing, uploads all user docs + vehicle docs,
  // skips already-uploaded ones to prevent duplicates.
  await evaluateDriversDocumentVehicleRequirement();

  // Documents are now uploaded but need admin approval before the driver
  // can be activated. fetchUnAuthorizedDrivers + authorizeDriversDocuments
  // must run after this point (handled in the main index.js flow).

  const journeyStatus = await getDriverJourneyStatus({ userType });
  if (!journeyStatus) {
    console.log(
      "⚠️  No journey status returned — driver may have no active request yet.",
    );
    return;
  }

  const isCompanyMode = !!journeyStatus?.companyAssignment?.assignmentUniqueId;
  const isIndividualMode =
    !isCompanyMode && !!journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

  if (isCompanyMode) {
    console.log("🏢 Company assignment detected — confirming...");
    await acceptCompanyAssignment({ userType });
    //refetch data to get updated journey status with accepted company assignment before accepting shipper request
    await getDriverJourneyStatus({ userType });
  } else if (isIndividualMode) {
    console.log("👤 Individual shipper match detected — accepting...");
    await acceptShipperRequest({ userType });

    //refetch data to get updated journey status with accepted company assignment before accepting shipper request
    await getDriverJourneyStatus({ userType });
  } else {
    console.log(
      "⏳ Driver has no pending assignment or match yet (status:",
      journeyStatus?.status,
      ")",
    );
    return;
  }

  // Only start/complete journey if driver has an active accepted assignment
  await startJourney({ userType });

  //refetch data to get updated journey status with accepted company assignment before accepting shipper request
  await getDriverJourneyStatus({ userType });
  await completeJourney({ userType });

  //refetch data to get updated journey status with accepted company assignment before accepting shipper request
  await getDriverJourneyStatus({ userType });
  console.log(
    "\n✅ ========== DRIVER ONBOARDING FLOW COMPLETED SUCCESSFULLY ==========\n",
  );
};
const driversFinancialFlows = async ({ userType = "driver" }) => {
  console.log("\n✅ ========== DRIVER FINANCIAL FLOWS STARTED ==========\n");
  // await testDriverBalanceFlow({ userType });
  // await testDriverDepositFlow({ userType });
  //create financial institution account as some of the financial flows require an existing account to work, and we want to have at least one account in place before testing those flows
  // await createFinancialInstitutionAccount({ userType });

  const financialInstitutionAccounts = await getFinancialInstitutionAccounts({
    userType,
  });

  const subscriptionPlan = await getSubscriptionPlans({});

  // await testDriverSubscriptionFlow({ userType, financialInstitutionAccounts:financialInstitutionAccounts.data?.[0]});

  // await testDriverTransferFlow({ userType });
  // await testDriverWalletFlow({ userType });
  console.log(
    "\n✅ ========== DRIVER FINANCIAL FLOWS COMPLETED SUCCESSFULLY ==========\n",
  );
};

module.exports = {
  driversFinancialFlows,
  testDriverOnboardingFlow,
  testDriverBalanceFlow: require("./DriversFinance/DriverBalance")
    .testDriverBalanceFlow,
  testDriverDepositFlow: require("./DriversFinance/DriverDeposit")
    .testDriverDepositFlow,
  testDriverSubscriptionFlow: require("./DriversFinance/DriverSubscription")
    .testDriverSubscriptionFlow,
  testDriverTransferFlow: require("./DriversFinance/DriverTransfer")
    .testDriverTransferFlow,
  testDriverWalletFlow: require("./DriversFinance/DriverWallet")
    .testDriverWalletFlow,
};
