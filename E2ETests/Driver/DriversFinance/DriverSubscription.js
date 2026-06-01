const axios = require("axios");
const { usersData, backendURL } = require("../../constants");
const { getDriversAccountData } = require("../RequirementOfDriver");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const fetchSubscriptionPlanPricing = async (token) => {
  const res = await axios.get(
    `${backendURL}/api/finance/subscriptionPlanPricing`,
    { ...authConfig(token), params: { limit: 1 } },
  );
  const pricing = res.data?.data;
  console.log("🚀 ~ fetchSubscriptionPlanPricing ~ pricing:", pricing);
  return pricing?.[0]?.subscriptionPlanPricingUniqueId ? pricing : null;
};

const createSubscriptionPlan = async ({
  planName = `Test Plan ${Date.now()}`,
  description = "E2E test subscription plan",
  durationInDays = 30,
  isFree = false,
  token,
} = {}) => {
  if (!token) {
    throw new Error("Token is required to create subscription plans.");
  }

  const res = await axios.post(
    `${backendURL}/api/finance/subscriptionPlan`,
    { planName, description, durationInDays, isFree },
    authConfig(token),
  );

  return res.data;
};

const createSubscriptionPlanPricing = async ({
  subscriptionPlanUniqueId,
  price = 500,
  currency = "ETB",
  durationInDays = 30,
  token,
} = {}) => {
  if (!token) {
    throw new Error("Token is required to create subscription plan pricing.");
  }
  if (!subscriptionPlanUniqueId) {
    throw new Error("subscriptionPlanUniqueId is required.");
  }

  const res = await axios.post(
    `${backendURL}/api/finance/subscriptionPlanPricing`,
    { subscriptionPlanUniqueId, price, currency, durationInDays },
    authConfig(token),
  );

  return res.data;
};

const resolveSubscriptionPlanPricingUniqueId = async ({
  userType = "driver",
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to locate subscription pricing.");
  }

  let pricing = await fetchSubscriptionPlanPricing(token);
  console.log(
    "🚀 ~ resolveSubscriptionPlanPricingUniqueId ~ pricing:",
    pricing,
  );
  if (pricing) {
    return pricing.subscriptionPlanPricingUniqueId;
  }

  const planPayload = await createSubscriptionPlan({ token });
  const subscriptionPlanUniqueId = planPayload?.data?.subscriptionPlanUniqueId;
  if (!subscriptionPlanUniqueId) {
    throw new Error("Failed to create subscription plan.");
  }

  const pricingPayload = await createSubscriptionPlanPricing({
    subscriptionPlanUniqueId,
    token,
  });

  return pricingPayload?.data?.subscriptionPlanPricingUniqueId;
};

const resolveDriverUniqueId = async ({ userType = "driver" } = {}) => {
  const userData = usersData[userType];
  if (!userData) {
    throw new Error(`Missing usersData for ${userType}`);
  }

  if (userData.accountData?.userData?.userUniqueId) {
    return userData.accountData.userData.userUniqueId;
  }

  if (!userData.token) {
    throw new Error(`Missing token for ${userType}`);
  }

  const accountData = await getDriversAccountData({ token: userData.token });
  if (!accountData?.userData?.userUniqueId) {
    throw new Error("Unable to resolve driverUniqueId from account data");
  }

  return accountData.userData.userUniqueId;
};

const createDriverSubscription = async ({
  driverUniqueId,
  subscriptionPlanPricingUniqueId,
  userType = "driver",
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to create a subscription.");
  }
  if (!driverUniqueId) {
    throw new Error("driverUniqueId is required to create a subscription.");
  }
  if (!subscriptionPlanPricingUniqueId) {
    throw new Error(
      "subscriptionPlanPricingUniqueId is required to create a subscription.",
    );
  }

  const res = await axios.post(
    `${backendURL}/api/finance/userSubscription/${driverUniqueId}`,
    { subscriptionPlanPricingUniqueId },
    authConfig(token),
  );
  console.log(
    "✅ Created driver subscription",
    res.data?.data?.userSubscriptionUniqueId,
  );
  return res.data;
};

const getDriverSubscriptions = async ({
  userType = "driver",
  query = { driverUniqueId: "self" },
} = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to fetch subscriptions.");
  }

  const res = await axios.get(`${backendURL}/api/finance/userSubscription`, {
    ...authConfig(token),
    params: query,
  });
  console.log("✅ Fetched driver subscriptions", res.data?.data?.length || 0);
  return res.data;
};

const updateDriverSubscription = async ({
  userSubscriptionUniqueId,
  updateData,
  userType = "driver",
} = {}) => {
  if (!userSubscriptionUniqueId) {
    throw new Error(
      "userSubscriptionUniqueId is required to update a subscription.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to update a subscription.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/userSubscription/${userSubscriptionUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log("✅ Updated driver subscription", userSubscriptionUniqueId);
  return res.data;
};

const deleteDriverSubscription = async ({
  userSubscriptionUniqueId,
  userType = "driver",
} = {}) => {
  if (!userSubscriptionUniqueId) {
    throw new Error(
      "userSubscriptionUniqueId is required to delete a subscription.",
    );
  }

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Driver token is required to delete a subscription.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/userSubscription/${userSubscriptionUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted driver subscription", userSubscriptionUniqueId);
  return res.data;
};

const testDriverSubscriptionFlow = async ({ userType = "driver" } = {}) => {
  console.log("\n✅ ========== DRIVER SUBSCRIPTION FLOW STARTED ==========");

  const driverUniqueId = await resolveDriverUniqueId({ userType });
  const subscriptionPlanPricingUniqueId =
    await resolveSubscriptionPlanPricingUniqueId({ userType });
  const subscriptionPayload = await createDriverSubscription({
    driverUniqueId,
    subscriptionPlanPricingUniqueId,
    userType,
  });
  const userSubscriptionUniqueId =
    subscriptionPayload?.data?.userSubscriptionUniqueId;
  if (!userSubscriptionUniqueId) {
    throw new Error(
      "Subscription creation did not return a userSubscriptionUniqueId.",
    );
  }

  await getDriverSubscriptions({ userType, query: { driverUniqueId: "self" } });
  await updateDriverSubscription({
    userSubscriptionUniqueId,
    updateData: { status: "ACTIVE" },
    userType,
  });
  await deleteDriverSubscription({ userSubscriptionUniqueId, userType });

  console.log("✅ ========== DRIVER SUBSCRIPTION FLOW COMPLETED ==========");
  return { userSubscriptionUniqueId };
};

module.exports = {
  resolveSubscriptionPlanPricingUniqueId,
  createDriverSubscription,
  getDriverSubscriptions,
  updateDriverSubscription,
  deleteDriverSubscription,
  testDriverSubscriptionFlow,
};
