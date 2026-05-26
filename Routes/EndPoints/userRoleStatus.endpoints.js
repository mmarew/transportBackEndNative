const USER_ROLE_STATUS_ENDPOINTS = {
  CREATE_USER_ROLE_STATUS: "/api/admin/userRoleStatus",
  GET_CURRENT_USER_ROLE_STATUS: "/api/admin/userRoleStatusCurrent",
  GET_USER_ROLE_STATUS_BY_PHONE: "/api/admin/userRoleStatusByPhone",
  UPDATE_USER_ROLE_STATUS: "/api/admin/userRoleStatus/:userUniqueId",
  DELETE_USER_ROLE_STATUS: "/api/admin/userRoleStatus/:userRoleStatusUniqueId",
};

module.exports = {
  USER_ROLE_STATUS_ENDPOINTS,
};
