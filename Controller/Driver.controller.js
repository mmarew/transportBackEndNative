const services = require("../Service/Driver.service");
const ServerResponder = require("../Utils/ServerResponder");

const checkGetMethodes = async (req, res, next) => {
  ServerResponder(res, await services.checkGetMethodes());
};
const registerDriver = async (req, res, next) => {
  // console.log("registerDriver", req.body);
  ServerResponder(res, await services.registerDriver(req));
};
const verifyDriverByOTP = async (req, res, next) => {
  ServerResponder(res, await services.verifyDriverByOTP(req));
};

const cancelRequest = async (req, res, next) => {
  ServerResponder(res, await services.cancelRequest(req));
};
const registerDriverToGetPassengerRequest = async (req, res, next) => {
  ServerResponder(res, await services.registerDriverToGetPassengerRequest(req));
};
const verifyStatusOfDriver = async (req, res, next) => {
  ServerResponder(res, await services.verifyStatusOfDriver(req));
};
const acceptPassangersRequest = async (req, res) => {
  ServerResponder(res, await services.acceptPassangersRequest(req));
};

const rejectPassangersRequest = async (req, res) => {
  ServerResponder(res, await services.rejectPassangersRequest(req));
};
const startJourney = async (req, res) => {
  ServerResponder(res, await services.startJourney(req));
};
const driverArrivedDestination = async (req, res) => {
  ServerResponder(res, await services.driverArrivedDestination(req));
};
const deleteTablesData = async (req, res) => {
  ServerResponder(res, await services.deleteTablesData(req));
};
module.exports = {
  driverArrivedDestination,
  startJourney,
  rejectPassangersRequest,
  acceptPassangersRequest,
  verifyStatusOfDriver,
  registerDriverToGetPassengerRequest,
  registerDriver,
  checkGetMethodes,
  verifyDriverByOTP,
  cancelRequest,
  deleteTablesData,
};
