const { testAuthWorkFlow } = require("../Auth");
const { usersData } = require("../constants");
const { createDriverDocument } = require("../Driver/DriversDocuments");
const { testGetAccountData } = require("../Auth/Account");
const {
  testCreateShipperRequest,
  testRejectDriverOffer,
  testCancelShipperRequest,
  testMarkJourneyCancellationAsSeen,
  testGetCancellationNotification,
  testGetShipperRequests,
} = require("./ShipperRequest");
const { verifyShipperStatus } = require("./VerifyShipperStatus");

// Backward-compat alias
const getShipperAccountData = (token) => testGetAccountData({ userType: "shipper" });
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};

const testShipperAcceptDriversOffer = async (token) => {};

// ── Shipper onboarding: auth → upload docs → create request → verify status ──
// NOTE: Driver request creation and journey lifecycle are handled in index.js.
const testShipperOnboardingFlow = async ({ userType = "shipper", requestMode = "individual_target" }) => {
  console.log(`\n✅ ========== SHIPPER ONBOARDING FLOW STARTED (${requestMode}) ==========\n`);

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
      // createDriverDocument uses /api/user/attachDocuments/self — works for shippers too
      await createDriverDocument(token, doc);
    }
  } else {
    console.log("✅ All Shipper Documents are already uploaded!");
  }

  // Create a Shipper Request
  await testCreateShipperRequest(token, requestMode);

  // Verify Shipper Status and store in constants
  await verifyShipperStatus(token);

  console.log(
    "\n✅ ========== SHIPPER ONBOARDING FLOW COMPLETED SUCCESSFULLY ==========\n",
  );
};

module.exports = {
  testShipperAcceptDriversOffer,
  testShipperOnboardingFlow,
  getShipperAccountData,
  // Expose individual helpers so index.js can call cancellation flows directly
  testGetCancellationNotification,
  testMarkJourneyCancellationAsSeen,
  testGetShipperRequests,
};
