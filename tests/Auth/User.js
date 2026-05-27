const { testCreateUser } = require("./RegisterUser");
const { testVerifyUserByOTP } = require("./VerifyByOtp");
const { testLoginUser } = require("./LoginUser");
const { getDriversAccountData } = require("../Driver/RequirementOfDriver");
const { usersData } = require("../constants");
const { createDriverDocument } = require("../Driver/DriversDocuments");
const {
  attachVehiclesDocuments,
  createVehicle,
} = require("../Driver/VehicleDriver");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const testDriverOnboardingFlow = async ({ userType = "driver" }) => {
  await testCreateUser({ userType });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });
  //get token from usersData[userType].token
  const token = usersData?.[userType]?.token;

  const data = await getDriversAccountData(token);
  const accountData = usersData["driver"]["accountData"];
  //check if all documents are uploaded if not attach docs.
  const unAttachedDriverDocumentTypes = accountData?.unAttachedDocumentTypes;
  console.log(
    "🚀 ~ testDriverOnboardingFlow ~ unAttachedDriverDocumentTypes:",
    unAttachedDriverDocumentTypes,
  );
  const vehicle = accountData?.vehicle;
  const vehicleUniqueId = vehicle?.vehicleUniqueId;
  //check if vehicle is null if yes create one and then create vehicle documents
  if (!vehicle) {
    await createVehicle(token);
    //toget latest data
    const data = await getDriversAccountData(token);
  }

  if (unAttachedDriverDocumentTypes?.length > 0) {
    unAttachedDriverDocumentTypes.map(async (doc) => {
      const roleId = doc?.roleId;
      if (roleId == usersRoles.driverRoleId)
        await attachVehiclesDocuments({
          token,
          documentType: doc,
          vehicleUniqueId,
        });
      else if (roleId == usersRoles.vehicleRoleId)
        await createDriverDocument(token, doc);
    });
  }
};

module.exports = {
  testDriverOnboardingFlow,
};
