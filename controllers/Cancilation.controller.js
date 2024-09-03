const Services = require("../services/Cancilation.service");
const ServerResponder = require("../Utils/ServerResponder");

const updateCancilationReasons = async (req, res) => {
  const result = await Services.updateCancilationReasons(req, res);
  const responders = await ServerResponder(res, result);
};
const deleteCancilationReasons = async (req, res) => {
  const result = await Services.deleteCancilationReasons(req, res);
  const responders = await ServerResponder(res, result);
};
const getCancilationReasons = async (req, res) => {
  const result = await Services.getCancilationReasons(req, res);
  const responders = await ServerResponder(res, result);
};
const addCancilationReasons = async (req, res) => {
  try {
    const result = await Services.addCancilationReasons(req, res);

    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
module.exports = {
  addCancilationReasons,
  getCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
};
