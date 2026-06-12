const { testAuthWorkFlow } = require("../Auth");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const {
  usersData,
  backendURL,
  shipperRequestStatusData,
} = require("../constants");
const { createDriverDocument } = require("../Driver/DriversDocuments");
const { authConfig } = require("../Utils");
const {
  testCreateShipperRequest,
  testRejectDriverOffer,
  testCancelShipperRequest,
  testMarkJourneyCancellationAsSeen,
  testGetCancellationNotification,
} = require("./ShipperRequest");
const { verifyShipperStatus } = require("./VerifyShipperStatus");
const axios = require("axios");

const getShipperAccountData = async (token) => {
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.get(backendURL + "/api/shipper/account", config);
    console.log("✅ Success! Shipper Account Data fetched.");
    usersData["shipper"]["accountData"] = res.data;
    return res.data;
  } catch (error) {
    console.log("❌ Failed to get shipper account data.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};
const testShipperAcceptDriversOffer = async (token) => {};

const testShipperOnboardingFlow = async ({ userType = "shipper" }) => {
  console.log("\n✅ ========== SHIPPER ONBOARDING FLOW STARTED ==========\n");

  await testAuthWorkFlow({ userType });

  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Shipper login failed, no token found.");
    return;
  }

  let accountData = await getShipperAccountData(token);
  if (!accountData) return;

  const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];

  if (unAttachedDocumentTypes.length > 0) {
    for (const doc of unAttachedDocumentTypes) {
      // createDriverDocument uses /api/user/attachDocuments/self so it works perfectly for shippers too
      await createDriverDocument(token, doc);
    }
  } else {
    console.log("✅ All Shipper Documents are already uploaded!");
  }

  console.log("✅ Shipper onboarding flow completed!");

  // Now create a Shipper Request using the authenticated Shipper's token!
  await testCreateShipperRequest(token);

  // Verify Shipper Status after new request is created and store it in constants
  await verifyShipperStatus(token);
  console.log(
    "\n✅ ========== SHIPPER ONBOARDING FLOW COMPLETED SUCCESSFULLY ==========\n",
  );
  await testVerifyUserByOTP({ userType: "driver" });

  //to remove circular dependency
  const {
    testCreateDriverRequest,
    testVerifyDriverJourneyStatus,
    testCancelDriverRequest,
  } = require("../Driver/DriverRequest");

  await testCreateDriverRequest();
  //to get latest data after driver request is created and matched to shipper request
  await verifyShipperStatus(token);

  const data = await testVerifyDriverJourneyStatus({});
  const uniqueIds = data?.uniqueIds;

  const dataOfCancelledNotifications = await testGetCancellationNotification(
    {},
  );
  // const resultOfRejectedOffer = await testRejectDriverOffer({ uniqueIds });
  // const resultOfCancelShipperRequest = await testCancelShipperRequest({
  //   uniqueIds,
  // });
  // if (uniqueIds?.journeyDecisionUniqueId) await testCancelDriverRequest();
  if (
    dataOfCancelledNotifications?.[0]?.journeyDecision?.journeyDecisionUniqueId
  ) {
    const { journeyDecision, driver, shipper } =
      dataOfCancelledNotifications?.[0];
    const payLoad = {
      journeyDecisionUniqueId: journeyDecision.journeyDecisionUniqueId,

      shipperRequestUniqueId: shipper.shipperRequestUniqueId,
      rating: 4,
    };
    await testMarkJourneyCancellationAsSeen(payLoad);
  }
};
testShipperOnboardingFlow({});
module.exports = {
  testShipperAcceptDriversOffer,
  testShipperOnboardingFlow,
  getShipperAccountData,
};
