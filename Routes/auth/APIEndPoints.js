const AUTH_ENDPOINTS = {
  CREATE_USER: `/api/user/createUser`,
  CREATE_USER_BY_ADMIN: `/api/admin/createUserByAdminOrSuperAdmin`,
  LOGIN_USER: `/api/user/loginUser`,
  VERIFY_USER_BY_OTP: `/api/user/verifyUserByOTP`,
  VERIFY_EMAIL: `/api/user/verify-email`,
  VERIFY_PHONE: `/api/user/verify-phone`,
  REPORT_WRONG_EMAIL: `/api/user/report-wrong-email`,
};

module.exports = {
  AUTH_ENDPOINTS,
};
