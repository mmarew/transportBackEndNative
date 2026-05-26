const STATUS_ENDPOINTS = {
  CREATE_STATUS: "/api/admin/statuses",
  GET_STATUS_BY_ID: "/api/admin/statuses/:statusUniqueId",
  UPDATE_STATUS: "/api/admin/statuses/:statusUniqueId",
  GET_ALL_STATUSES: "/api/admin/statuses",
};

module.exports = {
  STATUS_ENDPOINTS,
};
