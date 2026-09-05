// ProvisionDrivers.js — provision 10 driver accounts on the fixed fleet phone
// block +25192211248{0..9} by driving the REAL onboarding flow end-to-end:
//   create → OTP-verify/login → register/reuse a vehicle → upload user + vehicle
//   documents → admin-approve documents → assert ACTIVE.
//
// This is NOT a test suite (no Reporter assertions). It reuses the canonical E2E
// helpers (ensureUser, createDriverDocument, attachVehiclesDocuments) plus raw
// axios calls to the same endpoints the app uses. Run it with:
//   node E2ETests/ProvisionDrivers.js

"use strict";

const axios = require("axios");
const { backendURL, usersData, usersRoles, USER_STATUS } = require("./constants");
const { authConfig } = require("./Utils");
const { ensureUser } = require("./Auth/ensureUser");
const { apiCreateUserByAdmin } = require("./Auth/authApi");
const { createDriverDocument } = require("./Driver/DriversDocuments");
const { attachVehiclesDocuments } = require("./Driver/VehicleDriver");
const {
  ATTACHED_DOCUMENTS_ENDPOINTS,
} = require("../Routes/EndPoints/attachedDocuments.endpoints");

const PHONE_PREFIX = "+25192211248";
const DRIVER_COUNT = 10;
const DRIVER_OTP = 101010;

const superAdminToken = () => usersData.supperAdmin?.token;
const adminToken = () => usersData.admin?.token;

// ── Auth scaffolding ───────────────────────────────────────────────────────────

const ensureAdminTokens = async () => {
  await ensureUser({ userType: "supperAdmin", options: { skipCreate: true } });
  await ensureUser({ userType: "admin" });
};

// Inject the 10 fixed-phone driver definitions into usersData so ensureUser can
// provision them like any other canonical queue driver. Placeholder emails are
// safe for pre-existing accounts (the backend skips the email-mismatch guard
// when the submitted email is a placeholder).
const defineFleetUsers = () => {
  for (let i = 0; i < DRIVER_COUNT; i++) {
    const userType = `queueDriver${i + 1}`;
    usersData[userType] = {
      fullName: `Fleet Driver ${PHONE_PREFIX}${i}`,
      email: `${PHONE_PREFIX.slice(1)}${i}@dynamics.com`,
      phoneNumber: `${PHONE_PREFIX}${i}`,
      roleId: usersRoles.driverRoleId,
      statusId: USER_STATUS.ACTIVE,
      OTP: DRIVER_OTP,
      token: null,
      accountData: null,
    };
  }
};

// ── HTTP helpers ───────────────────────────────────────────────────────────────

const getVehicleTypes = async () => {
  const res = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(superAdminToken()),
  );
  const types = res.data?.data;
  if (!types || types.length === 0) {
    throw new Error("No vehicle types seeded");
  }
  return types;
};

const registerVehicle = async (token, vehicleTypeUniqueId) => {
  const res = await axios.post(
    backendURL + "/api/user/vehicles/driverUserUniqueId/self",
    {
      licensePlate: "P" + String(Date.now()).slice(-6),
      color: "white color",
      vehicleTypeUniqueId,
      isDriverOwnerOfVehicle: false,
    },
    authConfig(token),
  );
  return res.data;
};

const fetchDriverAccount = async (token) => {
  const res = await axios.get(backendURL + "/api/driver/account", authConfig(token));
  return res.data;
};

// The server wraps responses as `{ data: {...} }` (and the account endpoint may
// nest again at `data.data`); be tolerant of all shapes. A shallow union of
// both the body and its `.data` lets field reads work regardless of wrapping.
const unwrap = (account) => {
  const body = account?.data ?? account;
  return { ...(typeof body === "object" && body), ...(typeof body?.data === "object" && body.data) };
};

const getVehicle = (account) => unwrap(account)?.vehicle;

const getUserUniqueId = (account) => unwrap(account)?.userData?.userUniqueId;

const getStatus = (account) => {
  const merged = unwrap(account);
  return merged?.status ?? merged?.userData?.status;
};

// Bring-in-place sync: collect every documentTypeId already uploaded so we never
// upload a duplicate, then upload all required-but-missing user (role 2) and
// vehicle (role 9) documents.
const ensureDocuments = async ({ account, token, vehicleUniqueId }) => {
  const body = unwrap(account);
  const uploadedTypeIds = new Set();
  for (const status of ["PENDING", "ACCEPTED", "REJECTED"]) {
    (body?.attachedDocumentsByStatus?.[status] || []).forEach((doc) => {
      uploadedTypeIds.add(doc.documentTypeId);
    });
  }

  const missing = body?.unAttachedDocumentTypes || [];
  for (const documentType of missing) {
    if (uploadedTypeIds.has(documentType.documentTypeId)) continue;
    if (documentType.roleId === usersRoles.vehicleRoleId && vehicleUniqueId) {
      await attachVehiclesDocuments({ token, documentType, vehicleUniqueId });
    } else if (documentType.roleId === usersRoles.driverRoleId) {
      await createDriverDocument(token, documentType);
    }
    uploadedTypeIds.add(documentType.documentTypeId);
  }
};

