//this is get plan pricing
const fetchSubscriptionPlanPricing = async (token) => {
  const res = await axios.get(
    `${backendURL}/api/finance/subscriptionPlanPricing`,
    { ...authConfig(token), params: { limit: 1 } },
  );
  const pricing = res.data?.data;
  console.log("🚀 ~ fetchSubscriptionPlanPricing ~ pricing:", pricing);
  return pricing?.[0]?.subscriptionPlanPricingUniqueId ? pricing : null;
};
//this is create plan pricing
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
const updateSubscriptionPlanPricing = async ({
  subscriptionPlanPricingUniqueId,
  updateData,
  token,
} = {}) => {
  if (!subscriptionPlanPricingUniqueId) {
    throw new Error(
      "subscriptionPlanPricingUniqueId is required to update subscription plan pricing.",
    );
  }
  if (!token) {
    throw new Error("Token is required to update subscription plan pricing.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/subscriptionPlanPricing/${subscriptionPlanPricingUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log(
    "✅ Updated subscription plan pricing",
    subscriptionPlanPricingUniqueId,
    updateData,
  );
  return res.data;
};

//delete subscription plan pricing
const deleteSubscriptionPlanPricing = async ({
  subscriptionPlanPricingUniqueId,
  token,
} = {}) => {
  if (!subscriptionPlanPricingUniqueId) {
    throw new Error(
      "subscriptionPlanPricingUniqueId is required to delete subscription plan pricing.",
    );
  }
  if (!token) {
    throw new Error("Token is required to delete subscription plan pricing.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/subscriptionPlanPricing/${subscriptionPlanPricingUniqueId}`,
    authConfig(token),
  );
  console.log(
    "✅ Deleted subscription plan pricing",
    subscriptionPlanPricingUniqueId,
  );
  return res.data;
};

const testSubscriptionPlanPricingFlow = async ({
  userType = "driver",
} = {}) => {
  console.log(
    "\n✅ ========== SUBSCRIPTION PLAN PRICING FLOW STARTED ==========",
  );

  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error(
      "Driver token is required to test subscription plan pricing flow.",
    );
  }

  let pricing = await fetchSubscriptionPlanPricing(token);
  console.log(
    "🚀 ~ testSubscriptionPlanPricingFlow ~ initial pricing:",
    pricing,
  );

  if (!pricing) {
    const planPayload = await createSubscriptionPlan({ token });
    const subscriptionPlanUniqueId =
      planPayload?.data?.subscriptionPlanUniqueId;
    if (!subscriptionPlanUniqueId) {
      throw new Error("Failed to create subscription plan for pricing flow.");
    }

    const pricingPayload = await createSubscriptionPlanPricing({
      subscriptionPlanUniqueId,
      token,
    });
    pricing = pricingPayload?.data;
    console.log(
      "🚀 ~ testSubscriptionPlanPricingFlow ~ created pricing:",
      pricing,
    );
  }

  if (!pricing) {
    throw new Error("Failed to set up subscription plan pricing for testing.");
  }
};
module.exports = {
  fetchSubscriptionPlanPricing,
  createSubscriptionPlanPricing,
  updateSubscriptionPlanPricing,
  deleteSubscriptionPlanPricing,
  resolveSubscriptionPlanPricingUniqueId,
  testSubscriptionPlanPricingFlow,
};
