const BANNED_USERS_ENDPOINTS = {
  BAN_USER: "/",
  GET_BANNED_USERS: "/",
  UPDATE_BANNED_USER: "/:banUniqueId",
  UNBAN_USER: "/",
  DEACTIVATE_BAN: "/:banUniqueId/deactivate",
};

module.exports = {
  BANNED_USERS_ENDPOINTS,
};
