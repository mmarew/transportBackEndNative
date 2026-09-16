const DRIVER_QUEUE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CHECKIN: "/api/queue/driver/checkin",
  MY_POSITION: "/api/queue/driver/myPosition",
  CHECKOUT: "/api/queue/driver/checkout",
  STATUS: "/api/queue/status",
  MANUAL_CHECKIN: "/api/queue/manualCheckin",
  OVERRIDE_ENTRY: "/api/queue/entry/:queueUniqueId/override",
  REMOVE_ENTRY: "/api/queue/entry/:queueUniqueId",
  DISPATCH: "/api/queue/dispatch",
  ENTRY_HISTORY: "/api/queue/entry/:queueUniqueId/history",
  APPROVE_BIDDING: "/api/queue/bidding/approve",
  GET_BIDS_FOR_ORDER: "/api/queue/bidding/order/:shipperRequestUniqueId/bids",

  // Relative paths — used by Express router (already mounted at /api/queue)
  ROUTER: {
    CHECKIN: "/driver/checkin",
    MY_POSITION: "/driver/myPosition",
    CHECKOUT: "/driver/checkout",
    STATUS: "/status",
    MANUAL_CHECKIN: "/manualCheckin",
    OVERRIDE_ENTRY: "/entry/:queueUniqueId/override",
    REMOVE_ENTRY: "/entry/:queueUniqueId",
    DISPATCH: "/dispatch",
    ENTRY_HISTORY: "/entry/:queueUniqueId/history",
    APPROVE_BIDDING: "/bidding/approve",
    GET_BIDS_FOR_ORDER: "/bidding/order/:shipperRequestUniqueId/bids",
  },
};

module.exports = {
  DRIVER_QUEUE_ENDPOINTS,
};
