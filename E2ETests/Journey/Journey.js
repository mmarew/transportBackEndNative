const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { JOURNEY_ENDPOINTS } = require("../constants/endpoints"); // adjust path
const { testVerifyAndLoginUser } = require("./auth/index"); // adjust path

// Helper: replace URL parameters
function replaceUrlParams(url, params) {
  let result = url;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

// ------------------------------------------------------------------
// Journey CRUD Helpers
// ------------------------------------------------------------------

// Create a new journey (requires a valid journeyDecisionUniqueId)
async function createJourney({ user, journeyDecisionUniqueId }) {
  const payload = { journeyDecisionUniqueId };
  const res = await axios.post(
    backendURL + JOURNEY_ENDPOINTS.CREATE_JOURNEY,
    payload,
    {
      headers: { Authorization: `Bearer ${user.token}` },
    },
  );
  console.log(`✅ Journey created: ${res.data.journeyUniqueId}`);
  return res.data;
}

// Get journey by ID
async function getJourneyById({ user, journeyUniqueId }) {
  const url = replaceUrlParams(JOURNEY_ENDPOINTS.GET_JOURNEY_BY_ID, {
    journeyUniqueId,
  });
  const res = await axios.get(backendURL + url, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  console.log(`✅ Journey fetched: ${res.data.journeyUniqueId}`);
  return res.data;
}

// Update journey
async function updateJourney({ user, journeyUniqueId, updateData }) {
  const url = replaceUrlParams(JOURNEY_ENDPOINTS.UPDATE_JOURNEY, {
    journeyUniqueId,
  });
  const res = await axios.put(backendURL + url, updateData, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  console.log(`✅ Journey updated: ${journeyUniqueId}`);
  return res.data;
}

// Delete journey (soft delete)
async function deleteJourney({ user, journeyUniqueId }) {
  const url = replaceUrlParams(JOURNEY_ENDPOINTS.DELETE_JOURNEY, {
    journeyUniqueId,
  });
  const res = await axios.delete(backendURL + url, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  console.log(`✅ Journey deleted: ${journeyUniqueId}`);
  return res.data;
}

// Get journeys with filters & pagination
async function getJourneys({ user, queryParams = {} }) {
  const res = await axios.get(backendURL + JOURNEY_ENDPOINTS.GET_JOURNEYS, {
    headers: { Authorization: `Bearer ${user.token}` },
    params: queryParams,
  });
  console.log(`📋 Found ${res.data.data?.length || 0} journeys`);
  return res.data;
}

// Get completed journey counts by date
async function getCompletedJourneyCounts({
  user,
  fromDate,
  toDate,
  ownerUserUniqueId = null,
  roleId = null,
}) {
  const params = { fromDate, toDate };
  if (ownerUserUniqueId) params.ownerUserUniqueId = ownerUserUniqueId;
  if (roleId) params.roleId = roleId;
  const res = await axios.get(
    backendURL + JOURNEY_ENDPOINTS.GET_COMPLETED_JOURNEY_COUNTS_BY_DATE,
    {
      headers: { Authorization: `Bearer ${user.token}` },
      params,
    },
  );
  console.log(`📊 Completed journey counts:`, res.data);
  return res.data;
}

// Search completed journeys by user phone/email
async function searchCompletedJourneyByUserData({
  user,
  phoneOrEmail,
  roleId = null,
  page = 1,
  limit = 10,
}) {
  const params = { phoneOrEmail, page, limit };
  if (roleId) params.roleId = roleId;
  const res = await axios.get(
    backendURL + JOURNEY_ENDPOINTS.SEARCH_COMPLETED_JOURNEY_BY_USER_DATA,
    {
      headers: { Authorization: `Bearer ${user.token}` },
      params,
    },
  );
  console.log(
    `🔍 Found ${res.data.data?.length || 0} journeys for ${phoneOrEmail}`,
  );
  return res.data;
}

// Get all completed journeys (optionally filtered by role)
async function getAllCompletedJourney({
  user,
  roleId = null,
  page = 1,
  limit = 10,
}) {
  const params = { page, limit };
  if (roleId) params.roleId = roleId;
  const res = await axios.get(
    backendURL + JOURNEY_ENDPOINTS.GET_ALL_COMPLETED_JOURNEY,
    {
      headers: { Authorization: `Bearer ${user.token}` },
      params,
    },
  );
  console.log(`🏁 Found ${res.data.data?.length || 0} completed journeys`);
  return res.data;
}

// Get ongoing journeys
async function getOngoingJourney({
  user,
  ownerUserUniqueId = null,
  roleId = null,
  page = 1,
  limit = 10,
}) {
  const params = { page, limit };
  if (ownerUserUniqueId) params.ownerUserUniqueId = ownerUserUniqueId;
  if (roleId) params.roleId = roleId;
  const res = await axios.get(
    backendURL + JOURNEY_ENDPOINTS.GET_ONGOING_JOURNEY,
    {
      headers: { Authorization: `Bearer ${user.token}` },
      params,
    },
  );
  console.log(`🚀 Found ${res.data.data?.length || 0} ongoing journeys`);
  return res.data;
}

// ------------------------------------------------------------------
// Main Workflow
// ------------------------------------------------------------------
async function runJourneyWorkflow() {
  console.log("\n========== START: JOURNEY CRUD WORKFLOW ==========\n");

  // 1. Ensure admin user is logged in (or driver – adjust based on permissions)
  await testVerifyAndLoginUser({ userType: "admin" });
  const admin = usersData.admin;

  // 2. You must have a valid journeyDecisionUniqueId from your system.
  //    Replace this with a real UUID from your JourneyDecisions table.
  //    For testing, you can create one via the bid acceptance flow or by manual DB insert.
  const JOURNEY_DECISION_UUID =
    process.env.TEST_JOURNEY_DECISION_UUID ||
    "existing-journey-decision-uuid-here";
  if (JOURNEY_DECISION_UUID === "existing-journey-decision-uuid-here") {
    throw new Error(
      "Please provide a valid journeyDecisionUniqueId (set TEST_JOURNEY_DECISION_UUID env var or edit script)",
    );
  }

  // 3. Create a journey
  console.log("\n📝 Creating new journey...");
  const created = await createJourney({
    user: admin,
    journeyDecisionUniqueId: JOURNEY_DECISION_UUID,
  });
  const journeyId = created.journeyUniqueId;

  // 4. Get journey by ID
  console.log("\n🔍 Fetching journey by ID...");
  await getJourneyById({ user: admin, journeyUniqueId: journeyId });

  // 5. Update journey (e.g., set fare and end time)
  console.log("\n✏️ Updating journey...");
  const updatePayload = {
    fare: 2500.5,
    endTime: new Date().toISOString(),
    journeyStatusId: 4, // assuming 4 = "completed"
  };
  await updateJourney({
    user: admin,
    journeyUniqueId: journeyId,
    updateData: updatePayload,
  });

  // 6. Get journeys with filters
  console.log("\n📋 Getting all journeys with pagination...");
  await getJourneys({
    user: admin,
    queryParams: { page: 1, limit: 5, journeyStatusId: 4 },
  });

  // 7. Get completed journey counts (last 30 days)
  console.log("\n📊 Fetching completed journey counts...");
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 30);
  await getCompletedJourneyCounts({
    user: admin,
    fromDate: fromDate.toISOString().split("T")[0],
    toDate: toDate.toISOString().split("T")[0],
  });

  // 8. Search completed journeys by driver email (example: using driver from usersData)
  if (usersData.driver && usersData.driver.email) {
    console.log("\n🔎 Searching completed journeys by driver email...");
    await searchCompletedJourneyByUserData({
      user: admin,
      phoneOrEmail: usersData.driver.email,
      roleId: usersData.driver.roleId,
    });
  }

  // 9. Get all completed journeys for driver role
  if (usersData.driver && usersData.driver.roleId) {
    console.log("\n🏁 Fetching all completed journeys for driver...");
    await getAllCompletedJourney({
      user: admin,
      roleId: usersData.driver.roleId,
    });
  }

  // 10. Get ongoing journeys
  console.log("\n🚀 Fetching ongoing journeys...");
  await getOngoingJourney({ user: admin, ownerUserUniqueId: "self" });

  // 11. Delete the journey (soft delete)
  console.log("\n🗑️ Deleting journey...");
  await deleteJourney({ user: admin, journeyUniqueId: journeyId });

  // 12. Verify deletion: try to fetch it (should return 404 or empty)
  console.log("\n✅ Verifying deletion...");
  try {
    await getJourneyById({ user: admin, journeyUniqueId: journeyId });
  } catch (err) {
    if (err.response?.status === 404) {
      console.log("   Journey no longer exists (soft-deleted) – OK");
    } else {
      throw err;
    }
  }

  console.log(
    "\n========== JOURNEY WORKFLOW COMPLETED SUCCESSFULLY ==========\n",
  );
}

// Run the workflow
runJourneyWorkflow().catch((error) => {
  console.error(
    "❌ Journey workflow failed:",
    error.response?.data?.error || error.message,
  );
  process.exit(1);
});
