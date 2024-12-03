const adminServices = require("../Services/Admin.service");
const ServerResponder = require("../Utils/ServerResponder");

const AdminController = {
  // Fetch online drivers
  getOfflineDrivers: async (req, res) => {
    try {
      ServerResponder(res, await adminServices.getOfflineDrivers(req));
    } catch (error) {
      console.log("Error in getOfflineDrivers:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch offline drivers",
      });
    }
  },
  getOnlineDrivers: async (req, res) => {
    try {
      ServerResponder(res, await adminServices.getOnlineDrivers(req));
    } catch (error) {
      console.log("Error in getOnlineDrivers:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch online drivers",
      });
    }
  },
  getAllActiveDrivers: async (req, res) => {
    try {
      ServerResponder(res, await adminServices.getAllActiveDrivers(req));
    } catch (error) {
      console.log("Error in getAllActiveDrivers:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch active drivers",
      });
    }
  },
  // Fetch completed journeys
  getCompletedJourney: async (req, res) => {
    try {
      ServerResponder(res, await adminServices.getCompletedJourney(req));
    } catch (error) {
      console.log("Error in getCompletedJourney:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch completed journeys",
      });
    }
  },
  getunAuthorizedDriver: async (req, res) => {
    try {
      ServerResponder(res, await adminServices.getUnauthorizedDriver(req));
    } catch (error) {
      console.log("Error in getunAuthorizedDriver:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch unauthorized drivers",
      });
    }
  },
};

module.exports = AdminController;
