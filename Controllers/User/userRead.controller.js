"use strict";



// import uuidv4
// import uuidv4


const services = require("../Services/User.service");

const ServerResponder = require("../Utils/ServerResponder");









//in create user fullname must be existe for driver roles.


const getUserByFilterDetailed = async (req, res, next) => {
  try {
    const userUniqueId = req?.query?.userUniqueId;
    if (userUniqueId === "self") {
      req.query.userUniqueId = req?.user?.userUniqueId;
    }

    // Accept filters via query string, and optional pagination
    const filters = req.query || {};
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    // include role/status information by default (do not expect includeRoles from client)
    const response = await services.getUserByFilterDetailed(filters, page, limit);
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserByFilterDetailed
};
