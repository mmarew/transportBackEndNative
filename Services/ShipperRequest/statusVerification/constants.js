"use strict";

// BATCH-REFUSAL RULE statuses — a driver who reached any of these terminal
// "said no" journey statuses against an order of a batch cools the WHOLE batch
// for automatic re-offers (FIFO `offerToDriver`, distance/bid matching
// `handleWaitingRequest`, and the check-in bid pull). cancelledByDriver (12)
// covers a driver cancelling AFTER accepting one job of a batch; the set
// carries over the legacy rejection set used by `findNearbyDrivers`
// (VerifyIfShipperRequestWasNotRejected) so every matcher agrees on which
// statuses cool a batch.
const { REJECTED_STATUS_IDS: BATCH_DECLINED_JOURNEY_STATUSES } = require("../../../Utils/RejectedRequests");

module.exports.BATCH_DECLINED_JOURNEY_STATUSES = BATCH_DECLINED_JOURNEY_STATUSES;
