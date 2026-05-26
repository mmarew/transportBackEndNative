const USER_DELINQUENCY_RESPONSE_ENDPOINTS = {
  CREATE_DELINQUENCY_RESPONSE: "/api/admin/userDelinquencyResponse",
  GET_DELINQUENCY_RESPONSES_BY_FILTER: "/api/admin/userDelinquencyResponseByFilter",
  GET_DELINQUENCY_RESPONSE: "/api/admin/userDelinquencyResponse/:userDelinquencyResponseUniqueId",
  UPDATE_DELINQUENCY_RESPONSE: "/api/admin/userDelinquencyResponse/:userDelinquencyResponseUniqueId",
  DELETE_DELINQUENCY_RESPONSE: "/api/admin/userDelinquencyResponse/:userDelinquencyResponseUniqueId",
};

module.exports = {
  USER_DELINQUENCY_RESPONSE_ENDPOINTS,
};
