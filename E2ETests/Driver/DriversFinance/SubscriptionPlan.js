// this file is about the CRUD operation of subscription plan only.

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
//get subscription plans.
const getSubscriptionPlans = async ({ token, query = {} } = {}) => {
  if (!token) {
    throw new Error("Token is required to fetch subscription plans.");
  }

  const res = await axios.get(`${backendURL}/api/finance/subscriptionPlan`, {
    ...authConfig(token),
    params: query,
  });
};

const updateSubscriptionPlan = async ({
  subscriptionPlanUniqueId,
  updateData,
  token,
} = {}) => {
  if (!subscriptionPlanUniqueId) {
    throw new Error("subscriptionPlanUniqueId is required to update a plan.");
  }
  if (!token) {
    throw new Error("Token is required to update subscription plans.");
  }

  const res = await axios.put(
    `${backendURL}/api/finance/subscriptionPlan/${subscriptionPlanUniqueId}`,
    updateData,
    authConfig(token),
  );
  console.log(
    "✅ Updated subscription plan",
    subscriptionPlanUniqueId,
    updateData,
  );
  return res.data;
};
const deleteSubscriptionPlan = async ({
  subscriptionPlanUniqueId,
  token,
} = {}) => {
  if (!subscriptionPlanUniqueId) {
    throw new Error("subscriptionPlanUniqueId is required to delete a plan.");
  }
  if (!token) {
    throw new Error("Token is required to delete subscription plans.");
  }

  const res = await axios.delete(
    `${backendURL}/api/finance/subscriptionPlan/${subscriptionPlanUniqueId}`,
    authConfig(token),
  );
  console.log("✅ Deleted subscription plan", subscriptionPlanUniqueId);
  return res.data;
};
const testSubscriptionPlanWorkflow = async ({ userType = "admin" } = {}) => {
  const token = usersData[userType]?.token;
  if (!token) {
    throw new Error("Token is required to test subscription plan workflow.");
  }
  // Create a new subscription plan
  const createRes = await createSubscriptionPlan({ token });
  //get the plans
  const getRes = await getSubscriptionPlans({ token });
  const subscriptionPlanUniqueId = getRes?.data?.subscriptionPlanUniqueId;
  if (!subscriptionPlanUniqueId) {
    throw new Error("Failed to retrieve subscription plan unique ID.");
  }
  // Update the subscription plan
  const updateRes = await updateSubscriptionPlan({
    subscriptionPlanUniqueId,
    updateData: { description: "Updated E2E test subscription plan" },
    token,
  });
  // Delete the subscription plan
  const deleteRes = await deleteSubscriptionPlan({
    subscriptionPlanUniqueId,
    token,
  });
};

module.exports = {
  createSubscriptionPlan,
  getSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  testSubscriptionPlanWorkflow,
};
