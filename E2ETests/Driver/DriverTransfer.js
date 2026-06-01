const axios = require("axios");
const { usersData, backendURL } = require("../constants");
const { getDriversAccountData } = require("./RequirementOfDriver");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const resolveDriverUserUniqueId = async ({ userType = "driver" } = {}) => {
  const userData = usersData[userType];
  if (userData?.accountData?.userUniqueId) {
    return userData.accountData.userUniqueId;
  }

  if (!userData?.token) {
    throw new Error(`Missing token for ${userType}`);
  }

  const accountData = await getDriversAccountData({ token: userData.token });
  if (!accountData?.userUniqueId) {
    throw new Error("Unable to resolve driver userUniqueId from account data");
  }

  return accountData.userUniqueId;
};

const createDriverTransfer = async ({
  transferredAmount = 100,
  toDriverUniqueId,
  userType = "driver",
  reason = "E2E self-transfer",
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to create a transfer.");
  }

  const fromDriverUniqueId = await resolveDriverUserUniqueId({ userType });
  const transferTarget = toDriverUniqueId || fromDriverUniqueId;
  const res = await axios.post(
    `${backendURL}/api/finance/userBalanceTransfer/self`,
    {
      toDriverUniqueId: transferTarget,
      transferredAmount,
      reason,
    },
    authConfig(token),
  );

  console.log(
    "✅ Created driver transfer",
    res.data?.data?.depositTransferUniqueId,
  );
  return res.data;
};

const getDriverTransfers = async ({
  userType = "driver",
  query = { fromDriverUniqueId: "self" },
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch transfers.");
  }

  const res = await axios.get(`${backendURL}/api/finance/userBalanceTransfer`, {
    ...authConfig(token),
    params: query,
  });
  console.log("✅ Fetched driver transfers", res.data?.data?.length || 0);
  return res.data;
};

const getDriverTransferById = async ({
  depositTransferUniqueId,
  userType = "driver",
} = {}) => {
  if (!depositTransferUniqueId) {
    throw new Error(
      "depositTransferUniqueId is required to fetch transfer details.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch transfer details.");
  }

  const res = await axios.get(
    `${backendURL}/api/finance/userBalanceTransfer/${depositTransferUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Fetched driver transfer details", depositTransferUniqueId);
  return res.data;
};

const updateDriverTransfer = async ({
  depositTransferUniqueId,
  updateData,
  userType = "driver",
} = {}) => {
  if (!depositTransferUniqueId) {
    throw new Error(
      "depositTransferUniqueId is required to update a transfer.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to update a transfer.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/userBalanceTransfer/${depositTransferUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log("✅ Updated driver transfer", depositTransferUniqueId);
  return res.data;
};

const deleteDriverTransfer = async ({
  depositTransferUniqueId,
  userType = "driver",
} = {}) => {
  if (!depositTransferUniqueId) {
    throw new Error(
      "depositTransferUniqueId is required to delete a transfer.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to delete a transfer.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/userBalanceTransfer/${depositTransferUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted driver transfer", depositTransferUniqueId);
  return res.data;
};

const testDriverTransferFlow = async ({ userType = "driver" } = {}) => {
  console.log("\n✅ ========== DRIVER TRANSFER FLOW STARTED ==========");

  const driverUniqueId = await resolveDriverUserUniqueId({ userType });
  const balanceAmount = 300;

  await axios.post(
    `${backendURL}/api/finance/userBalance`,
    { amount: balanceAmount, driverUniqueId },
    authConfig(usersData[userType]?.token),
  );

  const transferPayload = await createDriverTransfer({
    transferredAmount: 75,
    toDriverUniqueId: driverUniqueId,
    userType,
    reason: "E2E transfer to self",
  });
  const depositTransferUniqueId =
    transferPayload?.data?.depositTransferUniqueId;
  if (!depositTransferUniqueId) {
    throw new Error(
      "Transfer creation did not return depositTransferUniqueId.",
    );
  }

  await getDriverTransfers({ userType, query: { fromDriverUniqueId: "self" } });
  await getDriverTransferById({ depositTransferUniqueId, userType });
  await updateDriverTransfer({
    depositTransferUniqueId,
    updateData: { transferStatus: "COMPLETED", adminNotes: "Verified by E2E" },
    userType,
  });
  await deleteDriverTransfer({ depositTransferUniqueId, userType });

  console.log("✅ ========== DRIVER TRANSFER FLOW COMPLETED ==========");
  return { depositTransferUniqueId };
};

module.exports = {
  createDriverTransfer,
  getDriverTransfers,
  getDriverTransferById,
  updateDriverTransfer,
  deleteDriverTransfer,
  testDriverTransferFlow,
};
