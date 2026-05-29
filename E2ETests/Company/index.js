const axios = require("axios");
const { backendURL } = require("../constants");
const { usersData } = require("../constants");
const { testCreateUser } = require("../Auth/RegisterUser");
const { testLoginUser } = require("../Auth/LoginUser");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
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

// TODO: implement assignDriversToBid when the endpoint is ready

const createCompanyAdminFlow = async ({ userType = "companyAdmin" }) => {
  try {
    //set admin token to make approval
    await testVerifyUserByOTP({ userType: "admin" });
    //create user company admin
    await testCreateUser({ userType });
    //verify user company admin
    await testVerifyUserByOTP({ userType });
    //setup companies profile
    await initiateCompanyProfileSetupWorkFlow({ userType });
    //set up bids
    await initiateCompanyBiddingWorkFlow({ userType });
  } catch (error) {
    console.log("❌ Failed to create correct company workflows.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
  }
};
if (require.main === module) {
  createCompanyAdminFlow({});
}
module.exports = { createCompanyAdminFlow };
