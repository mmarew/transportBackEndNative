const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { authConfig } = require("./DriverSubscription");

const testCreateFinancialInstitutionAccount = async ({
  institutionName = "Test Bank",
  accountNumber = `ACC-${Date.now()}`,
  accountHolderName = "Test Driver",
  accountType = "bank",
  isActive = true,
  userType = "driver",
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error(
      "Token is required to create a financial institution account.",
    );
  }

  const payload = {
    institutionName,
    accountNumber,
    accountHolderName,
    accountType,
    isActive,
  };

  const res = await axios.post(
    `${backendURL}/api/finance/financialInstitutionAccount`,
    payload,
    authConfig(token),
  );

  console.log(
    "✅ Created financial institution account",
    res.data?.data?.accountUniqueId,
  );
  return res.data;
};

const getFinancialInstitutionAccounts = async ({
  userType = "driver",
  query = {},
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error(
      "Token is required to fetch financial institution accounts.",
    );
  }

  const res = await axios.get(
    `${backendURL}/api/finance/financialInstitutionAccount`,
    {
      ...authConfig(token),
      params: query,
    },
  );

  return res.data;
};

const updateFinancialInstitutionAccount = async ({
  accountUniqueId,
  updates = {},
  userType = "driver",
} = {}) => {
  if (!accountUniqueId) {
    throw new Error(
      "accountUniqueId is required to update a financial institution account.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error(
      "Token is required to update a financial institution account.",
    );
  }

  const res = await axios.put(
    `${backendURL}/api/finance/financialInstitutionAccount/${accountUniqueId}`,
    updates,
    authConfig(token),
  );

  console.log("✅ Updated financial institution account", accountUniqueId);
  return res.data;
};

const deleteFinancialInstitutionAccount = async ({
  accountUniqueId,
  userType = "driver",
} = {}) => {
  if (!accountUniqueId) {
    throw new Error(
      "accountUniqueId is required to delete a financial institution account.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error(
      "Token is required to delete a financial institution account.",
    );
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/financialInstitutionAccount/${accountUniqueId}`,
    authConfig(token),
  );

  console.log("✅ Deleted financial institution account", accountUniqueId);
  return res.data;
};

const testFinancialInstitutionAccountsWorkFlow = async ({
  userType = "driver",
} = {}) => {
  console.log(
    "\n✅ ========== FINANCIAL INSTITUTION ACCOUNT FLOW STARTED ==========",
  );

  const createResult = await testCreateFinancialInstitutionAccount({
    userType,
  });
  console.log(
    "🚀 ~ testFinancialInstitutionAccountsWorkFlow ~ createResult:",
    createResult,
  );
  const accountUniqueId = createResult?.data?.accountUniqueId;
  if (!accountUniqueId) {
    throw new Error("Failed to create a financial institution account.");
  }

  await getFinancialInstitutionAccounts({
    userType,
    query: { accountUniqueId },
  });
  await updateFinancialInstitutionAccount({
    accountUniqueId,
    updates: { institutionName: "Updated Test Bank" },
    userType,
  });
  await deleteFinancialInstitutionAccount({ accountUniqueId, userType });

  console.log(
    "✅ ========== FINANCIAL INSTITUTION ACCOUNT FLOW COMPLETED ==========",
  );
  return { accountUniqueId };
};

module.exports = {
  testCreateFinancialInstitutionAccount,
  getFinancialInstitutionAccounts,
  updateFinancialInstitutionAccount,
  deleteFinancialInstitutionAccount,
  testFinancialInstitutionAccountsWorkFlow,
};
