const { testCreateUser } = require("./RegisterUser");
const { testVerifyUserByOTP } = require("./VerifyByOtp");
const { testLoginUser } = require("./LoginUser");
const testDriverOnboardingFlow = async () => {
  await testCreateUser({ userType: "driver" });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });

  const documentAndVehicleOfDriver = res.data.documentAndVehicleOfDriver;
  //store documentAndVehicleOfDriver in usersData[userType]
  if (userType === "driver") {
    usersData[userType].documentAndVehicleOfDriver = documentAndVehicleOfDriver;
    evaluateDriversDocumentVehicleRequirement();
  }
};
testDriverOnboardingFlow();
