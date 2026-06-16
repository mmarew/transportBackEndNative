const { testShipperOnboardingFlow } = require("../Shipper/Index");
const { createCompanyAdminFlow } = require("../Company");
const {
  initiateCompanyBiddingWorkFlow,
  acceptCompanyOffer,
  getBids,
} = require("../Company/BidManagement");
const { assignVehicleToCompany } = require("../Company/CompanyVehicle");
const { assignDrivers } = require("../Company/AssignDrivers");
const {
  getDriverJourneyStatus,
  acceptCompanyAssignment,
  startJourney,
  completeJourney,
} = require("../Driver/DriverJourneyStatus");
const { usersData } = require("../constants");

const runCompanyFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🏢 STARTING COMPANY TARGET FLOW");
  console.log("=======================================================\n");

  await testShipperOnboardingFlow({
    userType: "shipper",
    requestMode: "company_target",
  });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  await createCompanyAdminFlow({});

  const bidToAccept = await initiateCompanyBiddingWorkFlow({
    userType: "companyAdmin",
  });
  if (!bidToAccept)
    throw new Error("Company failed to find or participate in a bid.");

  await acceptCompanyOffer({ userType: "shipper", bid: bidToAccept });

  await getBids({ userType: "companyAdmin", bidStatus: "accepted_by_shipper" });
  const acceptedBid = usersData.companyAdmin.bids["accepted_by_shipper"]?.[0];
  if (!acceptedBid)
    throw new Error("No accepted company bid found to assign drivers.");

  await assignVehicleToCompany({});
  await assignDrivers({ bid: acceptedBid });

  await getDriverJourneyStatus({ userType: "driver" });
  await acceptCompanyAssignment({ userType: "driver" });

  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  if (driverStatus?.status === 4) {
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status === 5) {
    const jdId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (jdId) usersData.driver.lastJourneyDecisionUniqueId = jdId;

    const jId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyUniqueId;
    if (jId) usersData.driver.lastJourneyUniqueId = jId;

    const srId =
      usersData.driver.journeyStatus?.uniqueIds?.shipperRequestUniqueId;
    if (srId) usersData.driver.lastShipperRequestUniqueId = srId;

    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ COMPANY TARGET FLOW COMPLETED\n");
};

module.exports = { runCompanyFlow };
