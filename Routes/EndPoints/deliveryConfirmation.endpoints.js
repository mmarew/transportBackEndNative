const DELIVERY_CONFIRMATION_ENDPOINTS = {
  CREATE_DELIVERY_CONFIRMATION: "/",
  GET_ALL_DELIVERY_CONFIRMATIONS: "/",
  UPDATE_DELIVERY_CONFIRMATION: "/:deliveryConfirmationUniqueId",
  DELETE_DELIVERY_CONFIRMATION: "/:deliveryConfirmationUniqueId",
  REQUEST_SIGN_OTP: "/:deliveryConfirmationUniqueId/request-sign-otp",
  VERIFY_HASH: "/:deliveryConfirmationUniqueId/verify-hash",
};

module.exports = {
  DELIVERY_CONFIRMATION_ENDPOINTS,
};
