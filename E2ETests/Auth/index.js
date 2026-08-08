// Auth workflow entry points — thin backward-compatible wrappers.
// ALL provisioning now routes through ensureUser (Auth/ensureUser.js), the
// single idempotent create → verify → login pipeline used by every suite.
// New code should call ensureUser / ensureCoreUsers directly.

const { ensureUser } = require("./ensureUser");

const testAuthWorkFlow = async ({ userType, options }) => {
  if (!userType) {
    throw new Error("User type is required to run auth workflow.");
  }
  await ensureUser({ userType, options });
};

const testVerifyAndLoginUser = async ({ userType, options }) => {
  if (!userType) {
    throw new Error("User type is required to verify and login.");
  }
  await ensureUser({ userType, options: { ...options, skipCreate: true } });
};

module.exports = { testAuthWorkFlow, testVerifyAndLoginUser };
