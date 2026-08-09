const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

// ── Commission ──────────────────────────────────────────────────────────────────
const COMM_URL = "/api/finance/commission";
const commCache = { data: null };

const seedDriverBalance = async () => {
  try {
    const token = usersData.driver?.token;
    if (!token) return false;
    const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
    if (!driverId) return false;
    const result = await axios.post(backendURL + "/api/finance/userBalance", {
      amount: 50000, driverUniqueId: driverId, netBalance: 50000, transactionType: "deposit", transactionUniqueId: uuidv4(),
    }, authConfig(token));
    return result.data;
  } catch (error) {
    console.warn("⚠️  seedDriverBalance:", error.response?.data?.error || error.message);
    return false;
  }
};

const testGetCommissions = async ({ user, filters = {} } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const query = new URLSearchParams(filters).toString();
  const url = query ? `${COMM_URL}?${query}` : COMM_URL;
  const result = await axios.get(backendURL + url, authConfig(token));
  console.log("✅ Commissions fetched:", result.data.data?.length ?? 0);
  commCache.data = result.data.data;
  return result.data;
};

const testCreateCommission = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");

  // Collect candidate journey decisions that could still be eligible.
  // Prefer live completed (journeyStatusId = 6) decisions from the API; the
  // cached lastJourneyDecisionUniqueId is usually stale (later phases delete
  // the journey + its decision) and is only a fallback when the list is empty.
  const candidates = [];
  const cached = payload?.journeyDecisionUniqueId || usersData?.driver?.lastJourneyDecisionUniqueId || usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  try {
    const list = await axios.get(backendURL + "/api/user/getJourneyDecision4AllOrSingleUser?journeyStatusId=6&limit=10", authConfig(token));
    const data = list?.data?.data || list?.data?.formattedData || [];
    for (const d of data) {
      const id = d?.journeyDecisionUniqueId || d?.journeyDecisionId;
      if (id && !candidates.includes(id)) candidates.push(id);
    }
  } catch { /* ignore */ }
  if (cached && !candidates.includes(cached)) candidates.push(cached);

  if (candidates.length === 0) { console.warn("⏩ testCreateCommission skipped — no journeyDecisionUniqueId"); return { skipped: true }; }

  await seedDriverBalance();
  try { await axios.get(backendURL + "/api/utils/clear-cache"); } catch { /* ignore */ }

  for (const journeyDecisionUniqueId of candidates) {
    try {
      const defaultPayload = { journeyDecisionUniqueId, commissionAmount: 250.0, ...payload };
      const result = await axios.post(backendURL + COMM_URL, defaultPayload, authConfig(token));
      console.log("✅ Commission created:", result.data.data?.commissionUniqueId || result.data.commissionUniqueId);
      return result.data;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message;
      if (status === 404 || status === 409 || status === 400) {
        console.log(`⏩ commission candidate ${journeyDecisionUniqueId.slice(0, 8)}… rejected (${status} ${typeof msg === "string" ? msg.slice(0, 50) : "…"})`);
        continue;
      }
      throw err;
    }
  }
  console.warn("⏩ testCreateCommission skipped — no eligible completed journey decision found");
  return { skipped: true };
};

const testUpdateCommission = async ({ user, id, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const commissionId = id || commCache.data?.[0]?.commissionUniqueId || commCache.data?.[0]?.id;
  if (!commissionId) throw new Error("No commission ID found to update");
  const defaultPayload = { commissionAmount: 300.0, ...payload };
  const result = await axios.put(`${backendURL}${COMM_URL}/${commissionId}`, defaultPayload, authConfig(token));
  console.log("✅ Commission updated:", commissionId);
  return result.data;
};

const testDeleteCommission = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const commissionId = id || commCache.data?.[0]?.commissionUniqueId || commCache.data?.[0]?.id;
  if (!commissionId) throw new Error("No commission ID found to delete");
  const result = await axios.delete(`${backendURL}${COMM_URL}/${commissionId}`, authConfig(token));
  console.log("✅ Commission deleted:", commissionId);
  return result.data;
};

const testCommissionWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Commission Workflow ──");
  await testGetCommissions({ user });
  const created = await testCreateCommission({ user });
  if (created?.skipped) { console.log("⏩ Commission workflow skipped"); return { skipped: true }; }
  const commissionId = created?.data?.commissionUniqueId || created?.commissionUniqueId;
  if (!commissionId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetCommissions({ user });
  await testUpdateCommission({ user, id: commissionId });
  await testGetCommissions({ user });
  await testDeleteCommission({ user, id: commissionId });
  await testGetCommissions({ user });
  console.log("── Commission Workflow complete ──\n");
  return { commissionId };
};

// ── CommissionRates ─────────────────────────────────────────────────────────────
const CR_URL = "/api/finance/commissionRates";
const crCache = { data: null };

const testGetCommissionRates = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + CR_URL, authConfig(token));
  console.log("✅ CommissionRates fetched:", result.data.data?.length ?? 0);
  crCache.data = result.data.data;
  return result.data;
};

const testCreateCommissionRate = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { commissionRate: 5.5, commissionRateEffectiveDate: "2026-01-01", commissionRateExpirationDate: "2030-12-31", ...payload };
  const result = await axios.post(backendURL + CR_URL, defaultPayload, authConfig(token));
  console.log("✅ CommissionRate created:", result.data.commissionRateUniqueId || result.data.data?.commissionRateUniqueId);
  return result.data;
};

