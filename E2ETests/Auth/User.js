const { backendURL, usersData } = require("../constants");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { authConfig } = require("../Utils");

const testUpdateUserWithFileUpload = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⏩ updateUser/self: no driver token available");
    return;
  }

  console.log("\n── PUT /api/user/updateUser/self with file ──");

  const form = new FormData();
  form.append("fullName", "Updated E2E Driver Name");

  const dummyFilePath = path.join(__dirname, "../dummy.txt");
  const fileBuffer = fs.readFileSync(dummyFilePath);
  form.append("profilePhoto", new Blob([fileBuffer]), "dummy.txt");
  form.append("profilePhotoTypeId", "4");
  form.append("ProfilePhotoDescription", "E2E test profile photo");

  try {
    const response = await axios.put(
      backendURL + "/api/user/updateUser/self",
      form,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log(`✅ updateUser/self: ${response.data?.message || "success"}`);
  } catch (error) {
    console.error(
      "❌ updateUser/self failed:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteUser = async ({ userUniqueId, token, label = "user" } = {}) => {
  const adminToken = token || usersData?.admin?.token;
  if (!adminToken) {
    console.log("⏩ deleteUser: no admin token available");
    return;
  }
  const uid = userUniqueId || usersData?.driver?.userUniqueId;
  if (!uid) {
    console.log("⏩ deleteUser: no userUniqueId available");
    return;
  }

  console.log(`\n── DELETE /api/user/users/${label} ──`);

  try {
    const response = await axios.delete(
      backendURL + `/api/user/users/${uid}`,
      authConfig(adminToken),
    );
    console.log(`✅ deleteUser ${label}: ${response.data?.message || "success"}`);
    return response.data;
  } catch (error) {
    console.error(
      `❌ deleteUser ${label} failed:`,
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

module.exports = { testUpdateUserWithFileUpload, testDeleteUser };
