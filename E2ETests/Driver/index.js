const { testAuthWorkFlow } = require("../Auth");

const {
  getDriversAccountData,
  evaluateDriversDocumentVehicleRequirement,
} = require("./RequirementOfDriver");
const { usersData, listOfPlanPricing } = require("../constants");

const { testDriverDepositFlow } = require("./DriversFinance/DriverDeposit");
const { testDriverTransferFlow } = require("./DriversFinance/DriverTransfer");
const { testDriverWalletFlow } = require("./DriversFinance/DriverWallet");
const {
  createDriverSubscription,
} = require("./DriversFinance/DriverSubscription");
const {
  testGetFinancialInstitutionAccounts,
  testFinancialInstitutionAccountWorkflow:
    testFinancialInstitutionAccountsWorkFlow,
} = require("../Finance/FinancialInstitutionAccount");
// testGetSubscriptionPlans unused
const {
  testGetSubscriptionPlanPricings:
    fetchSubscriptionPlanPricing,
  testCreateSubscriptionPlanPricing:
    createSubscriptionPlanPricing,
} = require("../Finance/SubscriptionPlanPricing");
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
  console.log(
    "\n✅ ========== DRIVER ONBOARDING FLOW COMPLETED SUCCESSFULLY ==========\n",
  );
};
const driversFinancialFlows = async ({ userType = "driver" }) => {
  console.log("\n✅ ========== DRIVER FINANCIAL FLOWS STARTED ==========\n");
  // await testDriverBalanceFlow({ userType });
  await testDriverDepositFlow({ userType });
  await testFinancialInstitutionAccountsWorkFlow({});
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

  const financialInstitutionAccounts = await testGetFinancialInstitutionAccounts({
    user: usersData[userType],
  });
  console.log(
    "🚀 ~ driversFinancialFlows ~ financialInstitutionAccounts:",
    financialInstitutionAccounts,
  );
  await createSubscriptionPlanPricing({});
  const planPricingResult = await fetchSubscriptionPlanPricing({
    user: usersData.admin,
  });
  listOfPlanPricing.data = planPricingResult?.data;
  // const subscriptionPlan = await getSubscriptionPlans({
  //   token,
  // });

  // // Generate a unique future date (today + 30 days) to avoid conflicts
  // const today = new Date();
  // const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  // const effectiveFrom = futureDate.toISOString().split("T")[0];

  // const price = 500;
  // // unregisteredPlans is a plan which doesn't have an active price now
  // const unregisteredPlans = [];
  // const listOfPlanPricing = await fetchSubscriptionPlanPricing({
  //   token: usersData["admin"]?.token,
  // });
  // console.log(
  //   "🚀 ~ driversFinancialFlows ~ listOfPlanPricing:",
  //   listOfPlanPricing,
  // );
  // for (const plan of subscriptionPlan) {
  //   const planUniqueId = plan?.subscriptionPlanUniqueId;
  //   if (!planUniqueId) {
  //     continue;
  //   }

  //   const existingPricing = await fetchSubscriptionPlanPricingByPlanId({
  //     token: usersData[userType]?.token,
  //     subscriptionPlanUniqueId: planUniqueId,
  //     isActive: true,
  //     date: effectiveFrom,
  //   });

  //   const pricingExists = Array.isArray(existingPricing)
  //     ? existingPricing.length > 0
  //     : !!existingPricing;

  //   if (pricingExists) {
  //     console.log(
  //       `⏭️  Pricing already exists for plan ${planUniqueId} on ${effectiveFrom} — skipping.`,
  //     );
  //   } else {
  //     unregisteredPlans.push(plan);
  //   }
  // }

  // console.log(
  //   "🚀 ~ driversFinancialFlows ~ unregisteredPlans:",
  //   unregisteredPlans,
  // );

  // for (const plan of unregisteredPlans) {
  //   const planUniqueId = plan?.subscriptionPlanUniqueId;
  //   try {
  //     const newPlanPricing = await createSubscriptionPlanPricing({
  //       subscriptionPlanUniqueId: planUniqueId,
  //       price,
  //       currency: "ETB",
  //       durationInDays: 30,
  //       token: usersData["admin"]?.token,
  //       effectiveFrom,
  //     });
  //     console.log(
  //       `✅ Created pricing for plan ${planUniqueId}:`,
  //       newPlanPricing?.data,
  //     );
  //   } catch (error) {
  //     const errorMsg = error?.response?.data?.message || error.message || "";
  //     if (
  //       errorMsg.includes("pricing configuration already exists") ||
  //       errorMsg.includes("already an active pricing")
  //     ) {
  //       console.log(
  //         `⏭️  Pricing already exists for plan ${planUniqueId} — skipping.`,
  //       );
  //     } else {
  //       console.error(
  //         `❌ Failed to create pricing for plan ${planUniqueId}:`,
  //         error?.response?.data || error.message,
  //       );
  //     }
  //   }
  // }
  //this create driver deposit is used to create new one because the workflow testDriverDepositFlow has delete effect and can't be used to create subscriptions.
  const depositPayload = {
    depositAmount: 1500000,
    accountUniqueId: financialInstitutionAccounts.data?.[0]?.accountUniqueId,
    // depositURL: "https://1example.com/driver-deposit-proof1",
    userType: "driver",
  };

  await createDriverDeposit({
    ...depositPayload,
  });

  //after driver make deposit, now let admin approve the deposit to move the flow forward
  //get unauthorized deposits to find the unique id of the newly created deposit, then approve it
  const unauthorizedDeposits = await getUnAuthorizedDriverDeposits();
  console.log(
    "🚀 ~ driversFinancialFlows ~ unauthorizedDeposits:",
    unauthorizedDeposits,
  );
  await Promise.all(
    (unauthorizedDeposits?.data || [])?.map(async (deposit) => {
      const userDepositUniqueId = deposit?.userDepositUniqueId;
      await approveDriversDeposit({ userDepositUniqueId });
    }),
  );
  //create subscription for the driver after deposit approval

  console.log(
    "🚀 ~ driversFinancialFlows ~ listOfPlanPricing:",
    listOfPlanPricing,
  );
  await createDriverSubscription({
    userType,
    driverUniqueId,
    subscriptionPlanPricingUniqueId:
      listOfPlanPricing?.data?.[1]?.subscriptionPlanPricingUniqueId,
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
