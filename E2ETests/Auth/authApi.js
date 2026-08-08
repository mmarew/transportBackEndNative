// authApi.js — the ONLY module that talks to AUTH_ENDPOINTS.
// All create / verify / login calls across main E2E, Queue, and sub-suites
// must route through here (via ensureUser). Keeps auth wiring in one place.

const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const createPayloadFor = (userType) => {
  const user = usersData[userType];
  if (!user) throw new Error(`No user definition for "${userType}" in usersData.`);
  return user;
};

const apiCreateUser = async (userType) => {
  const user = createPayloadFor(userType);
  try {
    await axios.post(backendURL + AUTH_ENDPOINTS.CREATE_USER, {
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      roleId: user.roleId,
      ...(user.statusId !== undefined ? { statusId: user.statusId } : {}),
    });
  } catch (error) {
    const status = error?.response?.status;
    if (status === 409) {
      console.log(`  ⚠ ${userType} already exists — reusing`);
      return;
    }
    console.error(
      `❌ Failed to create ${userType}:`,
      error?.response?.data?.error?.details || error?.response?.data?.error || error?.message,
    );
    throw error;
  }
};

const apiCreateUserByAdmin = async (userType, adminToken) => {
  const user = createPayloadFor(userType);
  try {
    await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER_BY_ADMIN,
      user,
      authConfig(adminToken),
    );
  } catch (error) {
    const status = error?.response?.status;
    if (status === 409) {
      console.log(`  ⚠ ${userType} already exists — reusing`);
      return;
    }
    console.error(
      `❌ Failed to create ${userType} via admin:`,
      error?.response?.data?.error?.details || error?.response?.data?.error || error?.message,
    );
    throw error;
  }
};

const apiVerifyUserByOTP = async (userType) => {
  const user = createPayloadFor(userType);
  try {
    const res = await axios.post(backendURL + AUTH_ENDPOINTS.VERIFY_USER_BY_OTP, {
      phoneNumber: user.phoneNumber,
      OTP: user.OTP,
      roleId: user.roleId,
    });
    usersData[userType].token = res.data.token;
    return res.data;
  } catch (error) {
    console.error(
      `❌ Failed to verify ${userType}:`,
      error?.response?.data?.error?.details || error?.response?.data?.error || error?.message,
    );
    throw error;
  }
};

const apiLoginUser = async (userType) => {
  const user = createPayloadFor(userType);
  try {
    await axios.post(backendURL + AUTH_ENDPOINTS.LOGIN_USER, {
      email: user.email,
      phoneNumber: user.phoneNumber,
      OTP: user.OTP,
      roleId: user.roleId,
    });
  } catch (error) {
    console.error(
      `❌ Failed to login ${userType}:`,
      error?.response?.data?.error?.details || error?.response?.data?.error || error?.message,
    );
    throw error;
  }
};

module.exports = {
  apiCreateUser,
  apiCreateUserByAdmin,
  apiVerifyUserByOTP,
  apiLoginUser,
};
