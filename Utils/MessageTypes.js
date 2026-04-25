/*

This JavaScript code defines an object called 

messageTypes

 that contains various message types related to passenger and driver requests. Each message type is represented as a key-value pair, where the key is the message type identifier and the value is an object containing a 

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
      "When driver is not giving answers to current passenger request, passengers request is being forwarded to other driver",
  },
  reCreate_new_passenger_request: {
    message: "recreate new passenger request",
    details:
      "When current passenger request is not fulfilled and recreating is necessary",
  },
  request_other_passenger: {
    message: "requesting other passenger",
    details:
      "When passenger is not giving answers to current driver request, driver request is being forwarded to other passenger",
  },
  reCreate_new_driver_request: {
    message: "recreate new driver request",
    details:
      "When current driver request is not fulfilled and recreating is necessary",
  },
  // 0983068308
  driver_not_answered: {
    message: "Driver is not responding",
    details: "Driver don't respond to current passengers request ",
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
    details: "Passenger selected another driver's offer during bid selection",
  },
  passenger_accepted_driver_request: {
    message: "Passenger accepted your request",
    details: "Passenger selected your offer during bid selection",
  },
  passenger_cancelled_request: {
    message: "Passenger cancelled request",
    details: "Passenger cancelled the transport request",
  },
  admin_cancelled_request: {
    message: "Request cancelled by admin",
    details: "Admin cancelled the transport request",
  },
  driver_cancelled_request: {
    message: "Driver cancelled request",
    details: "Driver cancelled the transport request",
  },
  passenger_rejected_request: {
    message: "Passenger rejected request",
    details: "Passenger rejected the driver's offer",
  },
  driver_rejected_request: {
    message: "Driver rejected request",
    details: "Driver rejected the passenger's request",
  },
  wrong_email_reported: {
    message: "Email reported as incorrect",
    details: "The recipient reported that this email was sent to them by mistake. Please check for typos.",
  },
  email_verified_token_update: {
    message: "Email verified - Token updated",
    details: "Your email has been verified. Here is your updated security token.",
  },
  force_logout_phone_change: {
    message: "Phone number updated - Session Revoked",
    details: "Your phone number has been changed. For security reasons, you have been logged out. Please verify your new number and log in again.",
  },
  create_vehicle: {
    message: "New vehicle registered",
    details: "When a driver registers a new vehicle and it needs to be attached with documents.",
  },
  accept_reject_driver_document: {
    message: "Driver document status updated",
    details: "When an admin accepts or rejects a driver's document.",
  },
  company_bid_accepted: {
    message: "Company bid accepted",
    details: "When a shipper accepts a transport company's bid for a freight batch.",
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
    details: "When a transport company submits a bid for a freight batch, the shipper is notified.",
  },
};
module.exports = messageTypes;
