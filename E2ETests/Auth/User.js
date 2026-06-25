const { backendURL, usersData } = require("../constants");
const axios = require("axios");
const { authConfig } = require("../Utils");

const testUpdateUserWithFileUpload = async () => {
  const token = usersData?.shipper?.token || usersData?.admin?.token;
  if (!token) {
    console.log("⏩ updateUser/self: no shipper or admin token available");
    return;
  }

  console.log("\n── PUT /api/user/updateUser/self with file ──");

  const form = new FormData();
  form.append("fullName", "Updated E2E Driver Name");

  // Minimal 1x1 PNG (valid PNG that passes multer's fileFilter)
  const dummyPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
    0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);
  form.append("profilePhoto", new Blob([dummyPng], { type: "image/png" }), "profile.png");
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
