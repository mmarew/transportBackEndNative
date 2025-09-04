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
  update_drivers_location: {
    message: "Update drivers location.",
    details:
      "When driver is moving from place to place its current location is being updated",
  },
};
module.exports = messageTypes;
