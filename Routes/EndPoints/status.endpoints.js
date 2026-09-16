const STATUS_ENDPOINTS = {
  MOUNT: "/api/admin/statuses",
  CREATE_STATUS: "/",
  GET_STATUS_BY_ID: "/:statusUniqueId",
  UPDATE_STATUS: "/:statusUniqueId",
  DELETE_STATUS: "/:statusUniqueId",
  GET_ALL_STATUSES: "/",
};

module.exports = {
  STATUS_ENDPOINTS,
};
