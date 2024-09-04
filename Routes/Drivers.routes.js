const controller = require("../controllers/Driver.controller");
const Router = require("express").Router();

Router.get("/", controller.checkGetMethodes);
const upload = require("../Config/multerConfig");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

Router.delete("/deleteTablesData", controller.deleteTablesData);
Router.put(
  "/drivers/cancelRequest",
  verifyTokenOfAxios,
  controller.cancelRequest
);
Router.post(
  "/drivers/registerDriverToGetPassengerRequest",
  verifyTokenOfAxios,
  controller.registerDriverToGetPassengerRequest
);

//  rejectPassangersRequest, acceptPassangersRequest;
Router.put(
  "/rejectPassangersRequest",
  verifyTokenOfAxios,
  controller.rejectPassangersRequest
);
// 6120
Router.put(
  "/acceptPassangersRequest",
  verifyTokenOfAxios,
  controller.acceptPassangersRequest
);
Router.put("/startJourney", verifyTokenOfAxios, controller.startJourney);
Router.put(
  "/driverArrivedDestination",
  verifyTokenOfAxios,
  controller.driverArrivedDestination
);
module.exports = Router;
