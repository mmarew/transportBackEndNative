const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const {
  COMPANY_BID_ENDPOINTS,
} = require("../../Routes/EndPoints/companyBid.endpoints");
const { authConfig } = require("../Utils");

const logCompanyError = (message, error) => {
  console.error(
    `CompanyFlowError: ${message}`,
    error?.response?.data?.error || error?.message || error,
  );
};

const getBids = async ({
  userType = "companyAdmin",
  bidStatus = "submitted",
}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("Company getBids failed, no token found.");
    return null;
  }
  const company = usersData?.[userType]?.companies?.[0];
  if (!company) {
    logCompanyError("No company found to get bids for.");
    return null;
  }
  const baseUrl =
    backendURL +
    COMPANY_BID_ENDPOINTS.GET_BIDS +
    `?companyUniqueId=${company.companyUniqueId}&bidStatus=${bidStatus}`;
  const resultsOfBids = await axios.get(baseUrl, {
    ...authConfig(token),
  });
  // console.log("🚀 ~ getBids ~ resultsOfBids:", resultsOfBids?.data);
  //set bid data to usersData companyAdmin bid bid status
  usersData.companyAdmin.bids[bidStatus] = resultsOfBids?.data?.data;
};
const getAvailableBids = async ({
  userType = "companyAdmin",
}) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("Company admin token missing for available bids.");
    return null;
  }
  const company = usersData?.[userType]?.companies?.[0];
  if (!company) {
    logCompanyError("Company record missing for available bids.");
    return null;
  }
  const url =
    backendURL +
    COMPANY_BID_ENDPOINTS.GET_BIDS +
    `?target=available&companyUniqueId=${company.companyUniqueId}`;
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.get(url, config);
    if (usersData[userType]) usersData[userType].availableBids = res.data.data;
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to fetch available bids.", error);
    return null;
  }
};
const participateInBid = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("Company admin token missing for bid participation.");
    return null;
  }
  const bid = usersData?.[userType]?.availableBids?.[0];
  if (!bid) {
    logCompanyError("No available bid found for participation.");
    return null;
  }
  const url = backendURL + COMPANY_BID_ENDPOINTS.CREATE_BID;
  const payload = {
    shipperRequestBatchId: bid.shipperRequestBatchId,
    companyUniqueId: usersData?.[userType]?.companies?.[0]?.companyUniqueId,
    proposedCostPerVehicle: "90000",
  };
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.post(url, payload, config);
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to participate in bid.", error);
    return null;
  }
};

const acceptCompanyOffer = async ({ userType = "shipper", bid }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyError("Shipper token missing for accepting company offer.");
    return null;
  }
  if (!bid) {
    logCompanyError("No company bid passed to accept.");
    return null;
  }

  const url =
    backendURL +
    COMPANY_BID_ENDPOINTS.UPDATE_BID_STATUS.replace(
      ":companyBidRequestUniqueId",
      bid.companyBidRequestUniqueId,
    );
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.patch(
      url,
      { bidStatus: "accepted_by_shipper" },
      config,
    );
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to accept company offer.", error);
    return null;
  }
};
const bidStatus = {
  SUBMITTED: "submitted",
  ACCEPTED_BY_SHIPPER: "accepted_by_shipper",
  REJECTED_BY_SHIPPER: "rejected_by_shipper",
  CANCELLED_BY_COMPANY: "cancelled_by_company",
  EXPIRED: "expired",
};

