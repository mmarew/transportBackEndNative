// CRUD for user delinquency responses
// Driver submits a dispute response to an existing delinquency

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { testCreateDelinquency } = require("./Delinquency");

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

// ── GET pending delinquencies (driver view) ──────────────────────────────────
const testGetPendingDelinquencies = async ({
  user = usersData.driver,
  expectedDelinquencyUniqueId,
} = {}) => {
  const token = user?.token;
  if (!token) throw new Error("token not found");

  const userUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId;
  const roleId = usersData?.driver?.roleId || 2;
  if (!userUniqueId) {
    throw new Error("driver userUniqueId not available in accountData");
  }

  const url = `${backendURL}/api/user/delinquencyResponse/pending?userUniqueId=${encodeURIComponent(userUniqueId)}&roleId=${roleId}`;
  const result = await axios.get(url, {
    headers: { Authorization: "Bearer " + token },
  });

  const rows = result.data?.data || [];
  if (expectedDelinquencyUniqueId) {
    const found = rows.some(
      (r) => r.userDelinquencyUniqueId === expectedDelinquencyUniqueId,
    );
    if (!found) {
      throw new Error(
        `Pending delinquency list missing expected delinquency ${expectedDelinquencyUniqueId}`,
      );
    }
    console.log(
      "✅ Pending delinquency visible to driver:",
      expectedDelinquencyUniqueId,
    );
  } else {
    console.log("✅ Pending delinquencies fetched:", rows.length);
  }
  return result.data;
};

// ── Full workflow ─────────────────────────────────────────────────────────────
// Lifecycle mode: pass userDelinquencyUniqueId + preserveResponse=true to reuse
// an existing delinquency and KEEP the response (so the admin can rule on it).
// Standalone CRUD mode: no delinquency provided → create a fresh one, exercise
// update/delete, and leave nothing behind.
const testDelinquencyResponseWorkflow = async ({
  user = usersData.driver,
  userDelinquencyUniqueId,
  preserveResponse = false,
} = {}) => {
  console.log("\n── Delinquency Response Workflow ──");

  // Reuse an existing delinquency (lifecycle) OR create a fresh one (CRUD)
  let delinquencyId = userDelinquencyUniqueId;
  if (!delinquencyId) {
    console.log("📝 Creating fresh delinquency for response workflow");
    const createResult = await testCreateDelinquency({
      user: usersData.admin,
      delinquencyTypeIndex: 0,
      skipDuplicateCheck: true, // Skip duplicate check for E2E tests
    });
    delinquencyId = createResult?.userDelinquencyUniqueId;
    if (!delinquencyId) {
      throw new Error("Failed to create delinquency - no ID returned");
    }
    console.log("✅ Created delinquency:", delinquencyId);
  }

  // Driver sees the delinquency in their pending list before responding
  if (preserveResponse) {
    await testGetPendingDelinquencies({
      user,
      expectedDelinquencyUniqueId: delinquencyId,
    });
  }

  // GET (should be empty initially for this new delinquency)
  await testGetDelinquencyResponses({ user, userDelinquencyUniqueId: delinquencyId });

  // CREATE response
  const created = await testCreateDelinquencyResponse({ user, userDelinquencyUniqueId: delinquencyId });
  const responseUniqueId = created?.userDelinquencyResponseUniqueId;
  if (!responseUniqueId) {
    throw new Error("Failed to get responseUniqueId after create");
  }
  console.log("✅ Created response:", responseUniqueId);

  if (preserveResponse) {
    // Lifecycle mode: keep the response alive so the admin can rule on it
    console.log("🔒 Preserving response for subsequent admin decision...");
    await testGetDelinquencyResponses({ user, userDelinquencyUniqueId: delinquencyId });
  } else {
    // Standalone CRUD: exercise update/delete
    await testUpdateDelinquencyResponse({ user, userDelinquencyResponseUniqueId: responseUniqueId });

    // GET (after update)
    await testGetDelinquencyResponses({ user, userDelinquencyUniqueId: delinquencyId });

    // DELETE
    await testDeleteDelinquencyResponse({ user, userDelinquencyResponseUniqueId: responseUniqueId });

    // GET (after delete — should be empty or show soft-deleted)
    await testGetDelinquencyResponses({ user, userDelinquencyUniqueId: delinquencyId });
  }

  console.log("── Delinquency Response Workflow complete ──\n");
  return { responseUniqueId, userDelinquencyUniqueId: delinquencyId };
};

module.exports = {
  testDelinquencyResponseWorkflow,
  testGetDelinquencyResponses,
  testGetPendingDelinquencies,
  testCreateDelinquencyResponse,
  testUpdateDelinquencyResponse,
  testDeleteDelinquencyResponse,
};
