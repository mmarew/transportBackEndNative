const { testAuthWorkFlow } = require("../Auth");
const { usersData } = require("../constants");
const { createDriverDocument } = require("../Driver/DriversDocuments");
const { testGetAccountData } = require("../Auth/Account");
const {
  testCreateShipperRequest,
  testMarkJourneyCancellationAsSeen,
  testGetCancellationNotification,
  testGetShipperRequests,
} = require("./ShipperRequest");
const { verifyShipperStatus } = require("./VerifyShipperStatus");

// Backward-compat alias
const getShipperAccountData = () => testGetAccountData({ userType: "shipper" });

const testShipperAcceptDriversOffer = async (token) => {};

// ── Shipper onboarding: auth → upload docs → create request → verify status ──
const testShipperOnboardingFlow = async ({ userType = "shipper", requestMode = "individual_target" }) => {
  console.log(`\n✅ ========== SHIPPER ONBOARDING FLOW STARTED (${requestMode}) ==========\n`);

  await testAuthWorkFlow({ userType });

  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Shipper login failed, no token found.");
    return;
  }

  const accountData = await testGetAccountData({ userType });
  if (!accountData) return;

  const unAttachedDocumentTypes = accountData?.unAttachedDocumentTypes || [];
  if (unAttachedDocumentTypes.length > 0) {
    for (const doc of unAttachedDocumentTypes) {
      await createDriverDocument(token, doc);
    }
  } else {
    console.log("✅ All Shipper Documents are already uploaded!");
  }

  await testCreateShipperRequest(token, requestMode);
  await verifyShipperStatus(token);

  console.log("\n✅ ========== SHIPPER ONBOARDING FLOW COMPLETED SUCCESSFULLY ==========\n");
};

module.exports = {
  testShipperAcceptDriversOffer,
  testShipperOnboardingFlow,
  getShipperAccountData,
  testGetCancellationNotification,
  testMarkJourneyCancellationAsSeen,
  testGetShipperRequests,
};
