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
const testBanUser = async ({ user, targetUserRoleUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    // Resolve userRoleUniqueId from accountData if not provided
    const userRoleUniqueId =
      targetUserRoleUniqueId ||
      usersData?.driver?.accountData?.userData?.userRoleUniqueId;

    if (!userRoleUniqueId) throw new Error("userRoleUniqueId not found");

    const payload = {
      userRoleUniqueId,
      reason: "Manual ban issued during E2E test — repeated policy violations.",
      banDuration: 7, // days
    };

    const result = await axios.post(backendURL + BASE_URL, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ User banned:", result.data.data?.banUniqueId || result.data.data);
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
  targetUserRoleUniqueId = undefined,
} = {}) => {
  console.log("\n── Ban Workflow ──");

  // GET (existing bans)
  await testGetBannedUsers({ user });

  // CREATE
  const banResult = await testBanUser({ user, targetUserRoleUniqueId });
  const banUniqueId = banResult?.data?.banUniqueId || bans.data?.[0]?.banUniqueId;

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
