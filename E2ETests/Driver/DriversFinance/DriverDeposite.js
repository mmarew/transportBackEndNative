const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { getDepositSources } = require("./DepositSources ");
const { getFinancialInstitutionAccounts } = require("./FinancialInstituitions");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});
const approveDriversDeposit = async ({
  userDepositUniqueId,
  updateData = { depositStatus: "APPROVED" },
} = {}) => {
  if (!userDepositUniqueId) {
    throw new Error("userDepositUniqueId is required to approve a deposit.");
  }

  const token = usersData.admin?.token || usersData.supperAdmin?.token;
  if (!token) {
    throw new Error(
      "Admin or supperAdmin token is required to approve deposits.",
    );
  }

  const res = await axios.put(
    `${backendURL}/api/finance/userDeposit/${userDepositUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log("✅ Approved driver deposit", userDepositUniqueId);
  return res.data;
};
const getUnAuthorizedDriverDeposits = async () => {
  const token = usersData.admin?.token || usersData.supperAdmin?.token;
  if (!token) {
    throw new Error(
      "Admin or supperAdmin token is required to fetch unauthorized deposits.",
    );
  }

  const res = await axios.get(`${backendURL}/api/finance/userDeposit`, {
    ...authConfig(token),
    params: { depositStatus: "PENDING" },
  });
  console.log(
    "✅ Fetched unauthorized driver deposits",
    res.data?.data?.length || 0,
  );
  return res.data;
};
const createDriverDeposit = async ({
  depositAmount = 150,
  accountUniqueId,
  depositURL = "https://example.com/deposit-callback",
  userType = "driver",
} = {}) => {
  if (!accountUniqueId) {
    throw new Error("accountUniqueId is required to create a deposit.");
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to create a deposit.");
  }
  const depositSourcesData = await getDepositSources({ userType });
  const depositSources = depositSourcesData?.data || [];
  if (depositSources.length === 0) {
    throw new Error("No deposit sources available for the driver.");
  }
  const depositSourceUniqueId = depositSources?.[0]?.depositSourceUniqueId;

  const payload = {
    depositAmount,
    accountUniqueId,
    depositURL,
    depositSourceUniqueId,
  };

  const res = await axios.post(
    `${backendURL}/api/finance/userDeposit`,
    payload,
    authConfig(token),
  );
  console.log("✅ Created driver deposit", res.data?.data?.userDepositUniqueId);
  return res.data;
};

const getDriverDeposits = async ({
  userType = "driver",
  query = { userUniqueId: "self" },
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch deposits.");
  }

  const res = await axios.get(`${backendURL}/api/finance/userDeposit`, {
    ...authConfig(token),
    params: query,
  });
  console.log("✅ Fetched driver deposits", res.data?.data?.length || 0);
  return res.data;
};

const updateDriverDeposit = async ({
  userDepositUniqueId,
  updateData,
  userType = "driver",
} = {}) => {
  if (!userDepositUniqueId) {
    throw new Error("userDepositUniqueId is required to update a deposit.");
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to update a deposit.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/userDeposit/${userDepositUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log("✅ Updated driver deposit", userDepositUniqueId);
  return res.data;
};

const deleteDriverDeposit = async ({
  userDepositUniqueId,
  userType = "driver",
} = {}) => {
  if (!userDepositUniqueId) {
    throw new Error("userDepositUniqueId is required to delete a deposit.");
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to delete a deposit.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/userDeposit/${userDepositUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted driver deposit", userDepositUniqueId);
  return res.data;
};

const testDriverDepositFlow = async ({ userType = "driver" } = {}) => {
  console.log("\n✅ ========== DRIVER DEPOSIT FLOW STARTED ==========");

  //   const accountPayload = await createFinancialInstitutionAccount({ userType });
  //   console.log("🚀 ~ testDriverDepositFlow ~ accountPayload:", accountPayload);
  //   const accountUniqueId = accountPayload?.data?.accountUniqueId;
  const financialAccounts = await getFinancialInstitutionAccounts({ userType });
  console.log(
    "🚀 ~ testDriverDepositFlow ~ financialAccounts:",
    financialAccounts,
  );
  const accountUniqueId = financialAccounts?.data?.[0]?.accountUniqueId;
  if (!accountUniqueId) {
    throw new Error(
      "Financial account creation did not return accountUniqueId.",
    );
  }

  const depositPayload = await createDriverDeposit({
    accountUniqueId,
    userType,
  });
  const userDepositUniqueId = depositPayload?.data?.userDepositUniqueId;
  if (!userDepositUniqueId) {
    throw new Error("Deposit creation did not return userDepositUniqueId.");
  }

  await getDriverDeposits({ userType, query: { userUniqueId: "self" } });
  await updateDriverDeposit({
    userDepositUniqueId,
    updateData: {
      depositStatus: "PENDING",
      depositURL: "https://example.com/updated-deposit",
    },
    userType,
  });
  await deleteDriverDeposit({ userDepositUniqueId, userType });

  console.log("✅ ========== DRIVER DEPOSIT FLOW COMPLETED ==========");
  return { userDepositUniqueId, accountUniqueId };
};

module.exports = {
  createDriverDeposit,
  getDriverDeposits,
  updateDriverDeposit,
  deleteDriverDeposit,
  testDriverDepositFlow,
};
