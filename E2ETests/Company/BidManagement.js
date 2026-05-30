const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testShipperOnboardingFlow } = require("../Shipper/Index");

const getAvailableBids = async ({ userType = "companyAdmin" }) => {
  //   {{url}}/api/company/bids?target=available&companyUniqueId=40dc4875-02e3-4b96-970b-916e2076656e;
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Company getAvailableBids failed, no token found.");
    return;
  }
  const company = usersData?.[userType]?.companies?.[0];
  if (!company) {
    console.log("❌ No company found to get available bids for.");
    return;
  }
  const url =
    backendURL +
    `/api/company/bids?target=available&companyUniqueId=${company.companyUniqueId}`;
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.get(url, config);
    console.log(
      "✅ Success! Available bids fetched. res.data.data",
      res.data.data,
    );
    if (usersData[userType]) usersData[userType].availableBids = res.data.data;
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to get available bids.");
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
const participateInBid = async ({ userType = "companyAdmin" }) => {
  // post   {{url}}/api/company/bids
  //   const payload = {
  //     shipperRequestBatchId: "ef5bc758-b85f-4de6-a750-855c79643723",
  //     companyUniqueId: "40dc4875-02e3-4b96-970b-916e2076656e",
  //     proposedCostPerVehicle: "90000",
  //   };
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Company Admin login failed, no token found.");
    return;
  }
  const bid = usersData?.[userType]?.availableBids?.[0];
  if (!bid) {
    console.log("❌ No bid found to participate in.");
    return;
  }
  const url = backendURL + `/api/company/bids`;
  const payload = {
    shipperRequestBatchId: bid.shipperRequestBatchId,
    companyUniqueId: usersData?.[userType]?.companies?.[0]?.companyUniqueId,
    proposedCostPerVehicle: "90000",
  };
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.post(url, payload, config);
    console.log("✅ Success! Bid participated.");
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to participate in bid.");
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

const acceptCompanyOffer = async ({ userType = "shipper" }) => {
  // patch {{url}}/api/company/bids/:companyBidRequestUniqueId/status
  let token = usersData?.[userType]?.token;
  if (!token) {
    await testShipperOnboardingFlow({ userType: "shipper" });
    // await testVerifyUserByOTP({ userType: "shipper" });
  }
  token = usersData?.[userType]?.token;
  const bid = usersData?.["companyAdmin"]?.availableBids?.[0];
  //   const bid = usersData?.[userType]?.bids?.[0];
  if (!bid) {
    console.log("❌ No bid found to accept.");
    return;
  }

  const url =
    backendURL + `/api/company/bids/${bid.companyBidRequestUniqueId}/status`;
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.patch(url, { status: "accepted" }, config);
    console.log("✅ Success! Company offer accepted.");
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to accept company offer.");
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
const initiateCompanyBiddingWorkFlow = async ({
  userType = "companyAdmin",
}) => {
  try {
    //get available bids
    await getAvailableBids({ userType });
    //participate in bid
    await participateInBid({ userType });
    //accept company offer
    await acceptCompanyOffer({ userType: "shipper" });
  } catch (error) {
    console.log("❌ Error initiating company bidding workflow.");
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
module.exports = {
  getAvailableBids,
  participateInBid,
  acceptCompanyOffer,
  initiateCompanyBiddingWorkFlow,
};
