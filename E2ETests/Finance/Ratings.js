// CRUD for Ratings
// Shippers rate drivers after journey completion.
// Ratings are created via markJourneyCompletionAsSeen (with rating field).
// This file tests GET and any direct CRUD operations.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/ratings";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetRatings = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Ratings fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetRatings:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
// NOTE: Ratings are normally created via markJourneyCompletionAsSeen.
// This direct POST is for testing purposes only.
// Requires the individual journey flow to have run first so that
// usersData.driver.lastJourneyDecisionUniqueId has been persisted.
const testCreateRating = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.shipper?.token;
    if (!token) throw new Error("token not found");

    // Prefer lastJourneyDecisionUniqueId (snapshotted before status cleared)
    const journeyDecisionUniqueId =
      payload?.journeyDecisionUniqueId ||
      usersData?.driver?.lastJourneyDecisionUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

    if (!journeyDecisionUniqueId) {
      console.warn("⏩ testCreateRating skipped — no journeyDecisionUniqueId available (run full journey flow first)");
      return { skipped: true };
    }

    const ratedUserUniqueId =
      payload?.ratedUserUniqueId ||
      usersData?.driver?.accountData?.userData?.userUniqueId ||
      usersData?.driver?.accountData?.driver?.userUniqueId;

    if (!ratedUserUniqueId) {
      console.warn("⏩ testCreateRating skipped — no ratedUserUniqueId available");
      return { skipped: true };
    }

    const defaultPayload = {
      journeyDecisionUniqueId,
      ratedUserUniqueId,
      ratingValue: 5,
      comment: "E2E test rating — excellent service",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    // API may return the ID at different nesting levels
    const id =
      result.data?.data?.ratingUniqueId ||
      result.data?.ratingUniqueId ||
      result.data?.data?.ratingId ||
      result.data?.ratingId ||
      result.data?.data?.id ||
      result.data?.id;
    console.log("✅ Rating created:", id ?? "(no id in response)");
    return result.data;
  } catch (error) {
    console.error("❌ testCreateRating:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateRating = async ({ user, id, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const ratingId = id || cache.data?.[0]?.id || cache.data?.[0]?.ratingUniqueId;
    if (!ratingId) throw new Error("No rating ID found to update");
    const defaultPayload = { comment: "Updated E2E test rating comment", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${ratingId}`, defaultPayload, authConfig(token));
    console.log("✅ Rating updated:", ratingId);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateRating:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteRating = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const ratingId = id || cache.data?.[0]?.id || cache.data?.[0]?.ratingUniqueId;
    if (!ratingId) throw new Error("No rating ID found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${ratingId}`, authConfig(token));
    console.log("✅ Rating deleted:", ratingId);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteRating:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testRatingsWorkflow = async ({ user = usersData.shipper } = {}) => {
  console.log("\n── Ratings Workflow ──");

  // GET all ratings
  await testGetRatings({ user });

  // Filter by driver if available
  if (usersData?.driver?.accountData?.userData?.userUniqueId) {
    await testGetRatings({
      user,
      filters: { ratedUserUniqueId: usersData.driver.accountData.userData.userUniqueId },
    });
  }

  // CREATE requires completed journey — skip gracefully if not available
  const created = await testCreateRating({ user });
  if (created?.skipped) {
    console.log("⏩ Skipped — run full journey flow first to enable rating creation");
    console.log("── Ratings Workflow skipped ──\n");
    return { skipped: true };
  }

  // Extract the created rating ID from all possible response shapes
  const ratingId =
    created?.data?.ratingUniqueId ||
    created?.ratingUniqueId ||
    created?.data?.ratingId ||
    created?.ratingId ||
    created?.data?.id ||
    created?.id ||
    cache.data?.[0]?.ratingUniqueId ||
    cache.data?.[0]?.ratingId ||
    cache.data?.[0]?.id;

  if (ratingId) {
    await testGetRatings({ user });
    await testUpdateRating({ user, id: ratingId });
    await testGetRatings({ user });
    await testDeleteRating({ user, id: ratingId });
    await testGetRatings({ user });
  } else {
    console.warn("⚠️  Rating created but ID not extractable — skipping UPDATE/DELETE");
  }

  console.log("── Ratings Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testRatingsWorkflow,
  testGetRatings,
  testCreateRating,
  testUpdateRating,
  testDeleteRating,
};
