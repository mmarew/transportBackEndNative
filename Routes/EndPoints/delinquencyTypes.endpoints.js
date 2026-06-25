const DELINQUENCY_TYPES_ENDPOINTS = {
  CREATE_DELINQUENCY_TYPE: "/",
  GET_DELINQUENCY_TYPES: "/",
  UPDATE_DELINQUENCY_TYPE: "/:delinquencyTypeUniqueId",
  DELETE_DELINQUENCY_TYPE: "/:delinquencyTypeUniqueId",
  GET_DELINQUENCY_TYPES_BY_ROLE: "/role/:roleUniqueId",
  TOGGLE_DELINQUENCY_TYPE_ACTIVE: "/:delinquencyTypeUniqueId/toggle-active",
};

module.exports = {
  DELINQUENCY_TYPES_ENDPOINTS,
};
