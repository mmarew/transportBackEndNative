const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { usersData, backendURL } = require("../../constants");
const { getDepositSources } = require("./DepositSources ");
const { getFinancialInstitutionAccounts } = require("./FinancialInstitutions");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const getAdminToken = () => {
  const token = usersData.admin?.token || usersData.supperAdmin?.token;
  if (!token) {
    throw new Error(
      "Admin or supperAdmin token is required for admin deposit operations.",
    );
  }
  return token;
};

const approveDriversDeposit = async ({
  userDepositUniqueId,
  updateData = { depositStatus: "approved" },
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
  const token = getAdminToken();

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
  depositURL,
  userType = "driver",
} = {}) => {
  if (!accountUniqueId) {
    throw new Error("accountUniqueId is required to create a deposit.");
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to create a deposit.");
  }

  // Generate unique deposit URL if not provided
  if (!depositURL) {
    depositURL = `https://example.com/deposit-callback?txn=${uuidv4()}`;
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
  query = { userUniqueId: "self", depositStatus: "requested,approved" },
  admin = false,
} = {}) => {
  const token = admin ? getAdminToken() : usersData[userType]?.token;
  if (!token) {
    throw new Error(
      admin
        ? "Admin or supperAdmin token is required to fetch admin deposits."
        : "Driver token is required to fetch deposits.",
    );
  }

  const res = await axios.get(`${backendURL}/api/finance/userDeposit`, {
    ...authConfig(token),
    params: query,
  });
  console.log(
    `✅ Fetched driver deposits${admin ? " (admin)" : ""}`,
    res.data?.data?.length || 0,
  );
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

  await getDriverDeposits({
    admin: true,
    query: { userUniqueId: "self", depositStatus: "requested,approved" },
  });

  await approveDriversDeposit({ userDepositUniqueId });
  await deleteDriverDeposit({ userDepositUniqueId, userType });

  console.log("✅ ========== DRIVER DEPOSIT FLOW COMPLETED ==========");
  return { userDepositUniqueId, accountUniqueId };
};

module.exports = {
  approveDriversDeposit,
  getAdminToken,
  createDriverDeposit,
  getDriverDeposits,
  updateDriverDeposit,
  deleteDriverDeposit,
  testDriverDepositFlow,
  getUnAuthorizedDriverDeposits,
};
