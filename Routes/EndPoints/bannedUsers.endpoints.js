const BANNED_USERS_ENDPOINTS = {
  BAN_USER: "/api/admin/banned-users",
  GET_BANNED_USERS: "/api/admin/banned-users",
  UPDATE_BANNED_USER: "/api/admin/banned-users/:banUniqueId",
  UNBAN_USER: "/api/admin/banned-users",
  DEACTIVATE_BAN: "/api/admin/banned-users/:banUniqueId/deactivate",
};

module.exports = {
  BANNED_USERS_ENDPOINTS,
};
