// CRUD for Commission
// Records platform commission per journey decision — links journey, rate, and status

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/commission";
const cache = { data: null };

const testGetCommissions = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Commissions fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCommissions:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const resolveCommissionRateId = async (token) => {
  try {
    const res = await axios.get(
      backendURL + "/api/finance/commissionRates",
      authConfig(token),
    );
    return (
      res.data.data?.[0]?.commissionRateUniqueId ||
      res.data?.[0]?.commissionRateUniqueId
    );
  } catch {
    return null;
  }
};

const resolveCommissionStatusId = async (token) => {
  try {
    const res = await axios.get(
      backendURL + "/api/finance/commissionStatus/admin/commission-statuses",
      authConfig(token),
    );
    return (
      res.data.data?.[0]?.commissionStatusUniqueId ||
      res.data?.[0]?.commissionStatusUniqueId
    );
  } catch {
    return null;
  }
};

const testCreateCommission = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const journeyDecisionUniqueId =
      payload?.journeyDecisionUniqueId ||
      usersData?.driver?.lastJourneyDecisionUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (!journeyDecisionUniqueId) {
      console.warn(
        "⏩ testCreateCommission skipped — no journeyDecisionUniqueId (run full journey flow first)",
      );
      return { skipped: true };
    }
    const commissionRateUniqueId =
      payload?.commissionRateUniqueId || (await resolveCommissionRateId(token));
    if (!commissionRateUniqueId) {
      console.warn(
        "⏩ testCreateCommission skipped — no commissionRateUniqueId (run commissionRates CRUD first)",
      );
      return { skipped: true };
    }
    const commissionStatusUniqueId =
      payload?.commissionStatusUniqueId ||
      (await resolveCommissionStatusId(token));
    const defaultPayload = {
      journeyDecisionUniqueId,
      commissionRateUniqueId,
      commissionAmount: 250.0,
      ...(commissionStatusUniqueId ? { commissionStatusUniqueId } : {}),
      ...payload,
    };
    const result = await axios.post(
      backendURL + BASE_URL,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ Commission created:",
      result.data.data?.commissionUniqueId || result.data.commissionUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateCommission:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateCommission = async ({ user, id, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const commissionId =
      id || cache.data?.[0]?.commissionUniqueId || cache.data?.[0]?.id;
    if (!commissionId) throw new Error("No commission ID found to update");
    const defaultPayload = { commissionAmount: 300.0, ...payload };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${commissionId}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ Commission updated:", commissionId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateCommission:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteCommission = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const commissionId =
      id || cache.data?.[0]?.commissionUniqueId || cache.data?.[0]?.id;
    if (!commissionId) throw new Error("No commission ID found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${commissionId}`,
      authConfig(token),
    );
    console.log("✅ Commission deleted:", commissionId);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteCommission:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCommissionWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Commission Workflow ──");
  await testGetCommissions({ user });
  const created = await testCreateCommission({ user });
  if (created?.skipped) {
    console.log("⏩ Commission workflow skipped — missing prerequisites");
    return { skipped: true };
  }
  const commissionId =
    created?.data?.commissionUniqueId || created?.commissionUniqueId;
  if (!commissionId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetCommissions({ user });
  await testUpdateCommission({ user, id: commissionId });
  await testGetCommissions({ user });
  await testDeleteCommission({ user, id: commissionId });
  await testGetCommissions({ user });
  console.log("── Commission Workflow complete ──\n");
  return { commissionId };
};

module.exports = {
  testCommissionWorkflow,
  testGetCommissions,
  testCreateCommission,
  testUpdateCommission,
  testDeleteCommission,
};
