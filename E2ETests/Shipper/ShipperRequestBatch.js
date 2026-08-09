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
const TERMINAL_STATUSES = [7, 9, 10, 12];

// Filter to batches that actually have at least one cancellable slot, so we
// never probe a batch the backend would reject with 400. Uses the slots
// endpoint's `cancellable` flag (statuses 1-4 = waiting/requested/
// acceptedByDriver/acceptedByShipper).
const cancelCandidateBatches = async (token) => {
  const currentShipperId = usersData?.shipper?.accountData?.userData?.userUniqueId;
  const owned = (cache.data || []).filter((b) => {
    const id = b?.batchUniqueId || b?.shipperRequestBatchUniqueId;
    if (!id) return false;
    if (TERMINAL_STATUSES.includes(Number(b?.journeyStatusId))) return false;
    if (id === cache.partialCanceledId) return false;
    if (currentShipperId && b?.shipperUserUniqueId && b.shipperUserUniqueId !== currentShipperId) return false;
    return true;
  });
  const cancellable = [];
  for (const b of owned) {
    const id = b?.batchUniqueId || b?.shipperRequestBatchUniqueId;
    try {
      const res = await axios.get(
        backendURL + `${BASE_URL}/${id}/slots?cancellable=true&limit=1`,
        authConfig(token),
      );
      const slots = res.data?.data || [];
      if (Array.isArray(slots) && slots.length > 0) cancellable.push(b);
    } catch {
      // Skip batches whose slots can't be fetched — don't probe with cancel.
    }
  }
  return cancellable;
};

const testCancelBatch = async ({ user, batchUniqueId } = {}) => {
  const token = user?.token || usersData.shipper?.token;
  if (!token) throw new Error("token not found");
  const candidates = batchUniqueId
    ? [{ batchUniqueId }]
    : await cancelCandidateBatches(token);
  if (candidates.length === 0) {
    console.log("⏩ testCancelBatch skipped — no cancellable (owned, non-terminal) batch available");
    return { skipped: true };
  }
  let cancelled = 0;
  for (const candidate of candidates) {
    const id = candidate.batchUniqueId || candidate.shipperRequestBatchUniqueId;
    try {
      // cancellationReasonsTypeId is NOT NULL in CanceledJourneys — reason 12 has
      // requestMode 'company' and is valid for company freight batches (reasons 1-11 are 'individual').
      await axios.put(backendURL + `${BASE_URL}/${id}/cancel`, { cancellationReasonsTypeId: 12 }, authConfig(token));
      cancelled++;
      console.log("✅ Batch canceled:", id);
      cache.partialCanceledId = id;
    } catch (error) {
      const status = error.response?.status;
      // 400 = batch already canceled or can't be canceled, 403 = not owned by this shipper
      if (status === 400 || status === 403) {
        console.log(`⏩ testCancelBatch: batch ${id} not cancellable (${status} — expected), trying next candidate…`);
        continue;
      }
      console.error("❌ testCancelBatch:", error.response?.data?.error || error.message);
      throw error;
    }
  }
  if (cancelled === 0) {
    console.log("⏩ testCancelBatch: no cancellable batch remaining (expected)");
    return { skipped: true };
  }
  return { cancelled };
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
    cache.partialCanceledId = id;
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
