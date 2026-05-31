const { testCreateUser } = require("../Auth/RegisterUser");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");
const { usersData, backendURL } = require("../constants");
const { createDriverDocument } = require("../Driver/DriversDocuments");
const { createShipperRequestFlow } = require("./CreateShipperRequest");
const { verifyShipperStatus } = require("./VerifyShipperStatus");
const axios = require("axios");

const getShipperAccountData = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
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

const testShipperOnboardingFlow = async ({ userType = "shipper" }) => {

  await testCreateUser({ userType });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });

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
  await createShipperRequestFlow(token);

  // Verify Shipper Status and store it in constants
  await verifyShipperStatus(token);
};
testShipperOnboardingFlow({ userType: "shipper" });
module.exports = {
  testShipperOnboardingFlow,
  getShipperAccountData,
};
