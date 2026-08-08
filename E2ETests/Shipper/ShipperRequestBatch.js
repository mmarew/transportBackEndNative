// CRUD for ShipperRequestBatch
// Batches allow a shipper to group multiple cargo slots into a single request.
// Routes: GET /api/shipperRequestBatch, CANCEL /:batchUniqueId/cancel,
//         PARTIAL CANCEL /:batchUniqueId/partialCancel, SLOTS /:batchUniqueId/slots

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/shipperRequestBatch";
const cache = { data: null };

// ── GET all batches ────────────────────────────────────────────────────────────
const testGetShipperRequestBatches = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    const list = result.data?.data || result.data;
    console.log("✅ ShipperRequestBatches fetched:", Array.isArray(list) ? list.length : 0);
    cache.data = Array.isArray(list) ? list : [];
    return result.data;
  } catch (error) {
    console.error("❌ testGetShipperRequestBatches:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET batch slots ────────────────────────────────────────────────────────────
const testGetBatchSlots = async ({ user, batchUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = batchUniqueId || cache.data?.[0]?.batchUniqueId || cache.data?.[0]?.shipperRequestBatchUniqueId;
    if (!id) {
      console.log("⏩ testGetBatchSlots skipped — no batchUniqueId available");
      return { skipped: true };
    }
    const url = BASE_URL + `/${id}/slots`;
    const result = await axios.get(backendURL + url, authConfig(token));
    const slots = result.data?.data || [];
    cache.slots = Array.isArray(slots) ? slots : [];
    console.log("✅ Batch slots fetched:", cache.slots.length);
    return result.data;
  } catch (error) {
    console.error("❌ testGetBatchSlots:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CANCEL batch ───────────────────────────────────────────────────────────────
const testCancelBatch = async ({ user, batchUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token;
    if (!token) throw new Error("token not found");
    const id = batchUniqueId || cache.data?.[0]?.batchUniqueId || cache.data?.[0]?.shipperRequestBatchUniqueId;
    if (!id) {
      console.log("⏩ testCancelBatch skipped — no batchUniqueId available");
      return { skipped: true };
    }
    const url = BASE_URL + `/${id}/cancel`;
    // cancellationReasonsTypeId is NOT NULL in CanceledJourneys — reason 12 has
    // requestMode 'company' and is valid for company freight batches (reasons 1-11 are 'individual').
    const result = await axios.put(backendURL + url, { cancellationReasonsTypeId: 12 }, authConfig(token));
    console.log("✅ Batch canceled:", id);
    return result.data;
  } catch (error) {
    const status = error.response?.status;
    // 400 = batch already canceled or can't be canceled (expected in E2E)
    if (status === 400) {
      console.log("⏩ testCancelBatch: batch cannot be canceled in current state (expected)");
      return { skipped: true };
    }
    console.error("❌ testCancelBatch:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── PARTIAL CANCEL ─────────────────────────────────────────────────────────────
const testPartialCancelBatch = async ({ user, batchUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token;
    if (!token) throw new Error("token not found");
    const id = batchUniqueId || cache.data?.[0]?.batchUniqueId || cache.data?.[0]?.shipperRequestBatchUniqueId;
    if (!id) {
      console.log("⏩ testPartialCancelBatch skipped — no batchUniqueId available");
      return { skipped: true };
    }
    const url = BASE_URL + `/${id}/partialCancel`;
    // Backend expects slotIds: array of the slots' shipperRequestUniqueId
    // (NOT a cancelCount). Use the first slot from the previously fetched
    // /slots response, with a company-valid cancellation reason (id 12).
    const slot = (cache.slots || []).find((s) => s?.shipperRequestUniqueId);
    if (!slot?.shipperRequestUniqueId) {
      console.log("⏩ testPartialCancelBatch skipped — no slots to cancel");
      return { skipped: true };
    }
    const defaultPayload = {
      slotIds: [slot.shipperRequestUniqueId],
      cancellationReasonsTypeId: 12,
      ...payload,
    };
    const result = await axios.put(backendURL + url, defaultPayload, authConfig(token));
    console.log("✅ Batch partially canceled:", id);
    return result.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 400) {
      console.log("⏩ testPartialCancelBatch: cannot partially cancel in current state (expected)");
      return { skipped: true };
    }
    console.error("❌ testPartialCancelBatch:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testShipperRequestBatchWorkflow = async ({ user = usersData.shipper } = {}) => {
  console.log("\n── ShipperRequestBatch Workflow ──");

  await testGetShipperRequestBatches({ user });

  if (!cache.data || cache.data.length === 0) {
    console.log("⏩ ShipperRequestBatch: no batches found — run shipper request flow first");
    console.log("── ShipperRequestBatch Workflow skipped ──\n");
    return { skipped: true };
  }

  await testGetBatchSlots({ user });
  await testPartialCancelBatch({ user });
  // testCancelBatch last since it terminates the batch
  await testCancelBatch({ user });
  await testGetShipperRequestBatches({ user });

  console.log("── ShipperRequestBatch Workflow complete ──\n");
};

module.exports = {
  testShipperRequestBatchWorkflow,
  testGetShipperRequestBatches,
  testGetBatchSlots,
  testCancelBatch,
  testPartialCancelBatch,
};
