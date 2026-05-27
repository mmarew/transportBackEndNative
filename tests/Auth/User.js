const { testCreateUser } = require("./RegisterUser");
const { testVerifyUserByOTP } = require("./VerifyByOtp");
const { testLoginUser } = require("./LoginUser");
const { getDriversAccountData } = require("../Driver/RequirementOfDriver");
const { usersData } = require("../constants");
const testDriverOnboardingFlow = async ({ userType = "driver" }) => {
  await testCreateUser({ userType });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });
  //get token from usersData[userType].token
  const token = usersData?.[userType]?.token;

  console.log("$$$$$", token);

  const data = await getDriversAccountData(token);

  console.log("@@@@@@", data);
};

module.exports = {
  testDriverOnboardingFlow,
};
