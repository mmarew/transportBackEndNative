// CRUD for SMS Sender configuration
// The SMS sender stores gateway credentials used by the backend to send OTPs.
// Routes are mounted bare (no /api/ prefix) at /smsSender in routes/index.js
// Requires admin token.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  SMS_SENDER_ENDPOINTS,
} = require("../../Routes/EndPoints/smsSender.endpoints");

const BASE = backendURL; // routes are bare: /smsSender
const cache = { data: null };

// ── GET all ────────────────────────────────────────────────────────────────────
const testGetSMSSenders = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(
      BASE + SMS_SENDER_ENDPOINTS.GET_ALL_SMS_SENDERS,
      authConfig(token),
    );
    const list = result.data?.data || result.data;
    console.log("✅ SMSSenders fetched:", Array.isArray(list) ? list.length : 1);
    cache.data = Array.isArray(list) ? list : [list];
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetSMSSenders:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateSMSSender = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const defaultPayload = {
      senderName: "E2ETestSender_" + Date.now(),
      phoneNumber: "+251" + Math.floor(Math.random() * 1000000000),
      password: process.env.E2E_TEST_PASSWORD || "E2E_TEST_PASSWORD_NOT_SET",
      ...payload,
    };

    const result = await axios.post(
      BASE + SMS_SENDER_ENDPOINTS.CREATE_SMS_SENDER,
      defaultPayload,
      authConfig(token),
    );
    const id =
      result.data?.data?.SMSSenderId ||
      result.data?.SMSSenderId ||
      result.data?.data?.id ||
      result.data?.id;
    console.log("✅ SMSSender created:", id ?? "(no id returned)");
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateSMSSender:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET by ID ──────────────────────────────────────────────────────────────────
const testGetSMSSenderById = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const senderId = id || cache.data?.[0]?.SMSSenderId || cache.data?.[0]?.id;
    if (!senderId) throw new Error("No SMS sender ID available");

    const url = SMS_SENDER_ENDPOINTS.GET_SMS_SENDER_BY_ID.replace(":id", senderId);
    const result = await axios.get(BASE + url, authConfig(token));
    console.log("✅ SMSSender fetched by ID:", senderId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetSMSSenderById:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateSMSSender = async ({ user, id, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const senderId = id || cache.data?.[0]?.SMSSenderId || cache.data?.[0]?.id;
    if (!senderId) throw new Error("No SMS sender ID available");

    const url = SMS_SENDER_ENDPOINTS.UPDATE_SMS_SENDER.replace(":id", senderId);
    const defaultPayload = {
      senderName: "E2EUpdatedSender_" + Date.now(),
      phoneNumber: "+251" + Math.floor(Math.random() * 1000000000),
      password: process.env.E2E_TEST_PASSWORD || "E2E_TEST_PASSWORD_NOT_SET",
      ...payload,
    };

    const result = await axios.put(BASE + url, defaultPayload, authConfig(token));
    console.log("✅ SMSSender updated:", senderId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateSMSSender:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteSMSSender = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const senderId = id || cache.data?.[0]?.SMSSenderId || cache.data?.[0]?.id;
    if (!senderId) throw new Error("No SMS sender ID available");

    const url = SMS_SENDER_ENDPOINTS.DELETE_SMS_SENDER.replace(":id", senderId);
    const result = await axios.delete(BASE + url, authConfig(token));
    console.log("✅ SMSSender deleted:", senderId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteSMSSender:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testSMSSenderWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── SMSSender Workflow ──");

  await testGetSMSSenders({ user });

  const created = await testCreateSMSSender({ user });

  // Extract ID from creation response
  const senderId =
    created?.data?.SMSSenderId ||
    created?.SMSSenderId ||
    created?.data?.id ||
    created?.id;

  if (!senderId) {
    // Try fetching by list comparison
    await testGetSMSSenders({ user });
    const newId = cache.data?.[cache.data.length - 1]?.SMSSenderId ||
      cache.data?.[cache.data.length - 1]?.id;
    if (!newId) {
      console.warn("⚠️  No ID returned — cannot continue workflow");
      return { skipped: true };
    }
    await testGetSMSSenderById({ user, id: newId });
    await testUpdateSMSSender({ user, id: newId });
    await testGetSMSSenders({ user });
    await testDeleteSMSSender({ user, id: newId });
    await testGetSMSSenders({ user });
  } else {
    await testGetSMSSenders({ user });
    await testGetSMSSenderById({ user, id: senderId });
    await testUpdateSMSSender({ user, id: senderId });
    await testGetSMSSenders({ user });
    await testDeleteSMSSender({ user, id: senderId });
    await testGetSMSSenders({ user });
  }

  console.log("── SMSSender Workflow complete ──\n");
};

module.exports = {
  testSMSSenderWorkflow,
  testGetSMSSenders,
  testCreateSMSSender,
  testGetSMSSenderById,
  testUpdateSMSSender,
  testDeleteSMSSender,
};
