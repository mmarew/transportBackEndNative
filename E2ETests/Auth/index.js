const { testLoginUser } = require("./LoginUser");
const { testCreateUser } = require("./RegisterUser");
const { testVerifyUserByOTP } = require("./VerifyByOtp");

const testAuthWorkFlow = async ({ userType }) => {
  if (!userType) {
    throw new Error("User type is required to run auth workflow.");
  }
  console.log(`
✅ ========== AUTH WORKFLOW (${userType}) STARTED ==========
`);
  try {
    await testCreateUser({ userType });
    await testVerifyUserByOTP({ userType });
    await testLoginUser({ userType });
    console.log(`
✅ ========== AUTH WORKFLOW (${userType}) COMPLETED SUCCESSFULLY ==========
`);
  } catch (error) {
    console.error(
      `AuthWorkflowError: Failed to complete auth workflow for ${userType}.`,
      error?.response?.data?.error || error?.message || error,
    );
    throw error;
  }
};

const testVerifyAndLoginUser = async ({ userType }) => {
  if (!userType) {
    throw new Error("User type is required to verify and login.");
  }
  console.log(`
✅ ========== VERIFY & LOGIN WORKFLOW (${userType}) STARTED ==========
`);
  try {
    await testVerifyUserByOTP({ userType });
    await testLoginUser({ userType });
    console.log(`
✅ ========== VERIFY & LOGIN WORKFLOW (${userType}) COMPLETED SUCCESSFULLY ==========
`);
  } catch (error) {
    console.error(
      `VerifyAndLoginWorkflowError: Failed to verify/login ${userType}.`,
      error?.response?.data?.error || error?.message || error,
    );
    throw error;
  }
};

module.exports = { testAuthWorkFlow, testVerifyAndLoginUser };