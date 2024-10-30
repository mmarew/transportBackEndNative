const Services = require("../Services/Cancilation.service");
const ServerResponder = require("../Utils/ServerResponder");

const updateCancilationReasons = async (req, res) => {
  const result = await Services.updateCancellationReason(req, res);
  const responders = await ServerResponder(res, result);
};
const deleteCancilationReasons = async (req, res) => {
  const result = await Services.deleteCancellationReason(req, res);
  const responders = await ServerResponder(res, result);
};
const getCancilationReasons = async (req, res) => {
  const result = await Services.getCancellationReasons(req, res);
  const responders = await ServerResponder(res, result);
};
const addCancilationReasons = async (req, res) => {
  try {
    const result = await Services.addCancellationReason(req, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@addCancilationReasons error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
module.exports = {
  addCancilationReasons,
  getCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
};
