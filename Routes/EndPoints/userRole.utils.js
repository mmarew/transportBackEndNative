const USER_ROLE_ENDPOINTS = {
  CREATE_USER_ROLE: "/api/admin/userRole/create",
  GET_USER_ROLE_LIST_BY_FILTER: "/api/admin/getUserRoleListByFilter",
  UPDATE_USER_ROLE: "/api/admin/userRole/:userRoleUniqueId",
  DELETE_USER_ROLE: "/api/admin/userRole/:userRoleUniqueId",
};

module.exports = {
  USER_ROLE_ENDPOINTS,
};
