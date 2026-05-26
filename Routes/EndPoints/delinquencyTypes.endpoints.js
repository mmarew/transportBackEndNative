const DELINQUENCY_TYPES_ENDPOINTS = {
  CREATE_DELINQUENCY_TYPE: "/api/admin/delinquency-types",
  GET_DELINQUENCY_TYPES: "/api/admin/delinquency-types",
  UPDATE_DELINQUENCY_TYPE: "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
  DELETE_DELINQUENCY_TYPE: "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
  GET_DELINQUENCY_TYPES_BY_ROLE: "/api/admin/delinquency-types/role/:roleUniqueId",
  TOGGLE_DELINQUENCY_TYPE_ACTIVE: "/api/admin/delinquency-types/:delinquencyTypeUniqueId/toggle-active",
};

module.exports = {
  DELINQUENCY_TYPES_ENDPOINTS,
};
