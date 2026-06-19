const { backendURL, usersData } = require("../constants");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const testUpdateUserWithFileUpload = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⚠ Skipping updateUser test: no driver token available");
    return;
  }

  console.log("\n── Testing PUT /api/user/updateUser/self with file upload ──");

  const form = new FormData();
  form.append("fullName", "Updated E2E Driver Name");

  const dummyFilePath = path.join(__dirname, "../dummy.txt");
  const fileBuffer = fs.readFileSync(dummyFilePath);
  form.append("profilePhoto", new Blob([fileBuffer]), "dummy.txt");
  form.append("profilePhotoTypeId", "4");
  form.append("ProfilePhotoDescription", "E2E test profile photo");

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.put(
      backendURL + "/api/user/updateUser/self",
      form,
      config,
    );
    console.log(
      `✅ updateUser/self with file: ${response.data?.message || "success"}`,
    );
  } catch (error) {
    console.error(
      "❌ updateUser/self with file failed:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

module.exports = { testUpdateUserWithFileUpload };
