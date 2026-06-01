const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { backendURL, usersData } = require("../constants");

const getCreateUserPayload = ({ userType }) => {
  const user = usersData[userType];
  if (!user) return {};

  const payload = {
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    roleId: user.roleId,
  };

  if (user.statusId !== undefined) {
    payload.statusId = user.statusId;
  }

  return payload;
};

const testCreateUser = async ({ userType = "admin" }) => {
  try {
    const payload = getCreateUserPayload({ userType });
    await axios.post(backendURL + AUTH_ENDPOINTS.CREATE_USER, payload);
    // console.log("✅ Success! User Created:");
    // console.log(res.data);
  } catch (error) {
    console.log("❌ Failed to create user", userType);
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
  }
};
module.exports = { testCreateUser };
