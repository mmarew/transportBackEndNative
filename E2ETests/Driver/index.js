const { testCreateUser } = require("../Auth/RegisterUser");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");

const { getDriversAccountData } = require("./RequirementOfDriver");
const { usersData } = require("../constants");
const { createDriverDocument } = require("./DriversDocuments");
const { attachVehiclesDocuments, createVehicle } = require("./VehicleDriver");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { getDriverJourneyStatus, acceptCompanyAssignment, acceptShipperRequest, startJourney, completeJourney } = require("./DriverJourneyStatus");

const testDriverOnboardingFlow = async ({ userType = "driver" }) => {
  await testCreateUser({ userType });
  await testVerifyUserByOTP({ userType });
  await testLoginUser({ userType });
  //get token from usersData[userType].token
  const token = usersData?.[userType]?.token;

  await getDriversAccountData(token);
  let accountData = usersData["driver"]["accountData"];
  //check if all documents are uploaded if not attach docs.
  const unAttachedDriverDocumentTypes = accountData?.unAttachedDocumentTypes;
  const vehicle = accountData?.vehicle;
  const vehicleUniqueId = vehicle?.vehicleUniqueId;
  //check if vehicle is null if yes create one and then create vehicle documents
  if (!vehicle) {
    await createVehicle(token);
    //to get latest data
    await getDriversAccountData(token);
    //to get latest account data
    accountData = usersData["driver"]["accountData"];
  }

  if (unAttachedDriverDocumentTypes?.length > 0) {
    unAttachedDriverDocumentTypes.map(async (doc) => {
      const roleId = doc?.roleId;
      if (roleId == usersRoles.driverRoleId)
        await createDriverDocument(token, doc);
      else if (roleId == usersRoles.vehicleRoleId)
        await attachVehiclesDocuments({
          token,
          documentType: doc,
          vehicleUniqueId,
        });
    });
  }

  // if there are pending documents, it means admin must approve it before proceeding.

  const journeyStatus = await getDriverJourneyStatus({ userType });
  if (!journeyStatus) {
    console.log("⚠️  No journey status returned — driver may have no active request yet.");
    return;
  }

  const isCompanyMode = !!journeyStatus?.companyAssignment?.assignmentUniqueId;
  const isIndividualMode = !isCompanyMode && !!journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

  if (isCompanyMode) {
    // Driver was assigned by a company dispatcher
    console.log("🏢 Company assignment detected — confirming...");
    await acceptCompanyAssignment({ userType });
  } else if (isIndividualMode) {
    // Driver was auto-matched with an individual shipper
    console.log("👤 Individual shipper match detected — accepting...");
    await acceptShipperRequest({ userType });
  } else {
    console.log("⏳ Driver has no pending assignment or match yet (status:", journeyStatus?.status, ")");
  }
// after driver accepted either assignment or won bid driver can start journey and finish journey easily.
   await startJourney({});
  await completeJourney({})
  
};

module.exports = {
  testDriverOnboardingFlow,
};
