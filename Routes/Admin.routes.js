const Router = require("express").Router();
const AdminController = require("../controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Route to get all drivers
Router.get("/api/admin/drivers", AdminController.getAllDrivers);

// Route to get all passengers
Router.get("/api/admin/passengers", AdminController.getAllPassengers);

// Existing routes
Router.get(
  "/api/admin/getAllCancellations",
  AdminController.getAllCancellations
);

// New routes based on your API list
Router.get(
  "/api/admin/getCanceledByDrivers",
  AdminController.getCanceledByDrivers
);

Router.get(
  "/api/admin/getCanceledByPassenger",
  AdminController.getCanceledByPassenger
);

Router.get(
  "/api/admin/getCanceledByPassenger/:userUniqueId",
  AdminController.getCanceledByPassengerById
);

Router.get(
  "/api/admin/getCanceledByDrivers/:driverId",
  AdminController.getCanceledByDriverById
);

Router.get(
  "/api/admin/getCompletedJourney",
  AdminController.getCompletedJourney
);
// Get completed journeys by passengerId
Router.get(
  "/api/admin/getCompletedJourneyByPassenger/:passengerId",
  AdminController.getCompletedJourneyByPassenger
);

// Get completed journeys by driverId
Router.get(
  "/api/admin/getCompletedJourneyByDriver/:driverId",
  AdminController.getCompletedJourneyByDriver
);
Router.get(
  "/api/admin/getCancellationsByDate/:date",
  AdminController.getCancellationsByDate
);

Router.put(
  "/api/admin/updateCancellationReason/:cancellationId",
  AdminController.updateCancellationReason
);

Router.delete(
  "/api/admin/deleteCancellation/:cancellationId",
  AdminController.deleteCancellation
);
Router.get(
  "/getunAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getunAuthorizedDriver
);
module.exports = Router;
