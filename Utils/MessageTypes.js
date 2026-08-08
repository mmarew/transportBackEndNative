/*

This JavaScript code defines an object called 

messageTypes

 that contains various message types related to shipper and driver requests. Each message type is represented as a key-value pair, where the key is the message type identifier and the value is an object containing a 

message

 and 

details

 (which appears to be a typo for "details"). The 

message

 provides a brief description of the action, while 

details

 gives a more detailed explanation of the circumstances under which the message is used. Finally, the 

messageTypes

 object is exported using 

module.exports

 for use in other parts of the application.

Here's a corrected version of the code with the typos fixed:
 */

const messageTypes = {
  connection_established: {
    message: "Connection established.",
    details: "When connection is established.",
  },
  refund_approved_by_admin: {
    message: "Admin approved driver refund.",
    details: "When driver approved refund data.",
  },
  create_deposit_By_driver: {
    message: "Driver deposited money.",
    details:
      "When driver deposited money it is in status of requested and needs approval by admin",
  },
  refund_requested_by_driver: {
    message: "Driver request refund.",
    details: "When driver requests an admin to refund there money.",
  },
  request_other_driver: {
    message: "Requesting other driver.",
    details:
      "When driver is not giving answers to current shipper request, shippers request is being forwarded to other driver",
  },
  reCreate_new_shipper_request: {
    message: "recreate new shipper request",
    details:
      "When current shipper request is not fulfilled and recreating is necessary",
  },
  request_other_shipper: {
    message: "requesting other shipper",
    details:
      "When shipper is not giving answers to current driver request, driver request is being forwarded to other shipper",
  },
  reCreate_new_driver_request: {
    message: "recreate new driver request",
    details:
      "When current driver request is not fulfilled and recreating is necessary",
  },
  // 0983068308
  driver_not_answered: {
    message: "Driver is not responding",
    details: "Driver don't respond to current shippers request ",
  },
  driver_found_shipper_request: {
    message: "Driver found shipper request.",
    details:
      "Driver found shipper request and shipper is waiting for driver approval.",
  },
  driver_accepted_shipper_request: {
    message: "Driver accepted shipper request.",
    details:
      "Driver accepted shipper request and waiting for shipper approval.",
  },
  driver_started_journey: {
    message: "Driver started journey.",
    details: "Driver started journey to destination, follow on map .",
  },
  driver_completed_journey: {
    message: "Driver completed journey.",
    details: "Driver completed journey to destination, follow on map .",
  },
  online_driver_not_found: {
    message: "Online driver not found.",
    details:
      "Dear customer, we apologize to inform you. Your request has been canceled by the system because no vehicle is available nearby. Please try again later.",
  },
  update_drivers_location_to_shipper: {
    message: "Update drivers location to shipper.",
    details:
      "When driver is moving from place to place its current location is being updated to shipper",
  },
  driver_not_selected_in_bid: {
    message: "Driver not selected in bid",
    details: "Shipper selected another driver's offer during bid selection",
  },
  shipper_accepted_driver_request: {
    message: "Shipper accepted your request",
    details: "Shipper selected your offer during bid selection",
  },
  shipper_cancelled_request: {
    message: "Shipper cancelled request",
    details: "Shipper cancelled the transport request",
  },
  admin_cancelled_request: {
    message: "Request cancelled by admin",
    details: "Admin cancelled the transport request",
  },
  driver_cancelled_request: {
    message: "Driver cancelled request",
    details: "Driver cancelled the transport request",
  },
  shipper_rejected_request: {
    message: "Shipper rejected request",
    details: "Shipper rejected the driver's offer",
  },
  driver_rejected_request: {
    message: "Driver rejected request",
    details: "Driver rejected the shipper's request",
  },
  wrong_email_reported: {
    message: "Email reported as incorrect",
    details:
      "The recipient reported that this email was sent to them by mistake. Please check for typos.",
  },
  email_verified_token_update: {
    message: "Email verified - Token updated",
    details:
      "Your email has been verified. Here is your updated security token.",
  },
  force_logout_phone_change: {
    message: "Phone number updated - Session Revoked",
    details:
      "Your phone number has been changed. For security reasons, you have been logged out. Please verify your new number and log in again.",
  },
  create_vehicle: {
    message: "New vehicle registered",
    details:
      "When a driver registers a new vehicle and it needs to be attached with documents.",
  },
  accept_reject_driver_document: {
    message: "Driver document status updated",
    details: "When an admin accepts or rejects a driver's document.",
  },
  company_batch_available: {
    message: "New company-targeted batch available",
    details:
      "When a shipper posts a new company-targeted job, the targeted company receives this notification in real-time.",
  },
  company_driver_confirmed: {
    message: "Driver confirmed assignment",
    details:
      "When a driver confirms a company freight assignment.",
  },
  company_driver_going_to_loading: {
    message: "Driver going to loading point",
    details:
      "When a driver starts heading to the loading point for a company freight assignment.",
  },
  company_driver_journey_started: {
    message: "Driver started journey",
    details:
      "When a driver starts the journey to destination for a company freight assignment.",
  },
  company_driver_completed: {
    message: "Driver completed journey",
    details:
      "When a driver completes the journey for a company freight assignment.",
  },
  company_driver_rejected: {
    message: "Driver rejected assignment",
    details:
      "When a driver rejects a company freight assignment.",
  },
  company_driver_cancelled: {
    message: "Driver cancelled assignment",
    details:
      "When a driver cancels a company freight assignment.",
  },
  company_bid_accepted: {
    message: "Company bid accepted",
    details:
      "When a shipper accepts a transport company's bid for a freight batch.",
  },
  company_bid_rejected: {
    message: "Company bid rejected",
    details: "When a shipper rejects a transport company's bid.",
  },
  company_bid_cancelled: {
    message: "Company bid cancelled",
    details: "When a transport company bid is cancelled.",
  },
  company_bid_submitted: {
    message: "Company submitted a bid",
    details:
      "When a transport company submits a bid for a freight batch, the shipper is notified.",
  },
  company_driver_assignment: {
    message: "New freight assignment",
    details:
      "When a dispatcher assigns a driver to a freight job via company bid. Driver must confirm or reject.",
  },
  driver_document_approved: {
    message: "Your document has been approved",
    details: "When an admin approves a driver's uploaded document.",
  },
  driver_document_rejected: {
    message: "Your document has been rejected",
    details: "When an admin rejects a driver's uploaded document.",
  },
  individual_replaced_by_company: {
    message: "Individual job replaced by company assignment",
    details:
      "Your company has assigned you to a fleet freight job. Your previous individual shipper match has been released back to the open pool and is available for other drivers.",
  },
  queue_checkin_confirmed: {
    message: "Checked into queue",
    details:
      "Driver successfully joined the queue. Payload carries queueNumber, position, queueDate.",
  },
  queue_position_changed: {
    message: "Queue position updated",
    details:
      "The queue changed (new check-in, loaded, or removal). Sent to drivers in the queue and queue org admins.",
  },
  queue_order_offered: {
    message: "New order from the queue",
    details:
      "A fixed-price order is offered to the front driver of a queue. The driver must accept or reject within the offer window.",
  },
  queue_order_rejected: {
    message: "Order passed to next driver",
    details:
      "The front driver rejected or timed out; the order advances to the next driver in line.",
  },
  queue_refusal_moved_to_back: {
    message: "Driver moved to back of queue",
    details:
      "A driver reached the consecutive-refusal limit and was moved to the back of the line; the order still advances to the next driver.",
  },
  queue_order_assigned: {
    message: "Order assigned from queue",
    details:
      "A driver accepted a queue order and left the queue (status loaded).",
  },
  queue_order_cancelled: {
    message: "Queue order cancelled",
    details:
      "A queue order was cancelled at the job level; the holding driver entry is released back to waiting without a refusal count.",
  },
  queue_removed: {
    message: "Removed from queue",
    details:
      "A driver's queue entry was removed by checkout, no-show, or supervisor override.",
  },
  queue_org_approved: {
    message: "Queue organization approved",
    details:
      "Admin approved/rejected a QueueOrganization; queueEnabled toggled.",
  },
  queue_org_updated: {
    message: "Queue organization updated",
    details: "Queue organization profile was updated by its admin.",
  },
};
module.exports = messageTypes;
