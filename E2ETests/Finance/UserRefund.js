// CRUD for UserRefund
// Manages refund requests — drivers/shippers request refunds, admin approves/rejects

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/userRefund";
const cache = { data: null };

const testGetUserRefunds = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ UserRefunds fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetUserRefunds:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateUserRefund = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const userUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId;
    if (!userUniqueId) throw new Error("Driver userUniqueId not found");
    const defaultPayload = {
      refundAmount: 50.0,
      refundReason: "E2E test refund request",
      ...payload,
    };
    const result = await axios.post(
      `${backendURL}${BASE_URL}/${userUniqueId}`,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ UserRefund created:",
      result.data.data?.userRefundUniqueId || result.data.userRefundUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateUserRefund:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateUserRefund = async ({
  user,
  userRefundUniqueId,
  payload,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = userRefundUniqueId || cache.data?.[0]?.userRefundUniqueId;
    if (!id) throw new Error("No userRefundUniqueId found to update");
    const defaultPayload = { refundStatus: "approved", ...payload };
    const result = await axios.patch(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ UserRefund updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateUserRefund:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteUserRefund = async ({ user, userRefundUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = userRefundUniqueId || cache.data?.[0]?.userRefundUniqueId;
    if (!id) throw new Error("No userRefundUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ UserRefund deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteUserRefund:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUserRefundWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── UserRefund Workflow ──");
  await testGetUserRefunds({ user });
  const created = await testCreateUserRefund({ user: usersData.driver });
  const userRefundUniqueId =
    created?.data?.userRefundUniqueId || created?.userRefundUniqueId;
  if (!userRefundUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetUserRefunds({ user });
  await testUpdateUserRefund({ user, userRefundUniqueId });
  await testGetUserRefunds({ user });
  await testDeleteUserRefund({ user, userRefundUniqueId });
  await testGetUserRefunds({ user });
  console.log("── UserRefund Workflow complete ──\n");
  return { userRefundUniqueId };
};

module.exports = {
  testUserRefundWorkflow,
  testGetUserRefunds,
  testCreateUserRefund,
  testUpdateUserRefund,
  testDeleteUserRefund,
};
