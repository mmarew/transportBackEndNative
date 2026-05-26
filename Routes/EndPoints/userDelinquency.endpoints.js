const USER_DELINQUENCY_ENDPOINTS = {
  CREATE_DELINQUENCY: "/api/admin/userDelinquency",
  GET_ALL_DELINQUENCIES: "/api/admin/userDelinquency",
  UPDATE_DELINQUENCY: "/api/admin/userDelinquency/:userDelinquencyUniqueId",
  DELETE_DELINQUENCY: "/api/admin/userDelinquency/:userDelinquencyUniqueId",
  UPDATE_SEEN_BY_ADMIN: "/api/admin/userDelinquency/:userDelinquencyUniqueId/seen",
};

module.exports = {
  USER_DELINQUENCY_ENDPOINTS,
};
