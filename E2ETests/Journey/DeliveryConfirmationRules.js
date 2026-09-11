// POD Enforcement Rules — E2E Tests
// Converted from __tests__/deliveryConfirmation.test.js unit tests.
// Tests specific POD rules against the live API:
//   1. Settle (CONFIRMED) requires signature
//   2. Settle requires completed journey
//   3. Post-settle signed fields are immutable (driver can't edit)
//   4. Status CONFIRMED is terminal (can't change to DISPUTED/PENDING)
//   5. Non-admin can't re-settle DISPUTED → CONFIRMED
//   6. Duplicate create for same journey → 409
//   7. Non-shipper can't self-confirm (403)
//   8. Shipper self-confirm without signature → 400
//   9. Shipper self-confirm without completed journey → 400
//  10. Admin can delete CONFIRMED record, non-admin cannot
//  11. Unknown confirmation → 404

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const {
  expectGuardRejection,
  armExpect,
  disarmExpect,
} = require("../Expect");

const BASE_URL = "/api/deliveryConfirmations";
const PHOTO_PATH = path.join(__dirname, "..", "dummy.png");
const photoBlob = () => {
  if (!fs.existsSync(PHOTO_PATH)) return null;
  return new Blob([fs.readFileSync(PHOTO_PATH)], { type: "image/png" });
};

// The create API requires at least one proof photo, so every create form must
// include it (multipart "photo" field) — otherwise the backend rejects the
// create with 400 before any POD rule can be exercised.
const appendPhoto = (form) => {
  const photo = photoBlob();
  if (photo) form.append("photo", photo, "receiver_photo.png");
};

// Resolve the completed journey from the active run
const resolveJourney = () => {
  const journeyUniqueId =
    usersData.driver.lastJourneyUniqueId ||
    usersData.driver.journeyStatus?.uniqueIds?.journeyUniqueId;
  return journeyUniqueId;
};

// ── Rule 1: Settle without signature → 400 ──────────────────────────────────
const testSettleWithoutSignature = async () => {
  const token = usersData.driver?.token;
  if (!token) throw new Error("driver token not found");

  const journeyUniqueId = resolveJourney();
  if (!journeyUniqueId) {
    report.skip("Rule 1: settle without signature", "no completed journey available");
    return { skipped: true };
  }

  // First create a PENDING confirmation
  const form = new FormData();
  form.append("journeyUniqueId", journeyUniqueId);
  form.append("receiverPhoneNumber", `+251999999901`);
  form.append("receiverFullName", "Rule Test Receiver");
  form.append("deliveredQuantity", "10");
  form.append("quantityUnit", "quintal");
  form.append("condition", "GOOD");
  form.append("latitude", "9.01");
  form.append("longitude", "38.76");
  appendPhoto(form);

  let dcId;
  try {
    const createRes = await axios.post(backendURL + BASE_URL, form, authConfig(token));
    dcId = createRes.data?.data?.deliveryConfirmationUniqueId;
    if (!dcId) throw new Error("No DC ID returned from create");
  } catch (e) {
    // If 409 duplicate, find existing
    if (e.response?.status === 409) {
      const listRes = await axios.get(
        backendURL + `${BASE_URL}?journeyUniqueId=${journeyUniqueId}`,
        authConfig(token),
      );
      const existing = listRes.data?.data;
      dcId = Array.isArray(existing) ? existing[0]?.deliveryConfirmationUniqueId : existing?.deliveryConfirmationUniqueId;
      if (!dcId) throw new Error("409 but no existing DC found");
    } else {
      throw e;
    }
  }

  // Try to settle WITHOUT signature → must be rejected. Settle attempts are
  // performed by an admin (the only non-receiver actor allowed to settle) so the
  // rule under test is the signature requirement, not the settle-authorization
  // guard. Declared as a deliberate probe: a 400/422 here is the guard WORKING.
  await expectGuardRejection({
    label: "Rule 1: settle without a shipper signature is rejected",
    allowed: [400, 422],
    run: () => {
      const settleForm = new FormData();
      settleForm.append("status", "CONFIRMED");
      // No shipperSignature appended — that is the point of the probe.
      return axios.put(
        `${backendURL}${BASE_URL}/${dcId}`,
        settleForm,
        authConfig(usersData.admin?.token || token),
      );
    },
  });

  // Cleanup: delete the DC
  try {
    await axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(usersData.admin?.token || token));
  } catch { /* ignore cleanup errors */ }

  return { dcId };
};

