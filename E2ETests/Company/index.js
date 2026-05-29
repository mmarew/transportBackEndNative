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
} = require("./CompanyManagement");

// TODO: implement assignDriversToBid when the endpoint is ready

const createCompanyAdminFlow = async ({ userType = "companyAdmin" }) => {
  try {
    //set admin token to make approval
    await testVerifyUserByOTP({ userType: "admin" });
    //create user company admin
    await testCreateUser({ userType });
    //verify user company admin
    await testVerifyUserByOTP({ userType });
    //login user company admin
    // await testLoginUser({ userType });
    await getCompanies({ userType });
    //attach company documents//create companies
    await createCompanies({ userType });
    // //get companies
    // await getCompanies({ userType });
    // //attach company documents
    // await attachCompanyDocuments({ userType });
    // //approve company documents by system admin not by company admin
    // await approveCompanyDocuments({ userType: "admin" });
    // //approve company status by system admin not by company admin
    // await approveCompanyStatus({ userType: "admin" });
    // //get available bids
    // await getAvailableBids({ userType });
    // //participate in bid
    // await participateInBid({ userType });
    // //accept company offer
    // await acceptCompanyOffer({ userType: "shipper" });
  } catch (error) {
    console.log("❌ Failed to create driver request.");
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
