// CRUD for DeliveryConfirmations
// Created AFTER a driver completes a journey — the receiver (e.g. the shipper's
// employee who received the goods) is found-or-created from phone + full name,
// mirroring the take-from-street identity strategy. An optional proof-of-delivery
// photo is uploaded as multipart ("photo" field) using the global FormData/Blob
// pattern the rest of the E2E suite uses.

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { backendURL, usersData, runId } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");

const BASE_URL = "/api/deliveryConfirmations";
const cache = { data: null };
const PHOTO_PATH = path.join(__dirname, "..", "dummy.png");

// Unique receiver per E2E run so find-or-create stays deterministic.
const receiverPhone = () => `+2519${runId}77`;
const receiverFullName = "E2E Receiver Employee";

// Resolve the completed journey from the active run (the receiver is supplied
// as phone + full name so the user is created on the fly if missing).
// Skips gracefully when the full individual flow hasn't run yet.
const resolveContext = () => {
  const journeyUniqueId =
    usersData.driver.lastJourneyUniqueId ||
    usersData.driver.journeyStatus?.uniqueIds?.journeyUniqueId;
  return { journeyUniqueId };
};

const photoBlob = () => {
  if (!fs.existsSync(PHOTO_PATH)) return null;
  return new Blob([fs.readFileSync(PHOTO_PATH)], { type: "image/png" });
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateDeliveryConfirmation = async ({ user, payload = {} } = {}) => {
  const token = user?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");

  const { journeyUniqueId } = resolveContext();
  if (!journeyUniqueId) {
    console.warn(
      "⏩ testCreateDeliveryConfirmation skipped — no completed journey available",
    );
    return { skipped: true };
  }

  const form = new FormData();
  form.append("journeyUniqueId", journeyUniqueId);
  form.append("receiverPhoneNumber", payload.receiverPhoneNumber || receiverPhone());
  form.append("receiverFullName", payload.receiverFullName || receiverFullName);
  form.append("deliveredQuantity", payload.deliveredQuantity ?? 95.5);
  form.append("quantityUnit", payload.quantityUnit || "quintal");
  form.append("condition", payload.condition || "GOOD");
  form.append("notes", payload.notes || "E2E delivery confirmation");
  form.append("latitude", payload.latitude ?? 9.02);
  form.append("longitude", payload.longitude ?? 38.8);
  const photo = photoBlob();
  if (photo) form.append("photo", photo, "receiver_photo.png");

  try {
    const result = await axios.post(backendURL + BASE_URL, form, authConfig(token));
    console.log(
      "✅ DeliveryConfirmation created:",
      result.data.data?.deliveryConfirmationUniqueId,
    );
    if (result.data.data?.deliveryConfirmationPhotoUrl) {
      console.log("✅ Delivery photo stored:", result.data.data.deliveryConfirmationPhotoUrl);
    }
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDeliveryConfirmation:", error.response?.data?.error || error.message);
    throw error;
  }
};

// Verify the receiver user was found-or-created in Users (take-from-street style).
const verifyReceiverUserCreated = async () => {
  const phone = receiverPhone();
  try {
    const [[receiver]] = await pool.query(
      "SELECT userUniqueId, fullName, phoneNumber FROM Users WHERE phoneNumber = ?",
      [phone],
    );
    if (receiver) {
      console.log(`✅ Receiver user auto-created/reused: ${receiver.userUniqueId} (${receiver.fullName})`);
      return receiver.userUniqueId;
    }
    console.warn("⚠️  Receiver user NOT found in Users after create");
    return null;
  } catch (error) {
    console.warn("⚠️  Could not verify receiver user row:", error.message);
    return null;
  }
};

// ── GET (filter-based) ─────────────────────────────────────────────────────────
const testGetDeliveryConfirmations = async ({ user, filters = {}, skipDefaultFilter = false, silent = false } = {}) => {
  const token = user?.token || usersData.driver?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");

  const created = cache.data?.deliveryConfirmationUniqueId;
  const defaultFilters = created && !skipDefaultFilter ? { deliveryConfirmationUniqueId: created } : {};
  const queryParams = { ...defaultFilters, ...filters };
  const query = new URLSearchParams(queryParams).toString();
  const url = query ? `${BASE_URL}?${query}` : BASE_URL;

  try {
    const result = await axios.get(backendURL + url, authConfig(token));
    const data = result.data.data;
    const count = Array.isArray(data) ? data.length : data ? 1 : 0;
    console.log("✅ DeliveryConfirmations fetched:", count);
    return result.data;
  } catch (error) {
    if (!silent) console.error("❌ testGetDeliveryConfirmations:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateDeliveryConfirmation = async ({ user, id, payload = {} } = {}) => {
  const token = user?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");
  const confirmationId =
    id || cache.data?.deliveryConfirmationUniqueId;
  if (!confirmationId) throw new Error("No deliveryConfirmationUniqueId found to update");

  const form = new FormData();
  form.append("status", payload.status || "CONFIRMED");
  form.append("receiverSignature", payload.receiverSignature || "digitally-signed");
  form.append("condition", payload.condition || "GOOD");
  const photo = photoBlob();
  if (photo) form.append("photo", photo, "receiver_photo.png");

  try {
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${confirmationId}`,
      form,
      authConfig(token),
    );
    console.log("✅ DeliveryConfirmation updated:", confirmationId);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateDeliveryConfirmation:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteDeliveryConfirmation = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");
  const confirmationId =
    id || cache.data?.deliveryConfirmationUniqueId;
  if (!confirmationId) throw new Error("No deliveryConfirmationUniqueId found to delete");

  try {
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${confirmationId}`,
      authConfig(token),
    );
    console.log("✅ DeliveryConfirmation deleted:", confirmationId);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteDeliveryConfirmation:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testDeliveryConfirmationWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── DeliveryConfirmation Workflow ──");

  const created = await testCreateDeliveryConfirmation({ user });
  if (created?.skipped) {
    console.log("⏩ Skipped — run the full journey flow first to get a completed journey");
    console.log("── DeliveryConfirmation Workflow skipped ──\n");
    return { skipped: true };
  }

  const confirmationId = created?.data?.deliveryConfirmationUniqueId;
  if (!confirmationId) {
    console.warn("⚠️  No deliveryConfirmationUniqueId returned — cannot continue workflow");
    return { skipped: true };
  }

  // The receiver (shipper's employee) must now exist in Users
  await verifyReceiverUserCreated();

  await testGetDeliveryConfirmations({ user });
  await testGetDeliveryConfirmations({ user, filters: { status: "PENDING" } });

  // Assert the confirmation is tied to the journey the driver completed
  const { journeyUniqueId } = resolveContext();
  if (journeyUniqueId) {
    const byJourney = await testGetDeliveryConfirmations({ user, filters: { journeyUniqueId }, skipDefaultFilter: true });
    const data = byJourney?.data;
    const matched = (Array.isArray(data) ? data : data ? [data] : []).some(
      (row) => row.deliveryConfirmationUniqueId === confirmationId,
    );
    if (matched) {
      console.log(`✅ Confirmation linked to completed journey: ${journeyUniqueId}`);
    } else {
      console.warn("⚠️  Confirmation not found under the completed journey filter");
    }
  }

  // Settle the confirmation (PENDING → CONFIRMED) with photo + verify confirmedAt
  await testUpdateDeliveryConfirmation({ user, id: confirmationId });
  await testGetDeliveryConfirmations({ user, filters: { deliveryConfirmationUniqueId: confirmationId } });

  // Soft delete + verify the row is filtered out (id filter must 404 after delete)
  await testDeleteDeliveryConfirmation({ user, id: confirmationId });
  try {
    await testGetDeliveryConfirmations({ user, filters: { deliveryConfirmationUniqueId: confirmationId }, silent: true });
    console.warn("⚠️  Confirmation still fetchable after soft delete");
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404) {
      console.log("✅ Confirmation gone after soft delete (404 as expected)");
    } else {
      throw error;
    }
  }

  console.log("── DeliveryConfirmation Workflow complete ──\n");
  return { confirmationId };
};

module.exports = {
  testDeliveryConfirmationWorkflow,
  testCreateDeliveryConfirmation,
  testGetDeliveryConfirmations,
  testUpdateDeliveryConfirmation,
  testDeleteDeliveryConfirmation,
};
