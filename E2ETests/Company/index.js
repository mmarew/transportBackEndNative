const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { testAuthWorkFlow } = require("../Auth");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const {
  approveCompanyDocuments,
  createCompanies,
  getCompanies,
  attachCompanyDocuments,
  getAttachableDocuments,
  approveCompanyStatus,
  getAttachedDocumentsOfCompanies,
  initiateCompanyProfileSetupWorkFlow,
} = require("./CompanyProfileManagement");
const { initiateCompanyBiddingWorkFlow } = require("./BidManagement");
const { testCompanyDelinquencyWorkflow } = require("./CompanyDelinquency");
const { testCompanyAdminDecisionWorkflow } = require("./CompanyAdminDecision");
const { testCompanyBanWorkflow } = require("./CompanyBan");

const createCompanyAdminFlow = async ({ userType = "companyAdmin" }) => {
  console.log("\n✅ ========== CREATE COMPANY ADMIN FLOW STARTED ==========\n");
  try {
    await testAuthWorkFlow({ userType });
    await initiateCompanyProfileSetupWorkFlow({ userType });
    await initiateCompanyBiddingWorkFlow({ userType });
    console.log(
      "\n✅ ========== CREATE COMPANY ADMIN FLOW COMPLETED SUCCESSFULLY ==========\n",
    );
  } catch (error) {
    console.error(
      "CompanyWorkflowError: Failed to create correct company workflows.",
      error?.response?.data?.error || error?.message || error,
    );
  }
};

module.exports = {
  createCompanyAdminFlow,
  testCompanyDelinquencyWorkflow,
  testCompanyAdminDecisionWorkflow,
  testCompanyBanWorkflow,
};
