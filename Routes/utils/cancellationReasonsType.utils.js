const CANCELLATION_REASONS_TYPE_ENDPOINTS = {
  ADD_CANCELLATION_REASONS: "/api/admin/cancellationReasons",
  GET_ALL_CANCELLATION_REASONS: "/api/admin/cancellationReasons",
  UPDATE_CANCELLATION_REASONS: "/api/admin/cancellationReasons/:cancellationReasonTypeUniqueId",
  DELETE_CANCELLATION_REASONS: "/api/admin/cancellationReasons/:cancellationReasonTypeUniqueId",
};

module.exports = {
  CANCELLATION_REASONS_TYPE_ENDPOINTS,
};
