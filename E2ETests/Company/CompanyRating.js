// CRUD for CompanyRating
// Shipper rates a transport company after completed freight job (1-5 stars)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/ratings";
const cache = { data: null };

const testGetCompanyRatings = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ CompanyRatings fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyRatings:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetCompanyAverageRating = async ({ user, companyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id =
      companyUniqueId ||
      usersData?.companyAdmin?.companies?.[0]?.companyUniqueId;
    if (!id) throw new Error("No companyUniqueId found for average rating");
    const result = await axios.get(
      `${backendURL}${BASE_URL}/average/${id}`,
      authConfig(token),
    );
    console.log(
      "✅ CompanyAverageRating fetched:",
      result.data.data?.averageRating ?? result.data.averageRating,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCompanyAverageRating:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCreateCompanyRating = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token;
    if (!token) throw new Error("token not found");
    // GET /api/company/bids returns batches with nested offers, so the accepted
    // bid lives at accepted_by_shipper[0].offers[0].companyBidRequestUniqueId.
    const acceptedBid =
      usersData?.companyAdmin?.bids?.accepted_by_shipper?.[0];
    const companyBidRequestUniqueId =
      payload?.companyBidRequestUniqueId ||
      acceptedBid?.offers?.[0]?.companyBidRequestUniqueId ||
      acceptedBid?.companyBidRequestUniqueId;
    if (!companyBidRequestUniqueId) {
      console.warn(
        "⏩ testCreateCompanyRating skipped — no companyBidRequestUniqueId (run company journey flow first)",
      );
      return { skipped: true };
    }
    const defaultPayload = {
      companyBidRequestUniqueId,
      rating: 5,
      comment: "E2E test — excellent service",
      ...payload,
    };
    const result = await axios.post(
      backendURL + BASE_URL,
      defaultPayload,
      authConfig(token),
    );
    console.log(
      "✅ CompanyRating created:",
      result.data.data?.companyRatingUniqueId ||
        result.data.companyRatingUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testCreateCompanyRating:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testUpdateCompanyRating = async ({
  user,
  companyRatingUniqueId,
  payload,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyRatingUniqueId || cache.data?.[0]?.companyRatingUniqueId;
    if (!id) throw new Error("No companyRatingUniqueId found to update");
    const defaultPayload = {
      rating: 4,
      comment: "Updated E2E rating comment",
      ...payload,
    };
    const result = await axios.put(
      `${backendURL}${BASE_URL}/${id}`,
      defaultPayload,
      authConfig(token),
    );
    console.log("✅ CompanyRating updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateCompanyRating:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteCompanyRating = async ({
  user,
  companyRatingUniqueId,
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyRatingUniqueId || cache.data?.[0]?.companyRatingUniqueId;
    if (!id) throw new Error("No companyRatingUniqueId found to delete");
    const result = await axios.delete(
      `${backendURL}${BASE_URL}/${id}`,
      authConfig(token),
    );
    console.log("✅ CompanyRating deleted:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testDeleteCompanyRating:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testCompanyRatingWorkflow = async ({ user = usersData.shipper } = {}) => {
  console.log("\n── CompanyRating Workflow ──");
  await testGetCompanyRatings({ user });
  const created = await testCreateCompanyRating({ user });
  if (created?.skipped) {
    console.log(
      "⏩ CompanyRating workflow skipped — missing companyBidRequestUniqueId",
    );
    return { skipped: true };
  }
  const companyRatingUniqueId =
    created?.data?.companyRatingUniqueId || created?.companyRatingUniqueId;
  if (!companyRatingUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }
  await testGetCompanyRatings({ user });
  if (usersData?.companyAdmin?.companies?.[0]?.companyUniqueId) {
    await testGetCompanyAverageRating({ user });
  }
  await testUpdateCompanyRating({
    user: usersData.admin,
    companyRatingUniqueId,
  });
  await testGetCompanyRatings({ user });
  await testDeleteCompanyRating({
    user: usersData.admin,
    companyRatingUniqueId,
  });
  await testGetCompanyRatings({ user });
  console.log("── CompanyRating Workflow complete ──\n");
  return { companyRatingUniqueId };
};

module.exports = {
  testCompanyRatingWorkflow,
  testGetCompanyRatings,
  testGetCompanyAverageRating,
  testCreateCompanyRating,
  testUpdateCompanyRating,
  testDeleteCompanyRating,
};