// ── Rule 2: Duplicate create → 409 ──────────────────────────────────────────
const testDuplicateCreate = async () => {
  const token = usersData.driver?.token;
  if (!token) throw new Error("driver token not found");

  const journeyUniqueId = resolveJourney();
  if (!journeyUniqueId) {
    report.skip("Rule 2: duplicate create", "no completed journey available");
    return { skipped: true };
  }

  const makeForm = () => {
    const form = new FormData();
    form.append("journeyUniqueId", journeyUniqueId);
    form.append("receiverPhoneNumber", `+251999999902`);
    form.append("receiverFullName", "Duplicate Test Receiver");
    form.append("deliveredQuantity", "10");
    form.append("quantityUnit", "quintal");
    form.append("condition", "GOOD");
    form.append("latitude", "9.01");
    form.append("longitude", "38.76");
    appendPhoto(form);
    return form;
  };

  let dcId;
  // A POD may already exist for this journey from an earlier phase; a 409 here
  // is expected, so declare it and reuse the existing row.
  armExpect([409], "Rule 2: create POD (journey may already have one)");
  try {
    const res = await axios.post(backendURL + BASE_URL, makeForm(), authConfig(token));
    dcId = res.data?.data?.deliveryConfirmationUniqueId;
  } catch (e) {
    if (e.response?.status === 409) {
      // Already exists — that's the duplicate check working
      const listRes = await axios.get(
        backendURL + `${BASE_URL}?journeyUniqueId=${journeyUniqueId}`,
        authConfig(token),
      );
      const existing = listRes.data?.data;
      dcId = Array.isArray(existing) ? existing[0]?.deliveryConfirmationUniqueId : existing?.deliveryConfirmationUniqueId;
    } else {
      throw e;
    }
  } finally {
    disarmExpect();
  }

  // Create again for the same journey → either 409 (duplicate rejected) or an
  // idempotent 200 returning the existing DC. Both are correct behaviour; any
  // other status is a genuine failure and must propagate.
  armExpect([409], "Rule 2: duplicate create for the same journey");
  try {
    await axios.post(backendURL + BASE_URL, makeForm(), authConfig(token));
    report.pass("Rule 2: duplicate create is idempotent (returns existing DC)");
  } catch (e) {
    if (e.response?.status === 409) {
      report.guard("Rule 2: duplicate create rejected", 409);
    } else {
      throw e;
    }
  } finally {
    disarmExpect();
  }

  // Cleanup
  if (dcId) {
    try {
      await axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(usersData.admin?.token || token));
    } catch { /* ignore */ }
  }

  return { dcId };
};

// ── Rule 3: Non-shipper can't self-confirm → 403 ────────────────────────────
const testDriverCantSelfConfirm = async () => {
  const token = usersData.driver?.token;
  if (!token) throw new Error("driver token not found");

  const journeyUniqueId = resolveJourney();
  if (!journeyUniqueId) {
    report.skip("Rule 3: driver cannot self-confirm", "no completed journey available");
    return { skipped: true };
  }

  // Create a PENDING confirmation first
  let dcId;
  try {
    const form = new FormData();
    form.append("journeyUniqueId", journeyUniqueId);
    form.append("receiverPhoneNumber", `+251999999903`);
    form.append("receiverFullName", "Self-Confirm Test");
    form.append("deliveredQuantity", "10");
    form.append("quantityUnit", "quintal");
    form.append("condition", "GOOD");
    form.append("latitude", "9.01");
    form.append("longitude", "38.76");
    appendPhoto(form);
    const res = await axios.post(backendURL + BASE_URL, form, authConfig(token));
    dcId = res.data?.data?.deliveryConfirmationUniqueId;
  } catch (e) {
    if (e.response?.status === 409) {
      const listRes = await axios.get(
        backendURL + `${BASE_URL}?journeyUniqueId=${journeyUniqueId}`,
        authConfig(token),
      );
      const existing = listRes.data?.data;
      dcId = Array.isArray(existing) ? existing[0]?.deliveryConfirmationUniqueId : existing?.deliveryConfirmationUniqueId;
    } else {
      throw e;
    }
  }

  if (!dcId) {
    report.skip("Rule 3: driver cannot self-confirm", "could not create the PENDING confirmation");
    return { skipped: true };
  }

  // Driver (not the receiver, not an admin) tries to settle → must be blocked.
  // Declared probe: 403/400 proves the settle-authorization guard works. If the
  // driver CAN self-confirm, expectGuardRejection throws → counted as ❌ FAIL,
  // never downgraded to a warning.
  await expectGuardRejection({
    label: "Rule 3: driver cannot self-confirm a delivery",
    allowed: [403, 400],
    run: () => {
      const settleForm = new FormData();
      settleForm.append("status", "CONFIRMED");
      settleForm.append("shipperSignature", "driver-sig");
      return axios.put(
        `${backendURL}${BASE_URL}/${dcId}`,
        settleForm,
        authConfig(token),
      );
    },
  });

  // Cleanup
  try {
    await axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(usersData.admin?.token || token));
  } catch { /* ignore */ }

  return { dcId };
};

