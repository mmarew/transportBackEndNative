const adminServices = require("../services/Admin.service");
const ServerResponder = require("../Utils/ServerResponder");

const AdminController = {
  // Fetch all cancellations
  getAllCancellations: async (req, res) => {
    ServerResponder(res, await adminServices.getAllCancellations(req));
  },

  // Fetch cancellations by drivers
  getCanceledByDrivers: async (req, res) => {
    ServerResponder(res, await adminServices.getCanceledByDrivers(req));
  },

  // Fetch cancellations by passengers
  getCanceledByPassenger: async (req, res) => {
    ServerResponder(res, await adminServices.getCanceledByPassenger(req));
  },

  // Fetch cancellations by a specific passenger
  getCanceledByPassengerById: async (req, res) => {
    const { userUniqueId } = req.params;
    ServerResponder(
      res,
      await adminServices.getCanceledByPassengerById(userUniqueId, req)
    );
  },

  // Fetch cancellations by a specific driver
  getCanceledByDriverById: async (req, res) => {
    const { driverId } = req.params;
    ServerResponder(
      res,
      await adminServices.getCanceledByDriverById(driverId, req)
    );
  },

  // Fetch completed journeys
  getCompletedJourney: async (req, res) => {
    ServerResponder(res, await adminServices.getCompletedJourney(req));
  },
  getCompletedJourneyByPassenger: async (req, res) => {
    const { passengerId } = req.params;
    ServerResponder(
      res,
      await adminServices.getCompletedJourneyByPassenger(passengerId)
    );
  },

  // Get completed journeys by driverId
  getCompletedJourneyByDriver: async (req, res) => {
    const { driverId } = req.params;
    ServerResponder(
      res,
      await adminServices.getCompletedJourneyByDriver(driverId)
    );
  },

  // Fetch cancellations by a specific date
  getCancellationsByDate: async (req, res) => {
    const { date } = req.params;
    ServerResponder(res, await adminServices.getCancellationsByDate(date, req));
  },

  // Update the cancellation reason for a specific cancellation ID
  updateCancellationReason: async (req, res) => {
    const { cancellationId } = req.params;
    const { reason } = req.body;
    ServerResponder(
      res,
      await adminServices.updateCancellationReason(cancellationId, reason, req)
    );
  },

  // Delete a specific cancellation record
  deleteCancellation: async (req, res) => {
    const { cancellationId } = req.params;
    ServerResponder(
      res,
      await adminServices.deleteCancellation(cancellationId, req)
    );
  },
  getunAuthorizedDriver: async (req, res) => {
    ServerResponder(res, await adminServices.getunAuthorizedDriver(req));
  },
  getAllPassengers: async (req, res) => {
    ServerResponder(res, await adminServices.getUsersByRole(1));
  },
  getAllDrivers: async (req, res) => {
    ServerResponder(res, await adminServices.getUsersByRole(2));
  },
};

module.exports = AdminController;
