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
   
    //save bans data to variable for use in other tests
    bans.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetBannedUsers:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── CREATE ban (manual) ───────────────────────────────────────────────────────
const testBanUser = async ({ user, userRoleUniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    // Get userRoleUniqueId from driver's accountData if not provided
    let targetUserRoleUniqueId = userRoleUniqueId;

    if (!targetUserRoleUniqueId) {
      // Try to get it from driver's account data
      const driverData = usersData?.driver?.accountData;

      if (driverData?.userData?.userRoleUniqueId) {
        targetUserRoleUniqueId = driverData.userData.userRoleUniqueId;
        console.log(
          "📋 Using driver's userRoleUniqueId from accountData:",
          targetUserRoleUniqueId,
        );
      } else if (driverData?.userRoleData?.userRoleUniqueId) {
        targetUserRoleUniqueId = driverData.userRoleData.userRoleUniqueId;
        console.log(
          "📋 Using driver's userRoleUniqueId from userRoleData:",
          targetUserRoleUniqueId,
        );
      } else {
        console.warn(
          "⚠️  Could not find userRoleUniqueId in driver accountData:",
          JSON.stringify(driverData, null, 2),
        );
        throw new Error(
          "userRoleUniqueId is required - not found in driver accountData",
        );
      }
    }

    const payload = {
      userRoleUniqueId: targetUserRoleUniqueId,
      reason: "Manual ban issued during E2E test — repeated policy violations.",
      banDuration: 7,
    };

    const result = await axios.post(backendURL + BASE_URL, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      "✅ User banned:",
      result.data.data?.banUniqueId || result.data.banUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testBanUser:",
      error.response?.data?.error || error.message,
    );
    if (error.response?.data) {
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2),
      );
    }
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
      reason:
        "Updated ban reason — additional violations discovered during review.",
    };

    const result = await axios.put(backendURL + BASE_URL + "/" + id, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Ban updated:", id);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testUpdateBan:",
      error.response?.data?.error || error.message,
    );
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
    console.error(
      "❌ testDeactivateBan:",
      error.response?.data?.error || error.message,
    );
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
    console.error(
      "❌ testUnbanUser:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testBanWorkflow = async ({
  user = usersData.admin,
  userRoleUniqueId = undefined,
} = {}) => {
  console.log("\n── Ban Workflow ──");

  // Try to get userRoleUniqueId from driver's accountData if not provided
  let targetUserRoleUniqueId = userRoleUniqueId;

  if (
    !targetUserRoleUniqueId &&
    usersData?.driver?.accountData?.userData?.userRoleUniqueId
  ) {
    targetUserRoleUniqueId =
      usersData.driver.accountData.userData.userRoleUniqueId;
    console.log(
      "📋 Using userRoleUniqueId from driver accountData:",
      targetUserRoleUniqueId,
    );
  }

  // If targetUserRoleUniqueId is still not available in driver accountData, skip test
  if (!targetUserRoleUniqueId) {
    console.log(
      "⏩ Skipping ban workflow — userRoleUniqueId not available in driver accountData",
    );
    return { skipped: true };
  }

  // GET (existing bans)
  await testGetBannedUsers({ user, actionsAfter: "initial fetch" });

  // CREATE
  const banResult = await testBanUser({
    user,
    userRoleUniqueId: targetUserRoleUniqueId,
  });
  const banUniqueId = banResult?.banUniqueId || banResult?.data?.banUniqueId;

  if (!banUniqueId) {
    console.warn("⚠️  No banUniqueId returned - cannot continue ban workflow");
    return { skipped: true };
  }
  //get banned user after ban
  await testGetBannedUsers({ user, actionsAfter: "after ban" });
  // UPDATE
  await testUpdateBan({ user, banUniqueId });

  // GET banned user (after update of ban)
  await testGetBannedUsers({ user, actionsAfter: "after update" });

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
