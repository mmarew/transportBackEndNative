// CRUD for user delinquency responses
// Driver submits a dispute response to an existing delinquency

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { testCreateDelinquency, testGetDelinquency } = require("./Delinquency");

const BASE_URL = "/api/user/delinquencyResponse";
const responses = { data: null };

// ── GET responses ─────────────────────────────────────────────────────────────
const testGetDelinquencyResponses = async ({ user, userDelinquencyUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const query = userDelinquencyUniqueId
      ? `?userDelinquencyUniqueId=${userDelinquencyUniqueId}`
      : "";
    const result = await axios.get(backendURL + BASE_URL + "/response" + query, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency responses fetched:", result.data.data?.length ?? 0);
    responses.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetDelinquencyResponses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE response ───────────────────────────────────────────────────────────
const testCreateDelinquencyResponse = async ({ user, userDelinquencyUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    if (!userDelinquencyUniqueId) throw new Error("userDelinquencyUniqueId is required");

    const payload = {
      userDelinquencyUniqueId,
      userDelinquencyResponse:
        "I respectfully dispute this delinquency. The described behavior was due to an exceptional circumstance beyond my control.",
    };

    const result = await axios.post(backendURL + BASE_URL + "/response", payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency response created:", result.data.userDelinquencyResponseUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDelinquencyResponse:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE response ───────────────────────────────────────────────────────────
const testUpdateDelinquencyResponse = async ({ user, userDelinquencyResponseUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const id = userDelinquencyResponseUniqueId || responses.data?.[0]?.userDelinquencyResponseUniqueId;
    if (!id) throw new Error("No response ID found to update");

    const payload = {
      userDelinquencyResponse:
        "Updated dispute: I have additional evidence supporting my case. This delinquency is unwarranted.",
    };

    const result = await axios.put(backendURL + BASE_URL + "/" + id, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency response updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateDelinquencyResponse:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE response ───────────────────────────────────────────────────────────
const testDeleteDelinquencyResponse = async ({ user, userDelinquencyResponseUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const id = userDelinquencyResponseUniqueId || responses.data?.[0]?.userDelinquencyResponseUniqueId;
    if (!id) throw new Error("No response ID found to delete");

    const result = await axios.delete(backendURL + BASE_URL + "/" + id, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency response deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteDelinquencyResponse:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testDelinquencyResponseWorkflow = async ({
  user = usersData.driver,
}) => {
  console.log("\n── Delinquency Response Workflow ──");

  // Create fresh delinquency for this test (previous ones may be deleted or decided)
  await testCreateDelinquency({ user: usersData.admin, delinquencyTypeIndex: 0 });
  const delinquencyResult = await testGetDelinquency({ user: usersData.admin });
  
  // Use the most recent non-decided delinquency
  const userDelinquencyUniqueId = delinquencyResult?.data?.[0]?.userDelinquencyUniqueId;
  if (!userDelinquencyUniqueId) {
    throw new Error("No delinquency found after create");
  }
  console.log("✅ Using delinquency:", userDelinquencyUniqueId);

  // GET (empty initially)
  await testGetDelinquencyResponses({ user, userDelinquencyUniqueId });

  // CREATE
  const created = await testCreateDelinquencyResponse({ user, userDelinquencyUniqueId });
  const responseUniqueId = created?.userDelinquencyResponseUniqueId;
  if (!responseUniqueId) {
    throw new Error("Failed to get responseUniqueId after create");
  }

  // UPDATE
  await testUpdateDelinquencyResponse({ user, userDelinquencyResponseUniqueId: responseUniqueId });

  // GET (after update)
  await testGetDelinquencyResponses({ user, userDelinquencyUniqueId });

  // DELETE
  await testDeleteDelinquencyResponse({ user, userDelinquencyResponseUniqueId: responseUniqueId });

  // GET (after delete — should be empty or show soft-deleted)
  await testGetDelinquencyResponses({ user, userDelinquencyUniqueId });

  console.log("── Delinquency Response Workflow complete ──\n");
  return { responseUniqueId };
};

module.exports = {
  testDelinquencyResponseWorkflow,
  testGetDelinquencyResponses,
  testCreateDelinquencyResponse,
  testUpdateDelinquencyResponse,
  testDeleteDelinquencyResponse,
};
