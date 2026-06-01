const { testLoginUser } = require("./LoginUser");
const { testCreateUser } = require("./RegisterUser");
const { testVerifyUserByOTP } = require("./VerifyByOtp");

const testAuthWorkFlow = async ({ userType }) => {
  if (!userType) {
    console.log("User type is required to run auth workflow.");
    return;
  }
  console.log(
    `\n✅ ========== AUTH WORKFLOW (${userType}) STARTED ==========\n`,
  );
  try {
    await testCreateUser({ userType });
    await testVerifyUserByOTP({ userType });
    await testLoginUser({ userType });
    console.log(
      `\n✅ ========== AUTH WORKFLOW (${userType}) COMPLETED SUCCESSFULLY ==========\n`,
    );
  } catch (error) {
    console.error(
      `AuthWorkflowError: Failed to complete auth workflow for ${userType}.`,
      error?.response?.data?.error || error?.message || error,
    );
  }
};
module.exports = { testAuthWorkFlow };