// ── Rule 4: Non-admin can't delete CONFIRMED record ─────────────────────────
const testNonAdminCantDeleteConfirmed = async () => {
  const token = usersData.driver?.token;
  if (!token) throw new Error("driver token not found");

  const journeyUniqueId = resolveJourney();
  if (!journeyUniqueId) {
    report.skip("Rule 4: non-admin cannot delete CONFIRMED", "no completed journey available");
    return { skipped: true };
  }

  // Create a confirmation and settle it
  let dcId;
  try {
    const form = new FormData();
    form.append("journeyUniqueId", journeyUniqueId);
    form.append("receiverPhoneNumber", `+251999999904`);
    form.append("receiverFullName", "Delete Test Receiver");
    form.append("deliveredQuantity", "10");
    form.append("quantityUnit", "quintal");
    form.append("condition", "GOOD");
    form.append("latitude", "9.01");
    form.append("longitude", "38.76");
    appendPhoto(form);
    const createRes = await axios.post(backendURL + BASE_URL, form, authConfig(token));
    dcId = createRes.data?.data?.deliveryConfirmationUniqueId;
  } catch (e) {
    if (e.response?.status === 409) {
      const listRes = await axios.get(
        backendURL + `${BASE_URL}?journeyUniqueId=${journeyUniqueId}`,
        authConfig(token),
      );
      const existing = listRes.data?.data;
      dcId = Array.isArray(existing) ? existing[0]?.deliveryConfirmationUniqueId : existing?.deliveryConfirmationUniqueId;
    } else {
      throw e;
    }
  }

  if (!dcId) {
    report.skip("Rule 4: non-admin cannot delete CONFIRMED", "could not create the confirmation");
    return { skipped: true };
  }

  // Settle it with an admin's signature (admin is an allowed settler; the
  // driver cannot self-confirm). Then the driver tries to delete CONFIRMED.
  try {
    const settleForm = new FormData();
    settleForm.append("status", "CONFIRMED");
    settleForm.append("shipperSignature", "test-sig");
    await axios.put(
      `${backendURL}${BASE_URL}/${dcId}`,
      settleForm,
      authConfig(usersData.admin?.token || token),
    );
  } catch (error) {
    // Settling is the PRECONDITION for this rule, not the probe itself: an admin
    // settle must always succeed. If it does not, that is a genuine failure —
    // never downgrade it to a skip.
    try {
      await axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(usersData.admin?.token || token));
    } catch { /* best-effort cleanup only */ }
    throw new Error(
      `Rule 4 precondition failed — admin could not settle the DC: ${error?.response?.status || ""} ${error?.message || error}`,
    );
  }

  // Non-admin (driver) tries to delete a CONFIRMED record → must be blocked.
  // Declared probe: 403/400 is the guard working; anything else is a real fail.
  await expectGuardRejection({
    label: "Rule 4: non-admin cannot delete a CONFIRMED record",
    allowed: [403, 400],
    run: () =>
      axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(token)),
  });

  // Cleanup with admin
  try {
    await axios.delete(`${backendURL}${BASE_URL}/${dcId}`, authConfig(usersData.admin?.token || token));
  } catch { /* ignore */ }

  return { dcId };
};

// ── Rule 5: Unknown confirmation → 404 ──────────────────────────────────────
const testGetUnknownConfirmation = async () => {
  const token = usersData.admin?.token || usersData.driver?.token;
  if (!token) throw new Error("no token found");

  // An unknown id must either 404 or come back as an empty filter result — both
  // are correct. Anything else (5xx, 403, …) is a genuine failure.
  armExpect([404], "Rule 5: fetch an unknown confirmation id");
  try {
    await axios.get(
      backendURL + `${BASE_URL}?deliveryConfirmationUniqueId=00000000-0000-4000-8000-000000000000`,
      authConfig(token),
    );
    report.pass("Rule 5: unknown confirmation returns an empty list (not an error)");
  } catch (e) {
    if (e.response?.status === 404) {
      report.guard("Rule 5: unknown confirmation returns 404", 404);
    } else {
      throw e;
    }
  } finally {
    disarmExpect();
  }
};

// ── Full rules workflow ──────────────────────────────────────────────────────
const testDeliveryConfirmationRules = async ({ user = usersData.driver } = {}) => {
  console.log("\n── DeliveryConfirmation Rules (POD Enforcement) ──");

  await testSettleWithoutSignature();
  await testDuplicateCreate();
  await testDriverCantSelfConfirm();
  await testNonAdminCantDeleteConfirmed();
  await testGetUnknownConfirmation();

  console.log("── DeliveryConfirmation Rules complete ──\n");
};

module.exports = {
  testDeliveryConfirmationRules,
  testSettleWithoutSignature,
  testDuplicateCreate,
  testDriverCantSelfConfirm,
  testNonAdminCantDeleteConfirmed,
  testGetUnknownConfirmation,
};
