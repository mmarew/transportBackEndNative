const { testAuthWorkFlow } = require("../Auth");
const {
  initiateCompanyProfileSetupWorkFlow,
} = require("./CompanyProfileManagement");
const { testCompanyDelinquencyWorkflow } = require("./CompanyDelinquency");
const { testCompanyAdminDecisionWorkflow } = require("./CompanyAdminDecision");
const { testCompanyBanWorkflow } = require("./CompanyBan");

const createCompanyAdminFlow = async ({ userType = "companyAdmin" }) => {
  console.log("\n✅ ========== CREATE COMPANY ADMIN FLOW STARTED ==========\n");
  try {
    await testAuthWorkFlow({ userType });
    await initiateCompanyProfileSetupWorkFlow({ userType });
    // Note: bidding workflow is NOT called here — it needs an active shipper
    // company_target request to exist first. Call it separately in index.js
    // after testShipperOnboardingFlow({ requestMode: "company_target" }).
    console.log(
      "\n✅ ========== CREATE COMPANY ADMIN FLOW COMPLETED SUCCESSFULLY ==========\n",
    );
  } catch (error) {
    console.error(
      "CompanyWorkflowError: Failed to create correct company workflows.",
      error?.response?.data?.error || error?.message || error,
    );
    throw error;
  }
};

const {
  testCompanyMembershipWorkflow,
  testGetCompanyMemberships,
} = require("./CompanyMembership");
const {
  testCompanyRoleWorkflow,
  testGetCompanyRoles,
} = require("./CompanyRole");
const {
  testCompanyRatingWorkflow,
  testGetCompanyRatings,
} = require("./CompanyRating");
const { testGetCompanyAssignments } = require("./DriversAssignment");
const { testGetCompanyBids } = require("./BidManagement");

const {
  testGetCompanyProfileHistory,
  runCompanySupplementaryTests,
} = require("./CompanySupplementary");

module.exports = {
  createCompanyAdminFlow,
  testCompanyDelinquencyWorkflow,
  testCompanyAdminDecisionWorkflow,
  testCompanyBanWorkflow,
  testCompanyMembershipWorkflow,
  testGetCompanyMemberships,
  testCompanyRoleWorkflow,
  testGetCompanyRoles,
  testCompanyRatingWorkflow,
  testGetCompanyRatings,
  testGetCompanyAssignments,
  testGetCompanyBids,
  testGetCompanyProfileHistory,
  runCompanySupplementaryTests,
};
