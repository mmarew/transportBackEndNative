// ensureUser.js — THE single reusable user-provisioning entry point.
//
// Every suite (main E2E, Queue, and all sub-suites) must obtain a user through
// ensureUser({ userType }). It provisions create → verify → login (→ account)
// exactly ONCE per run per role and reuses the cached user afterwards, so no
// suite ever re-creates a user or duplicates auth wiring.

const {
  apiCreateUser,
  apiCreateUserByAdmin,
  apiVerifyUserByOTP,
  apiLoginUser,
  isUserMissingError,
} = require("./authApi");
const { testGetAccountData } = require("./Account");
const { usersData } = require("../constants");

// Role-aware provisioning strategy — single source of truth for how each
// canonical user is created/verified/logged-in.
const PUBLIC_CREATE_ROLES = new Set([
  "driver",
  "shipper",
  "companyAdmin",
  "queueOrgAdmin",
]);
const ADMIN_CREATE_ROLES = new Set(["admin"]);
// Pre-seeded by the backend (createTables → createUserSystem), never created
// via an API endpoint — verify + login only.
const SEED_ONLY_ROLES = new Set(["supperAdmin", "systemAdmin"]);
const ACCOUNT_FETCH_ROLES = new Set(["driver", "shipper", "companyAdmin"]);

// Acceptance counters — lets CI assert each step fires once per role per run.
const provisioning = { created: 0, verified: 0, loggedIn: 0, reused: 0 };

/**
 * Create a user via the appropriate API endpoint based on role type.
 *
 * - SEED_ONLY_ROLES (supperAdmin, systemAdmin): pre-seeded by backend, skip creation
 * - PUBLIC_CREATE_ROLES (driver, shipper, companyAdmin, queueOrgAdmin): create via public endpoint
 * - queueDriver* (queueDriver1..N): dynamic driver types for queue E2E tests, create via public endpoint
 * - ADMIN_CREATE_ROLES (admin): create via admin endpoint (requires superAdmin token)
 *
 * @param {string} userType - Canonical key in usersData (e.g., 'driver', 'queueDriver1')
 * @throws {Error} If API call fails with non-409 status
 */
const ensureCreate = async (userType) => {
  if (SEED_ONLY_ROLES.has(userType)) {
    return false; // Pre-seeded by the backend — never create via API.
  }
  if (PUBLIC_CREATE_ROLES.has(userType) || userType.startsWith("queueDriver")) {
    const created = await apiCreateUser(userType);
    if (created) provisioning.created++;
    return created;
  }
  if (ADMIN_CREATE_ROLES.has(userType)) {
    const superAdmin = await ensureUser({ userType: "supperAdmin" });
    const created = await apiCreateUserByAdmin(userType, superAdmin.token);
    if (created) provisioning.created++;
    return created;
  }
  return false;
};

// Provisioning ordering — REGISTER BEFORE LOGIN:
// 1. Create the user FIRST (idempotent — existing users are simply reused).
// 2. Verify the OTP (issues the token) — always succeeds now that the user
//    exists, so fresh runs never produce a 404 "user not found".
// 3. Re-login as an OTP-dispatch side-effect (no token, matches legacy flow).
// Seed-only roles (supperAdmin, systemAdmin) skip creation entirely.
const ensureLoginWithRegisterFallback = async (userType, skipCreate) => {
  const canCreate = !skipCreate && !SEED_ONLY_ROLES.has(userType);
  if (canCreate) {
    try {
      await ensureCreate(userType);
    } catch (error) {
      // Creation failed for a non-duplicate reason — don't abort yet, the user
      // may already exist and OTP verification may still succeed.
      console.warn(
        `  ⚠ ${userType} pre-create failed, attempting verify anyway:`,
        error?.response?.status || error?.message,
      );
    }
  }

  try {
    await apiVerifyUserByOTP(userType);
    provisioning.verified++;
    provisioning.loggedIn++;
    await apiLoginUser(userType); // OTP dispatch side-effect (no token)
    return;
  } catch (error) {
    if (!isUserMissingError(error)) throw error;
  }

  // Extremely unlikely after the create-first path above — retained only as a
  // safety net for seed-only roles or external deletes mid-run.
  if (skipCreate || SEED_ONLY_ROLES.has(userType)) {
    throw new Error(
      `Login failed for "${userType}" and it cannot be (re)created (seed-only role)`,
    );
  }

  console.warn(
    `⚠️  ${userType} register-then-verify did not resolve — re-creating and re-verifying once`,
  );
  await ensureCreate(userType);
  await apiVerifyUserByOTP(userType);
  provisioning.verified++;
  await apiLoginUser(userType);
  provisioning.loggedIn++;
};

const ensureAccountData = async (userType) => {
  if (!ACCOUNT_FETCH_ROLES.has(userType)) return;
  try {
    await testGetAccountData({ userType });
  } catch (error) {
    // Account fetch is best-effort — auth already succeeded.
    console.warn(
      `⚠  ensureUser: account fetch failed for ${userType} (continuing):`,
      error?.response?.data?.error || error?.message,
    );
  }
};

/**
 * Ensure a canonical user is provisioned (create → verify → login) and cached.
 *
 * @param {object} params
 * @param {string} params.userType canonical key in usersData
 *   (driver | shipper | admin | companyAdmin | queueOrgAdmin | supperAdmin |
 *    systemAdmin | queueDriver1..N)
 * @param {object}  [params.options]
 * @param {boolean} [params.options.force=false] re-provision even if token exists
 * @param {boolean} [params.options.fetchAccount=true] fetch+cache role account data
 * @returns {object} the cached usersData[userType] entry (token set)
 */
const ensureUser = async ({ userType, options = {} }) => {
  const { force = false, fetchAccount = true, skipCreate = false } = options;
  const user = usersData[userType];
  if (!user) {
    throw new Error(
      `No user definition for "${userType}" — add it to E2ETests/constants.js.`,
    );
  }

  if (!force && user.token) {
    provisioning.reused++;
    return user;
  }

  console.log(`\n✅ ========== PROVISIONING USER (${userType}) ==========`);

  await ensureLoginWithRegisterFallback(userType, Boolean(skipCreate));
  if (fetchAccount) {
    await ensureAccountData(userType);
  }

  if (!usersData[userType].token) {
    throw new Error(`Provisioning ${userType} finished without a token.`);
  }
  return usersData[userType];
};

module.exports = { ensureUser, provisioning };
