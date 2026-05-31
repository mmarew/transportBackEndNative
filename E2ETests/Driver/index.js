const { testCreateUser } = require("../Auth/RegisterUser");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");

const { getDriversAccountData, evaluateDriversDocumentVehicleRequirement } = require("./RequirementOfDriver");
const { usersData } = require("../constants");
const { getDriverJourneyStatus, acceptCompanyAssignment, acceptShipperRequest, startJourney, completeJourney } = require("./DriverJourneyStatus");

const testDriverOnboardingFlow = async ({ userType = "driver" }) => {
  await testCreateUser({ userType });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });

  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Driver login failed, no token found.");
    return;
  }

  // Creates vehicle if missing, uploads all user docs + vehicle docs,
  // skips already-uploaded ones to prevent duplicates.
  await evaluateDriversDocumentVehicleRequirement();

  // Documents are now uploaded but need admin approval before the driver
  // can be activated. fetchUnAuthorizedDrivers + authorizeDriversDocuments
  // must run after this point (handled in the main index.js flow).

  const journeyStatus = await getDriverJourneyStatus({ userType });
  if (!journeyStatus) {
    console.log("⚠️  No journey status returned — driver may have no active request yet.");
    return;
  }

  const isCompanyMode = !!journeyStatus?.companyAssignment?.assignmentUniqueId;
  const isIndividualMode = !isCompanyMode && !!journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

  if (isCompanyMode) {
    console.log("🏢 Company assignment detected — confirming...");
    await acceptCompanyAssignment({ userType });
  } else if (isIndividualMode) {
    console.log("👤 Individual shipper match detected — accepting...");
    await acceptShipperRequest({ userType });
  } else {
    console.log("⏳ Driver has no pending assignment or match yet (status:", journeyStatus?.status, ")");
    return;
  }

  // Only start/complete journey if driver has an active accepted assignment
  await startJourney({ userType });
  await completeJourney({ userType });
};
  


module.exports = {
  testDriverOnboardingFlow,
};
