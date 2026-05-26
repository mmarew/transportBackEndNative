const USER_ENDPOINTS = {
  UPDATE_USER: "/api/user/updateUser/:ownerUserUniqueId",
  GET_USER_BY_ID: "/api/user/users/:userUniqueId",
  GET_USER_BY_FILTER_DETAILED: "/api/admin/getUserByFilterDetailed",
  GET_USER_PROFILE_HISTORY: "/api/user/users/:userUniqueId/profileHistory",
};

module.exports = {
  USER_ENDPOINTS,
};
