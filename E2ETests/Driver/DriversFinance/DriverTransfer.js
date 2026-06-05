const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { getDriversAccountData } = require("../RequirementOfDriver");
const { authConfig } = require("./DriverSubscription");

const resolveDriverUserUniqueId = async ({ userType = "driver" } = {}) => {
  const userData = usersData[userType];
  if (userData?.accountData?.userData?.userUniqueId) {
    return userData.accountData.userData.userUniqueId;
  }

  if (!userData?.token) {
    throw new Error(`Missing token for ${userType}`);
  }

  const accountData = await getDriversAccountData({ token: userData.token });
  if (!accountData?.userData?.userUniqueId) {
    throw new Error("Unable to resolve driver userUniqueId from account data");
  }

  return accountData.userData.userUniqueId;
};

const createDriverTransfer = async ({
  transferredAmount = 100,
  toDriverUniqueId,
  userType = "driver",
  reason = "E2E self-transfer",
} = {}) => {
  try {
    const token = usersData[userType]?.token;
    if (!token) {
      throw new Error("Driver token is required to create a transfer.");
    }

    //     const payload = {
    //   fromDriverUniqueId: "16ea3d2f-a100-4659-8f4b-1f247d55225a",
    //   toDriverUniqueId: "fa481402-cf14-4cee-9d52-dad91f48b84d",
    //   transferredAmount: "10000",
    //   reason: "help",
    // };
    // await axios.post(
    //   `${backendURL}/api/finance/userBalanceTransfer/self`,
    //   payload,
    //   authConfig(usersData[userType]?.token),
    // );

    const fromDriverUniqueId = await resolveDriverUserUniqueId({ userType });
    const transferTarget = toDriverUniqueId || fromDriverUniqueId;
    const res = await axios.post(
      `${backendURL}/api/finance/userBalanceTransfer/self`,
      {
        fromDriverUniqueId: "16ea3d2f-a100-4659-8f4b-1f247d55225a",
        toDriverUniqueId: "fa481402-cf14-4cee-9d52-dad91f48b84d",
        transferredAmount: "10000",
        reason: "help",
      },
      authConfig(token),
    );

    console.log(
      "✅ Created driver transfer",
      res.data?.data?.depositTransferUniqueId,
    );
    return res.data;
  } catch (error) {
    console.log("@error on  balance transfer", error.data);
  }
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
  try {
  } catch (error) {}
  console.log("\n✅ ========== DRIVER TRANSFER FLOW STARTED ==========");

  const driverUniqueId = await resolveDriverUserUniqueId({ userType });
  const balanceAmount = 300;

  const transferPayload = await createDriverTransfer({
    transferredAmount: 75,
    toDriverUniqueId: driverUniqueId,
    userType,
    reason: "E2E transfer to self",
  });
  const depositTransferUniqueId =
    transferPayload?.data?.depositTransferUniqueId;
  // if (!depositTransferUniqueId) {
  //   throw new Error(
  //     "Transfer creation did not return depositTransferUniqueId.",
  //   );
  // }

  await getDriverTransfers({ userType, query: { fromDriverUniqueId: "self" } });
  if (!!depositTransferUniqueId) {
    await getDriverTransferById({ depositTransferUniqueId, userType });
    await updateDriverTransfer({
      depositTransferUniqueId,
      updateData: {
        transferStatus: "COMPLETED",
        adminNotes: "Verified by E2E",
      },
      userType,
    });
    await deleteDriverTransfer({ depositTransferUniqueId, userType });

    console.log("✅ ========== DRIVER TRANSFER FLOW COMPLETED ==========");
    return { depositTransferUniqueId };
  }
};

module.exports = {
  createDriverTransfer,
  getDriverTransfers,
  getDriverTransferById,
  updateDriverTransfer,
  deleteDriverTransfer,
  testDriverTransferFlow,
};
