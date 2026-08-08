// bootstrap.js — one-call provisioning of every canonical user for a run.
// Used by the main E2E suite and the Queue suite so all roles are created
// ONCE from the beginning and then reused everywhere (see ensureUser.js).

const { ensureUser } = require("./ensureUser");
const { usersData, runId } = require("../constants");

// Canonical users, in dependency order (supperAdmin must exist before admin
// can be created via the admin-creation endpoint).
const CORE_USER_TYPES = [
  "supperAdmin",
  "systemAdmin",
  "admin",
  "companyAdmin",
  "queueOrgAdmin",
  "driver",
  "shipper",
];

const ensureCoreUsers = async ({ fetchAccount = true } = {}) => {
  console.log("\n═══ PROVISIONING ALL CORE USERS (once per run) ═══");
  for (const userType of CORE_USER_TYPES) {
    await ensureUser({ userType, options: { fetchAccount } });
  }
  console.log("═══ CORE USERS READY ═══\n");
};

const makeQueueDriver = (n) => ({
  fullName: `Queue Driver ${n}`,
  email: `queuedriver${n}+${runId}@test.com`,
  phoneNumber: `+2519${runId}${String(n).padStart(2, "0")}`,
  roleId: 2,
  OTP: 101010,
  token: null,
  accountData: null,
});

const ensureQueueDrivers = async ({ count = 4 } = {}) => {
  for (let i = 1; i <= count; i++) {
    const userType = `queueDriver${i}`;
    if (!usersData[userType]) {
      usersData[userType] = makeQueueDriver(i);
    }
    await ensureUser({
      userType,
      options: { fetchAccount: false },
    });
  }
};

module.exports = { ensureCoreUsers, ensureQueueDrivers, CORE_USER_TYPES };
