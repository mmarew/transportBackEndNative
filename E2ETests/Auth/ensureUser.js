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
    return; // Pre-seeded by the backend — never create via API.
  }
  if (PUBLIC_CREATE_ROLES.has(userType) || userType.startsWith("queueDriver")) {
    await apiCreateUser(userType);
    provisioning.created++;
  } else if (ADMIN_CREATE_ROLES.has(userType)) {
    const superAdmin = await ensureUser({ userType: "supperAdmin" });
    await apiCreateUserByAdmin(userType, superAdmin.token);
    provisioning.created++;
  }
};

// Provisioning ordering: try the OTP LOGIN (verifyUserByOTP issues the token)
// FIRST — the idempotent fast path for re-runs. If it fails because the user
// does not exist or was deleted, (re)register the user, verify again (login),
// then re-login. Never skip silently. LOGIN_USER only dispatches the OTP and
// issues no token, so it runs as a side-effect after a successful verify.
const ensureLoginWithRegisterFallback = async (userType, skipCreate) => {
  try {
    await apiVerifyUserByOTP(userType);
    provisioning.verified++;
    provisioning.loggedIn++;
    await apiLoginUser(userType); // OTP dispatch side-effect (no token)
    return;
  } catch (error) {
    if (!isUserMissingError(error)) throw error;
    console.warn(
      `⚠️  ${userType} login says user not found — registering then re-logging in`,
    );
  }

  if (skipCreate) {
    throw new Error(
      `Login failed for "${userType}" and it cannot be (re)created (seed-only role)`,
    );
  }

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