const initiateCompanyBiddingWorkFlow = async ({
  userType = "companyAdmin",
}) => {
  try {
    // get available bids to participate in
    const availableBids = await getAvailableBids({ userType });
    if (!availableBids || availableBids.length === 0) {
      logCompanyError("No available bids found for company participation.");
      return null;
    }

    const bidResult = await participateInBid({ userType });
    if (!bidResult) {
      logCompanyError("Company bid participation failed.");
      return null;
    }

    // fetch submitted bids to be accepted by shipper
    await getBids({ userType, bidStatus: bidStatus.SUBMITTED });
    const bids = usersData.companyAdmin.bids;
    const submittedBids = bids?.[bidStatus.SUBMITTED];
    const firstSubmittedBid = submittedBids?.[0];
    const bidToAccept = firstSubmittedBid?.offers?.[0] || firstSubmittedBid;

    if (!bidToAccept) {
      logCompanyError("No submitted company bid found to accept.");
      return null;
    }

    return bidToAccept;
  } catch (error) {
    logCompanyError("Company bidding workflow failed.", error);
    return null;
  }
};
const updateBidStatus = async ({
  userType = "companyAdmin",
  companyBidRequestUniqueId,
  bidStatus = "cancelled_by_company",
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logCompanyError("No token for bid status update"); return null; }
  if (!companyBidRequestUniqueId) { logCompanyError("No companyBidRequestUniqueId"); return null; }

  const url = backendURL + COMPANY_BID_ENDPOINTS.UPDATE_BID_STATUS.replace(
    ":companyBidRequestUniqueId", companyBidRequestUniqueId,
  );

  try {
    const res = await axios.patch(url, { bidStatus }, authConfig(token));
    console.log(`✅ Bid status updated to ${bidStatus}`);
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to update bid status", error);
    return null;
  }
};

const deleteBid = async ({
  userType = "companyAdmin",
  companyBidRequestUniqueId,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logCompanyError("No token for bid deletion"); return null; }
  if (!companyBidRequestUniqueId) { logCompanyError("No companyBidRequestUniqueId"); return null; }

  const url = backendURL + COMPANY_BID_ENDPOINTS.DELETE_BID.replace(
    ":companyBidRequestUniqueId", companyBidRequestUniqueId,
  );

  try {
    const res = await axios.delete(url, authConfig(token));
    console.log("✅ Bid deleted");
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to delete bid", error);
    return null;
  }
};

const markBidAsSeen = async ({
  userType = "companyAdmin",
  companyBidRequestUniqueId,
} = {}) => {
  const token = usersData?.[userType]?.token;
  if (!token) { logCompanyError("No token for markAsSeen"); return null; }
  if (!companyBidRequestUniqueId) { logCompanyError("No companyBidRequestUniqueId"); return null; }

  const url = backendURL + COMPANY_BID_ENDPOINTS.MARK_AS_SEEN.replace(
    ":companyBidRequestUniqueId", companyBidRequestUniqueId,
  );

  try {
    const res = await axios.patch(url, {}, authConfig(token));
    console.log("✅ Bid marked as seen");
    return res.data.data;
  } catch (error) {
    logCompanyError("Failed to mark bid as seen", error);
    return null;
  }
};

const testBidCRUDWorkflow = async ({ userType = "companyAdmin" } = {}) => {
  console.log("\n── Bid CRUD Workflow ──");
  const bid = usersData?.[userType]?.bids?.submitted?.[0]?.offers?.[0]
    || usersData?.[userType]?.bids?.submitted?.[0];
  if (!bid?.companyBidRequestUniqueId) {
    console.log("⚠ No submitted bid available for CRUD tests");
    return;
  }
  const { companyBidRequestUniqueId } = bid;
  await updateBidStatus({ userType, companyBidRequestUniqueId, bidStatus: "cancelled_by_company" });
  await markBidAsSeen({ userType, companyBidRequestUniqueId });
  await getBids({ userType, bidStatus: "cancelled_by_company" });
  await deleteBid({ userType, companyBidRequestUniqueId });
  console.log("── Bid CRUD Workflow complete ──\n");
};

const testGetCompanyBids = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) {
    console.log("⏩ GET /api/company/bids: no company admin token");
    return;
  }
  console.log("\n── GET /api/company/bids ──");
  try {
    const res = await axios.get(
      backendURL + "/api/company/bids",
      authConfig(token),
    );
    console.log(`✅ GET /api/company/bids — ${res.data?.message || "ok"}`);
  } catch (error) {
    console.error("❌ GET /api/company/bids:", error.response?.data?.error || error.message);
  }
};

module.exports = {
  getBids,
  getAvailableBids,
  participateInBid,
  acceptCompanyOffer,
  initiateCompanyBiddingWorkFlow,
  updateBidStatus,
  deleteBid,
  markBidAsSeen,
  testBidCRUDWorkflow,
  testGetCompanyBids,
};
