const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { createDriverBalance } = require("./DriverBalance");
const {
  createFinancialInstitutionAccount,
  createDriverDeposit,
} = require("./DriverDeposit");
const {
  createDriverTransfer,
  getDriverTransfers,
} = require("./DriverTransfer");
const {
  testCreateFinancialInstitutionAccount,
} = require("../../Finance/FinancialInstitutionAccount");
const { authConfig } = require("./DriverSubscription");

const getDriverWalletOverview = async ({ userType = "driver" } = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch wallet overview.");
  }

  const [balances, deposits, transfers] = await Promise.all([
    axios.get(`${backendURL}/api/finance/userBalance`, {
      ...authConfig(token),
      params: { userUniqueId: "self" },
    }),
    axios.get(`${backendURL}/api/finance/userDeposit`, {
      ...authConfig(token),
      params: { userUniqueId: "self" },
    }),
    axios.get(`${backendURL}/api/finance/userBalanceTransfer`, {
      ...authConfig(token),
      params: { fromDriverUniqueId: "self" },
    }),
  ]);

  const overview = {
    balances: balances.data?.data || [],
    deposits: deposits.data?.data || [],
    transfers: transfers.data?.data || [],
  };

  console.log(
    `✅ Wallet overview loaded: ${overview.balances.length} balances, ${overview.deposits.length} deposits, ${overview.transfers.length} transfers`,
  );
  return overview;
};

const testDriverWalletFlow = async ({ userType = "driver" } = {}) => {
  console.log("\n✅ ========== DRIVER WALLET FLOW STARTED ==========");
  const financialAccount = await testCreateFinancialInstitutionAccount({
    user: usersData[userType],
  });
  const accountUniqueId = financialAccount?.data?.accountUniqueId;
  // if (!accountUniqueId) {
  //   throw new Error(
  //     "Failed to create a financial institution account for wallet flow.",
  //   );
  // }

  // await createDriverBalance({ amount: 1000, userType });
  if (accountUniqueId)
    await createDriverDeposit({
      accountUniqueId,
      depositAmount: 250,
      userType,
    });
  const transferResult = await createDriverTransfer({
    transferredAmount: 50,
    userType,
  });

  const overview = await getDriverWalletOverview({ userType });
  console.log("✅ ========== DRIVER WALLET FLOW COMPLETED ==========");

  return {
    accountUniqueId,
    depositTransferUniqueId: transferResult?.data?.depositTransferUniqueId,
    overview,
  };
};

module.exports = {
  getDriverWalletOverview,
  testDriverWalletFlow,
};
