const USER_DELINQUENCY_ENDPOINTS = {
  CREATE_DELINQUENCY: "/",
  GET_ALL_DELINQUENCIES: "/",
  UPDATE_DELINQUENCY: "/:userDelinquencyUniqueId",
  DELETE_DELINQUENCY: "/:userDelinquencyUniqueId",
  UPDATE_SEEN_BY_ADMIN: "/:userDelinquencyUniqueId/seen",
};

module.exports = {
  USER_DELINQUENCY_ENDPOINTS,
};
