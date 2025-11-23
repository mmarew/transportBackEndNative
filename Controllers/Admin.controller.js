const adminServices = require("../Services/Admin.service");
const ServerResponder = require("../Utils/ServerResponder");

const AdminController = {
  // Fetch online drivers

  getOfflineDrivers: async (req, res) => {
    console.log("get offline drivers");
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
    console.log("get all active drivers");
    try {
      const result = await adminServices.getAllActiveDrivers(req);
      ServerResponder(res, result);
    } catch (error) {
      console.error("Error in getAllActiveDrivers:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch active drivers",
      });
    }
  },

  getUnAuthorizedDriver: async (req, res) => {
    try {
      ServerResponder(
        res,
        await adminServices.getUnauthorizedDriver(req?.query)
      );
    } catch (error) {
      console.log("Error in getUnAuthorizedDriver:", error);
      ServerResponder(res, {
        message: "error",
        error: "Failed to fetch unauthorized drivers",
      });
    }
  },
};

module.exports = AdminController;
