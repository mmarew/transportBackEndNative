const SHIPPER_REQUEST_BATCH_ENDPOINTS = {
  CREATE_BATCH: "/",
  GET_BATCHES: "/",
  GET_BATCH: "/:batchUniqueId",
  UPDATE_BATCH: "/:batchUniqueId",
  DELETE_BATCH: "/:batchUniqueId",
  CANCEL_BATCH: "/:batchUniqueId/cancel",
  GET_BATCH_SLOTS: "/:batchUniqueId/slots",
  PARTIAL_CANCEL_BATCH: "/:batchUniqueId/partialCancel",
};

module.exports = {
  SHIPPER_REQUEST_BATCH_ENDPOINTS,
};