// Admin: fetch every pending document for a phone and accept it (triggers the
// status recalculation that flips the driver to ACTIVE once requirements are met).
const approvePendingDocuments = async ({ phoneNumber }) => {
  const res = await axios.get(
    backendURL +
      "/api/admin/getUnAuthorizedDriver?phone=" +
      encodeURIComponent(phoneNumber),
    authConfig(adminToken()),
  );
  const pending = res.data?.data?.[0]?.attachedDocumentsByStatus?.PENDING || [];
  for (const doc of pending) {
    await axios.put(
      backendURL + ATTACHED_DOCUMENTS_ENDPOINTS.ADMIN_ACCEPT_REJECT_DOCUMENTS,
      {
        roleId: doc.roleId,
        attachedDocumentUniqueId: doc.attachedDocumentUniqueId,
        action: "ACCEPTED",
        reason: "Document verified during fleet provisioning.",
      },
      authConfig(adminToken()),
    );
  }
};

const forceActivate = async ({ userUniqueId, phoneNumber }) => {
  const res = await axios.put(
    backendURL + `/api/admin/userRoleStatus/${userUniqueId}`,
    {
      roleId: usersRoles.driverRoleId,
      newStatusId: USER_STATUS.ACTIVE,
      phoneNumber,
      userRoleStatusDescription: "Fleet driver forced to ACTIVE after provisioning",
    },
    authConfig(superAdminToken()),
  );
  return res.data;
};

// ── Per-driver onboarding ──────────────────────────────────────────────────────

const provisionOneDriver = async ({ userType, vehicleTypeUniqueId }) => {
  const phoneNumber = usersData[userType].phoneNumber;
  console.log(`\n── Onboarding ${phoneNumber} (${userType}) ──`);

  // 1. Auth: create (if needed) → OTP-verify → login token. Handles pre-existing
  //    accounts and adds the driver role when the phone has only other roles.
  await ensureUser({ userType, options: { fetchAccount: false } });
  const token = usersData[userType].token;

  // 2. Vehicle: reuse an existing active vehicle, otherwise register one.
  let account = await fetchDriverAccount(token);
  let vehicle = getVehicle(account);
  if (!vehicle?.vehicleUniqueId) {
    await registerVehicle(token, vehicleTypeUniqueId);
    account = await fetchDriverAccount(token);
    vehicle = getVehicle(account);
    if (!vehicle?.vehicleUniqueId) {
      throw new Error(`Vehicle registration failed for ${phoneNumber}`);
    }
  }

  // 3. Upload required user + vehicle documents (no duplicates).
  await ensureDocuments({
    account,
    token,
    vehicleUniqueId: vehicle.vehicleUniqueId,
  });

  // 4. Admin accepts every pending document for this phone → status recalc.
  await approvePendingDocuments({ phoneNumber: usersData[userType].phoneNumber });

  // 5. Assert ACTIVE (with a force-activate fallback for out-of-band blockers).
  account = await fetchDriverAccount(token);
  let status = getStatus(account);
  const userUniqueId = getUserUniqueId(account);
  if (status !== USER_STATUS.ACTIVE) {
    if (userUniqueId) {
      await forceActivate({ userUniqueId, phoneNumber });
      account = await fetchDriverAccount(token);
      status = getStatus(account);
    }
  }

  return {
    userType,
    phoneNumber,
    userUniqueId,
    status,
    vehicleUniqueId: getVehicle(account)?.vehicleUniqueId,
    passed: status === USER_STATUS.ACTIVE,
  };
};

// ── Entry point ────────────────────────────────────────────────────────────────

const provisionFleetDrivers = async () => {
  console.log("═══════════════════════════════════════════════════");
  console.log("  PROVISION FLEET DRIVERS —", new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  await ensureAdminTokens();
  defineFleetUsers();

  // Guarantee every fleet phone has a driver (role 2) account + status row.
  // Admin-create is idempotent: it no-ops when the role already exists and
  // creates the user (or an existing user's missing role) otherwise.
  for (let i = 0; i < DRIVER_COUNT; i++) {
    const userType = `queueDriver${i + 1}`;
    await apiCreateUserByAdmin(userType, superAdminToken());
    console.log(`  ✅ driver role ensured for ${usersData[userType].phoneNumber}`);
  }

  const types = await getVehicleTypes();
  const vehicleTypeUniqueId = types[0].vehicleTypeUniqueId;

  const results = [];
  for (let i = 0; i < DRIVER_COUNT; i++) {
    try {
      const result = await provisionOneDriver({
        userType: `queueDriver${i + 1}`,
        vehicleTypeUniqueId,
      });
      results.push(result);
    } catch (error) {
      const detail =
        error?.response?.data?.error?.details ||
        error?.response?.data?.error?.message ||
        error?.response?.data?.error ||
        error?.message;
      results.push({
        userType: `queueDriver${i + 1}`,
        phoneNumber: `${PHONE_PREFIX}${i}`,
        status: null,
        passed: false,
        error: typeof detail === "string" ? detail : JSON.stringify(detail),
      });
    }
  }

  console.log("\n────── FLEET PROVISIONING SUMMARY ──────");
  for (const r of results) {
    console.log(
      `${r.passed ? "✅" : "❌"} ${r.phoneNumber} (${r.userType}) → status=${r.status ?? "N/A"}` +
        (r.error ? ` — ${r.error}` : ""),
    );
  }
  const active = results.filter((r) => r.passed).length;
  console.log(`\n${active}/${DRIVER_COUNT} drivers ACTIVE`);
  return active === DRIVER_COUNT;
};

// Standalone runner: `node E2ETests/ProvisionDrivers.js`
if (require.main === module) {
  provisionFleetDrivers()
    .then((allActive) => {
      console.log(allActive ? "ALL DRIVERS ACTIVE ✅" : "SOME DRIVERS NOT ACTIVE ❌");
      process.exit(allActive ? 0 : 1);
      return null;
    })
    .catch((error) => {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    });
}

module.exports = { provisionFleetDrivers };