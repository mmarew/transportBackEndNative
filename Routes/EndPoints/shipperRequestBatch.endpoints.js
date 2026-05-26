const SHIPPER_REQUEST_BATCH_ENDPOINTS = {
  CREATE_BATCH: "/api/shipperRequestBatch",
  GET_BATCHES: "/api/shipperRequestBatch",
  GET_BATCH: "/api/shipperRequestBatch/:batchUniqueId",
  UPDATE_BATCH: "/api/shipperRequestBatch/:batchUniqueId",
  DELETE_BATCH: "/api/shipperRequestBatch/:batchUniqueId",
  CANCEL_BATCH: "/api/shipperRequestBatch/:batchUniqueId/cancel",
  GET_BATCH_SLOTS: "/api/shipperRequestBatch/:batchUniqueId/slots",
  PARTIAL_CANCEL_BATCH: "/api/shipperRequestBatch/:batchUniqueId/partialCancel",
};

module.exports = {
  SHIPPER_REQUEST_BATCH_ENDPOINTS,
};
