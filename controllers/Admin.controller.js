const adminServices = require("../Services/Admin.service");
const ServerResponder = require("../Utils/ServerResponder");

const AdminController = {
  // Fetch completed journeys
  getCompletedJourney: async (req, res) => {
    ServerResponder(res, await adminServices.getCompletedJourney(req));
  },
  getunAuthorizedDriver: async (req, res) => {
    ServerResponder(res, await adminServices.getUnauthorizedDriver(req));
  },
};

module.exports = AdminController;
