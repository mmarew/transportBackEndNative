const controller = require("../Controller/Driver.controller");
const Router = require("express").Router();

Router.get("/", controller.checkGetMethodes);
const upload = require("../Config/multerConfig");
const verifyToken = require("../Middleware/verifyToken");

Router.post(
  "/drivers/registerDriver",

  controller.registerDriver
);
Router.get("/drivers/verifyDriverByOTP/", controller.verifyDriverByOTP);
Router.put("/drivers/cancelRequest", verifyToken, controller.cancelRequest);
Router.post(
  "/drivers/registerDriverToGetPassengerRequest",
  verifyToken,
  controller.registerDriverToGetPassengerRequest
);
Router.get(
  "/drivers/verifyStatusOfDriver",
  verifyToken,
  controller.verifyStatusOfDriver
);
//  rejectPassangersRequest, acceptPassangersRequest;
Router.put(
  "/rejectPassangersRequest",
  verifyToken,
  controller.rejectPassangersRequest
);
Router.put(
  "/acceptPassangersRequest",
  verifyToken,
  controller.acceptPassangersRequest
);
Router.put("/startJourney", verifyToken, controller.startJourney);
Router.put(
  "/driverArrivedDestination",
  verifyToken,
  controller.driverArrivedDestination
);
module.exports = Router;