const testUpdateCommissionRate = async ({ user, commissionRateUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = commissionRateUniqueId || crCache.data?.[0]?.commissionRateUniqueId;
  if (!id) throw new Error("No commissionRateUniqueId found to update");
  const defaultPayload = { commissionRate: 6.0, ...payload };
  const result = await axios.put(`${backendURL}${CR_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ CommissionRate updated:", id);
  return result.data;
};

const testDeleteCommissionRate = async ({ user, commissionRateUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = commissionRateUniqueId || crCache.data?.[0]?.commissionRateUniqueId;
  if (!id) throw new Error("No commissionRateUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${CR_URL}/${id}`, authConfig(token));
  console.log("✅ CommissionRate deleted:", id);
  return result.data;
};

const testCommissionRatesWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CommissionRates Workflow ──");
  await testGetCommissionRates({ user });
  const created = await testCreateCommissionRate({ user });
  const id = created?.commissionRateUniqueId || created?.data?.commissionRateUniqueId;
  if (!id) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetCommissionRates({ user });
  await testUpdateCommissionRate({ user, commissionRateUniqueId: id });
  await testGetCommissionRates({ user });
  await testDeleteCommissionRate({ user, commissionRateUniqueId: id });
  await testGetCommissionRates({ user });
  await testCreateCommissionRate({ user });
  console.log("── CommissionRates Workflow complete ──\n");
  return { id };
};

// ── CommissionStatus ────────────────────────────────────────────────────────────
const CS_URL = "/api/finance/commissionStatus/admin/commission-statuses";
const csCache = { data: null };

const testGetCommissionStatuses = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + CS_URL, authConfig(token));
  console.log("✅ CommissionStatuses fetched:", result.data.data?.length ?? 0);
  csCache.data = result.data.data;
  return result.data;
};

const testCreateCommissionStatus = async ({ user, payload }) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.post(backendURL + CS_URL, payload, authConfig(token));
  console.log("✅ CommissionStatus created:", result.data.data?.commissionStatusUniqueId);
  return result.data.data;
};

const testUpdateCommissionStatus = async ({ user, uniqueId, payload }) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = uniqueId || csCache.data?.[0]?.commissionStatusUniqueId;
  if (!id) throw new Error("No ID found to update");
  const result = await axios.put(`${backendURL}${CS_URL}/${id}`, payload, authConfig(token));
  console.log("✅ CommissionStatus updated:", id);
  return result.data;
};

const testDeleteCommissionStatus = async ({ user, uniqueId }) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = uniqueId || csCache.data?.[0]?.commissionStatusUniqueId;
  if (!id) throw new Error("No ID found to delete");
  const result = await axios.delete(`${backendURL}${CS_URL}/${id}`, authConfig(token));
  console.log("✅ CommissionStatus deleted:", id);
  return result.data;
};

const testCommissionStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CommissionStatus Workflow ──");
  await testGetCommissionStatuses({ user });
  // statusName must be unique per run: CommissionStatus.statusName has a
  // physical unique index, so reusing "TEST_STATUS" across runs collides with
  // the soft-deleted rows from previous runs and makes the INSERT throw.
  const stamp = String(Date.now()).slice(-6);
  const created = await testCreateCommissionStatus({ user, payload: { statusName: "TEST_STATUS_" + stamp, description: "test description" } });
  const uniqueId = created?.commissionStatusUniqueId;
  if (!uniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetCommissionStatuses({ user });
  await testUpdateCommissionStatus({ user, uniqueId, payload: { statusName: "UPDATED_" + stamp, description: "updated description" } });
  await testGetCommissionStatuses({ user });
  await testDeleteCommissionStatus({ user, uniqueId });
  await testGetCommissionStatuses({ user });
  console.log("── CommissionStatus Workflow complete ──\n");
  return { uniqueId };
};

// ── DriverEarning ───────────────────────────────────────────────────────────────
const DE_URL = "/api/finance/driverEarning";
const deCache = { data: null };

const testGetDriverEarnings = async ({ user, filters = {} } = {}) => {
  const token = user?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");
  const driverUniqueId = filters?.driverUniqueId || usersData?.driver?.accountData?.userData?.userUniqueId || "self";
  const defaultFilters = { driverUniqueId, limit: 10, ...filters };
  const query = new URLSearchParams(defaultFilters).toString();
  const result = await axios.get(backendURL + `${DE_URL}?${query}`, authConfig(token));
  console.log("✅ DriverEarnings fetched:", result.data.data?.length ?? 0);
  if (result.data.data?.length) {
    const sample = result.data.data[0];
    console.log("   Sample — mode:", sample.journey?.requestMode, "| earning:", sample.journey?.effectiveEarning, "| company:", sample.company?.companyName ?? "individual");
  }
  deCache.data = result.data.data;
  return result.data;
};

const testDriverEarningWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── DriverEarning Workflow ──");
  const result = await testGetDriverEarnings({ user });
  if (usersData?.driver?.accountData?.userData?.userUniqueId) {
    await testGetDriverEarnings({ user, filters: { driverUniqueId: usersData.driver.accountData.userData.userUniqueId, fromDate: "2026-01-01", toDate: "2030-12-31" } });
  }
  console.log("── DriverEarning Workflow complete ──\n");
  return { data: result };
};

module.exports = {
  testCommissionWorkflow, testGetCommissions, testCreateCommission, testUpdateCommission, testDeleteCommission,
  testCommissionRatesWorkflow, testGetCommissionRates, testCreateCommissionRate, testUpdateCommissionRate, testDeleteCommissionRate,
  testCommissionStatusWorkflow, testGetCommissionStatuses, testCreateCommissionStatus, testUpdateCommissionStatus, testDeleteCommissionStatus,
  testDriverEarningWorkflow, testGetDriverEarnings,
};
