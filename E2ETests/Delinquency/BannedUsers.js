// CRUD for banned users
// Admin manually bans, reads, updates, deactivates bans

const axios = require("axios");
const { backendURL, usersData } = require("../constants");

const BASE_URL = "/api/admin/bannedUsers";
const bans = { data: null };

// ── GET banned users ──────────────────────────────────────────────────────────
const testGetBannedUsers = async ({ user } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(backendURL + BASE_URL, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Banned users fetched:", result.data.data?.length ?? 0);
    bans.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetBannedUsers:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ban (manual) ───────────────────────────────────────────────────────
const testBanUser = async ({ user, userRoleUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    // Get userRoleUniqueId - need to query for it if not provided
    // For E2E tests, we need to get the driver's userRoleUniqueId from UserRole table
    // Since we don't have direct access, we'll construct it from known data
    // This is a limitation - in real use, the frontend would have this from user profile
    
    if (!userRoleUniqueId) {
      throw new Error("userRoleUniqueId is required - cannot be inferred in E2E test");
    }

    const payload = {
      userRoleUniqueId,
      reason: "Manual ban issued during E2E test — repeated policy violations.",
      banDuration: 7,
    };

    const result = await axios.post(backendURL + BASE_URL, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ User banned:", result.data.data?.banUniqueId || result.data.banUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testBanUser:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ban ────────────────────────────────────────────────────────────────
const testUpdateBan = async ({ user, banUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const id = banUniqueId || bans.data?.[0]?.banUniqueId;
    if (!id) throw new Error("No banUniqueId found to update");

    const payload = {
      reason: "Updated ban reason — additional violations discovered during review.",
    };

    const result = await axios.put(backendURL + BASE_URL + "/" + id, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Ban updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateBan:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DEACTIVATE ban ────────────────────────────────────────────────────────────
const testDeactivateBan = async ({ user, banUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const id = banUniqueId || bans.data?.[0]?.banUniqueId;
    if (!id) throw new Error("No banUniqueId found to deactivate");

    const result = await axios.patch(
      backendURL + BASE_URL + "/" + id + "/deactivate",
      {},
      { headers: { Authorization: "Bearer " + token } },
    );
    console.log("✅ Ban deactivated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeactivateBan:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UNBAN user (delete) ───────────────────────────────────────────────────────
const testUnbanUser = async ({ user, banUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const id = banUniqueId || bans.data?.[0]?.banUniqueId;
    if (!id) throw new Error("No banUniqueId found to unban");

    const result = await axios.delete(backendURL + BASE_URL, {
      headers: { Authorization: "Bearer " + token },
      data: { banUniqueId: id },
    });
    console.log("✅ User unbanned:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUnbanUser:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testBanWorkflow = async ({
  user = usersData.admin,
  userRoleUniqueId = undefined,
} = {}) => {
  console.log("\n── Ban Workflow ──");

  // Skip test if userRoleUniqueId not provided (requires database query)
  if (!userRoleUniqueId) {
    console.log("⏩ Skipping ban workflow — userRoleUniqueId required but not provided");
    console.log("   To test bans, provide userRoleUniqueId from UserRole table");
    return { skipped: true };
  }

  // GET (existing bans)
  await testGetBannedUsers({ user });

  // CREATE
  const banResult = await testBanUser({ user, userRoleUniqueId });
  const banUniqueId = banResult?.banUniqueId || banResult?.data?.banUniqueId;

  // UPDATE
  await testUpdateBan({ user, banUniqueId });

  // GET (after ban)
  await testGetBannedUsers({ user });

  // DEACTIVATE (lift ban at end of test)
  await testDeactivateBan({ user, banUniqueId });

  console.log("── Ban Workflow complete ──\n");
  return { banUniqueId };
};

module.exports = {
  testBanWorkflow,
  testGetBannedUsers,
  testBanUser,
  testUpdateBan,
  testDeactivateBan,
  testUnbanUser,
};
