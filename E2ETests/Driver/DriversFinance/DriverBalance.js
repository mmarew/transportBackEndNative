const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { getDriversAccountData } = require("../RequirementOfDriver");
const { v4: uuidv4 } = require("uuid");
const { authConfig } = require("./DriverSubscription");

const resolveDriverUniqueId = async ({ userType = "driver" } = {}) => {
  const userData = usersData[userType];

  if (!userData) {
    throw new Error(`Missing usersData for ${userType}`);
  }

  if (userData.accountData?.userData?.userUniqueId) {
    return userData.accountData?.userData?.userUniqueId;
  }

  if (!userData.token) {
    throw new Error(`Missing token for ${userType}`);
  }

  let accountData = await getDriversAccountData({ token: userData.token });
  if (!accountData?.userData?.userUniqueId) {
    throw new Error("Unable to resolve driverUniqueId from account data");
  }

  return accountData?.userData?.userUniqueId;
};

const createDriverBalance = async ({
  amount = 200,
  userType = "driver",
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to create a balance record.");
  }

  const driverUniqueId = await resolveDriverUniqueId({ userType });
  const payload = {
    amount,
    driverUniqueId,
    addOrDeduct: "add",
    transactionUniqueId: uuidv4(),
    transactionType: "Deposit",
  };
  const res = await axios.post(
    `${backendURL}/api/finance/userBalance`,
    payload,
    authConfig(token),
  );

  console.log(
    "✅ Created driver balance record",
    res.data?.data?.userBalanceUniqueId || res.data?.data?.userBalanceId,
  );
  return res.data;
};

const getDriverBalances = async ({
  userType = "driver",
  query = { userUniqueId: "self" },
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch balances.");
  }

  const res = await axios.get(`${backendURL}/api/finance/userBalance`, {
    ...authConfig(token),
    params: query,
  });
  console.log("✅ Fetched driver balances", res.data?.data?.length || 0);
  return res.data;
};

const updateDriverBalance = async ({
  userBalanceUniqueId,
  updateData,
  userType = "driver",
} = {}) => {
  if (!userBalanceUniqueId) {
    throw new Error(
      "userBalanceUniqueId is required to update a balance record.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to update a balance record.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/userBalance/${userBalanceUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log("✅ Updated driver balance record", userBalanceUniqueId);
  return res.data;
};

const deleteDriverBalance = async ({
  userBalanceUniqueId,
  userType = "driver",
} = {}) => {
  if (!userBalanceUniqueId) {
    throw new Error(
      "userBalanceUniqueId is required to delete a balance record.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to delete a balance record.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/userBalance/${userBalanceUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted driver balance record", userBalanceUniqueId);
  return res.data;
};

const testDriverBalanceFlow = async ({ userType = "driver" } = {}) => {
  console.log("\n✅ ========== DRIVER BALANCE FLOW STARTED ==========");

  const createdBalance = await createDriverBalance({ amount: 250, userType });
  const userBalanceUniqueId = createdBalance?.data?.userBalanceUniqueId;
  if (!userBalanceUniqueId) {
    throw new Error("Created balance record did not return a unique ID.");
  }

  await getDriverBalances({ userType, query: { userUniqueId: "self" } });
  await updateDriverBalance({
    userBalanceUniqueId,
    updateData: { amount: 275 },
    userType,
  });
  await deleteDriverBalance({ userBalanceUniqueId, userType });

  console.log("✅ ========== DRIVER BALANCE FLOW COMPLETED ==========");
  return { userBalanceUniqueId };
};

module.exports = {
  createDriverBalance,
  getDriverBalances,
  updateDriverBalance,
  deleteDriverBalance,
  testDriverBalanceFlow,
};
