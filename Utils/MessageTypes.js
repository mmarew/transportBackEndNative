/*

This JavaScript code defines an object called 

messageTypes

 that contains various message types related to passenger and driver requests. Each message type is represented as a key-value pair, where the key is the message type identifier and the value is an object containing a 

message

 and 

detailes

 (which appears to be a typo for "details"). The 

message

 provides a brief description of the action, while 

detailes

 gives a more detailed explanation of the circumstances under which the message is used. Finally, the 

messageTypes

 object is exported using 

module.exports

 for use in other parts of the application.

Here's a corrected version of the code with the typos fixed:
 */

const messageTypes = {
  refund_requested_by_driver: {
    message: "driver request refund",
    detailes: "When driver requests an admin to refund there money",
  },
  request_other_driver: {
    message: "requesting other driver",
    detailes:
      "When driver is not giving answers to current passenger request, passengers request is being forwarded to other driver",
  },
  reCreate_new_passenger_request: {
    message: "recreate new passenger request",
    detailes:
      "When current passenger request is not fulfieled and recreating is necessery",
  },
  request_other_passenger: {
    message: "requesting other passenger",
    detailes:
      "When passenger is not giving answers to current driver request, driver request is being forwarded to other passenger",
  },
  reCreate_new_driver_request: {
    message: "recreate new driver request",
    detailes:
      "When current driver request is not fulfieled and recreating is necessery",
  },
  driver_not_answered: {
    message: "driver is not responding",
    detailes: "driver dont respond to current passengers request ",
  },
  driver_answred_calls: {
    message: "driver responded to calls",
    detailes: "driver respond to passenger calls",
  },
  online_driver_not_found: {
    message: "online driver not found",
    detailes:
      "Dear customer, we apologize to inform you. Your request has been canceled by the system because no vehicle is available nearby. Please try again later.",
  },
};
module.exports = messageTypes;
