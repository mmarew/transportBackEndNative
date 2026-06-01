const axios = require("axios");
const { usersData, backendURL } = require("../constants");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const getAdminToken = () => {
  const adminToken = usersData.admin?.token;
  const supperAdminToken = usersData.supperAdmin?.token;
  if (adminToken) return adminToken;
  if (supperAdminToken) return supperAdminToken;
  throw new Error("Admin or supperAdmin token is required for deposit source operations.");
};

const createDepositSource = async ({
  sourceKey = `bank_source_${Date.now()}`,
  sourceLabel = "Bank Source",
} = {}) => {
  const token = getAdminToken();
  const payload = { sourceKey, sourceLabel };

  const res = await axios.post(
    `${backendURL}/api/finance/depositSource`,
    payload,
    authConfig(token),
  );
  console.log("✅ Created deposit source", res.data?.data);
  return res.data;
};

const getDepositSources = async () => {
  const token = getAdminToken();
  const res = await axios.get(
    `${backendURL}/api/finance/depositSource`,
    authConfig(token),
  );
  console.log("✅ Fetched deposit sources", res.data?.data?.length || 0);
  return res.data;
};

const getDepositSourceByUniqueId = async ({ depositSourceUniqueId }) => {
  if (!depositSourceUniqueId) {
    throw new Error("depositSourceUniqueId is required to fetch a deposit source.");
  }
  const token = getAdminToken();
  const res = await axios.get(
    `${backendURL}/api/finance/depositSource/${depositSourceUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Fetched deposit source", depositSourceUniqueId);
  return res.data;
};

const updateDepositSource = async ({
  depositSourceUniqueId,
  updates = {},
} = {}) => {
  if (!depositSourceUniqueId) {
    throw new Error("depositSourceUniqueId is required to update a deposit source.");
  }
  const token = getAdminToken();
  const res = await axios.put(
    `${backendURL}/api/finance/depositSource/${depositSourceUniqueId}`,
    updates,
    authConfig(token),
  );
  console.log("✅ Updated deposit source", depositSourceUniqueId);
  return res.data;
};

const deleteDepositSource = async ({ depositSourceUniqueId } = {}) => {
  if (!depositSourceUniqueId) {
    throw new Error("depositSourceUniqueId is required to delete a deposit source.");
  }
  const token = getAdminToken();
  const res = await axios.delete(
    `${backendURL}/api/finance/depositSource/${depositSourceUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted deposit source", depositSourceUniqueId);
  return res.data;
};

const testDepositSourceFlow = async () => {
  console.log("\n✅ ========== DEPOSIT SOURCE FLOW STARTED ==========");

  const created = await createDepositSource();
  const depositSourceUniqueId = created?.data?.depositSourceUniqueId;
  if (!depositSourceUniqueId) {
    throw new Error("Deposit source creation did not return depositSourceUniqueId.");
  }

  await getDepositSources();
  await getDepositSourceByUniqueId({ depositSourceUniqueId });
  await updateDepositSource({
    depositSourceUniqueId,
    updates: { sourceLabel: "Updated Bank Source" },
  });
  await deleteDepositSource({ depositSourceUniqueId });

  console.log("✅ ========== DEPOSIT SOURCE FLOW COMPLETED ==========");
  return { depositSourceUniqueId };
};

module.exports = {
  createDepositSource,
  getDepositSources,
  getDepositSourceByUniqueId,
  updateDepositSource,
  deleteDepositSource,
  testDepositSourceFlow,
};
