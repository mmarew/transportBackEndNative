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
  createDriverSubscription,
} = require("./DriversFinance/DriverSubscription");
const {
  getFinancialInstitutionAccounts,
  createFinancialInstitutionAccount,
} = require("./DriversFinance/FinancialInstitutions");
const { getSubscriptionPlans } = require("./DriversFinance/SubscriptionPlan");
const {
  fetchSubscriptionPlanPricing,
  fetchSubscriptionPlanPricingByPlanId,
  createSubscriptionPlanPricing,
} = require("./DriversFinance/SubscriptionPlanPricing");
const {
  createDriverDeposit,
  approveDriversDeposit,
} = require("./DriversFinance/DriverDeposit");
const {
  getUnAuthorizedDriverDeposits,
} = require("./DriversFinance/DriverDeposit");

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
  await testDriverDepositFlow({ userType });
  //create financial institution account as some of the financial flows require an existing account to work, and we want to have at least one account in place before testing those flows
  // await createFinancialInstitutionAccount({ userType });

  const token = usersData[userType]?.token;

  // Fetch driver account data to get driverUniqueId
  const driverAccountData = await getDriversAccountData({ token });
  console.log(
    "🚀 ~ driversFinancialFlows ~ driverAccountData:",
    driverAccountData,
  );
  const driverUniqueId = driverAccountData?.userData?.userUniqueId;
  console.log("🚀 ~ driversFinancialFlows ~ driverUniqueId:", driverUniqueId);

  const financialInstitutionAccounts = await getFinancialInstitutionAccounts({
    userType,
  });
  console.log(
    "🚀 ~ driversFinancialFlows ~ financialInstitutionAccounts:",
    financialInstitutionAccounts,
  );

  const subscriptionPlan = await getSubscriptionPlans({
    token,
  });

  // Generate a unique future date (today + 30 days) to avoid conflicts
  const today = new Date();
  const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const effectiveFrom = futureDate.toISOString().split("T")[0];

  const price = 500;
  // unregisteredPlans is a plan which doesn't have an active price now
  const unregisteredPlans = [];
  const listOfPlanPricing = await fetchSubscriptionPlanPricing({
    token: usersData["admin"]?.token,
  });
  console.log(
    "🚀 ~ driversFinancialFlows ~ listOfPlanPricing:",
    listOfPlanPricing,
  );
  for (const plan of subscriptionPlan) {
    const planUniqueId = plan?.subscriptionPlanUniqueId;
    if (!planUniqueId) {
      continue;
    }

    const existingPricing = await fetchSubscriptionPlanPricingByPlanId({
      token: usersData[userType]?.token,
      subscriptionPlanUniqueId: planUniqueId,
      isActive: true,
      date: effectiveFrom,
    });

    const pricingExists = Array.isArray(existingPricing)
      ? existingPricing.length > 0
      : !!existingPricing;

    if (pricingExists) {
      console.log(
        `⏭️  Pricing already exists for plan ${planUniqueId} on ${effectiveFrom} — skipping.`,
      );
    } else {
      unregisteredPlans.push(plan);
    }
  }

  console.log(
    "🚀 ~ driversFinancialFlows ~ unregisteredPlans:",
    unregisteredPlans,
  );

  for (const plan of unregisteredPlans) {
    const planUniqueId = plan?.subscriptionPlanUniqueId;
    try {
      const newPlanPricing = await createSubscriptionPlanPricing({
        subscriptionPlanUniqueId: planUniqueId,
        price,
        currency: "ETB",
        durationInDays: 30,
        token: usersData["admin"]?.token,
        effectiveFrom,
      });
      console.log(
        `✅ Created pricing for plan ${planUniqueId}:`,
        newPlanPricing?.data,
      );
    } catch (error) {
      const errorMsg = error?.response?.data?.message || error.message || "";
      if (
        errorMsg.includes("pricing configuration already exists") ||
        errorMsg.includes("already an active pricing")
      ) {
        console.log(
          `⏭️  Pricing already exists for plan ${planUniqueId} — skipping.`,
        );
      } else {
        console.error(
          `❌ Failed to create pricing for plan ${planUniqueId}:`,
          error?.response?.data || error.message,
        );
      }
    }
  }
  //this create driver deposit is used to create new one because the workflow testDriverDepositFlow has delete effect and can't be used to create subscriptions.
  const depositPayload = {
    depositAmount: 1500000,
    accountUniqueId: financialInstitutionAccounts.data?.[0]?.accountUniqueId,
    // depositURL: "https://1example.com/driver-deposit-proof1",
    userType: "driver",
  };

  const newDriverDeposit = await createDriverDeposit({
    ...depositPayload,
  });

  //after driver make deposit, now let admin approve the deposit to move the flow forward
  //get unauthorized deposits to find the unique id of the newly created deposit, then approve it
  const unauthorizedDeposits = await getUnAuthorizedDriverDeposits();
  console.log(
    "🚀 ~ driversFinancialFlows ~ unauthorizedDeposits:",
    unauthorizedDeposits,
  );
  const promisedData = await Promise.all(
    (unauthorizedDeposits?.data || [])?.map(async (deposit) => {
      const userDepositUniqueId = deposit?.userDepositUniqueId;
      await approveDriversDeposit({ userDepositUniqueId });
    }),
  );
  //create subscription for the driver after deposit approval

  await createDriverSubscription({
    userType,
    driverUniqueId,
    subscriptionPlanPricingUniqueId:
      listOfPlanPricing?.[1]?.subscriptionPlanPricingUniqueId,
  });

  await testDriverTransferFlow({ userType });
  await testDriverWalletFlow({ userType });
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
