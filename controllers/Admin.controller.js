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
  searchOfflineDrivers :async (req, res) => {
  try {
    const { query } = req.params; 
    ServerResponder(res, await adminServices.searchOfflineDrivers(query));
  } catch (error) {
    console.error("Error in searchOfflineDrivers:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to search offline drivers",
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
  searchOnlineDrivers :async (req, res) => {
  try {
    const { query } = req.params; 
   
    ServerResponder(res, await adminServices.searchOnlineDrivers(query));
  } catch (error) {
    console.error("Error in searchOnlineDrivers:", error);
   ServerResponder(res, {
      message: "error",
      error: "Failed to search online drivers",
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
  searchActiveDrivers :async (req, res) => {
  try {
    const { query } = req.params; 
  
     ServerResponder(res, await adminServices.searchActiveDrivers(query));
  } catch (error) {
    console.log("Error in searchActiveDrivers:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to search active drivers",
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
  searchUnauthorizedDriver:async (req, res) => {
  try {
    const { query } = req.params; // Extract the search query from the route parameter
    // const results = await adminServices.searchUnauthorizedDriver(query);
    // return ServerResponder(res, results);
    ServerResponder(res, await adminServices.searchUnauthorizedDriver(query));
  } catch (error) {
    console.error("Error in searchUnauthorizedDriver:", error);
     ServerResponder(res, {
      message: "error",
      error: "Failed to search unauthorized drivers",
    });
  }
}

};

module.exports = AdminController;
