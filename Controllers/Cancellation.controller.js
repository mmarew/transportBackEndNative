const Services = require("../Services/Cancellation.service");
const ServerResponder = require("../Utils/ServerResponder");

const updateCancellationReasons = async (req, res) => {
  try {
    const result = await Services.updateCancellationReason(req, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@updateCancellationReasons error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
const deleteCancellationReasons = async (req, res) => {
  const result = await Services.deleteCancellationReason(req, res);
  const responders = await ServerResponder(res, result);
};
const getCancellationReasons = async (req, res) => {
  try {
    const result = await Services.getCancellationReasons(req, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@ getCancellationReasons error", error);
    await ServerResponder(res, {
      message: "error",
      error: "something went wrong",
    });
  }
};
const addCancellationReasons = async (req, res) => {
  try {
    const result = await Services.addCancellationReason(req.body, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@addCancellationReasons error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
const getSingleCancellationReasons = async (req, res) => {
  try {
    const result = await Services.getSingleCancellationReason(req, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@getSingleCancellationReasons error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
const getAllCancellationReasons = async (req, res) => {
  try {
    const result = await Services.getAllCancellationReasons(req, res);
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllCancellationReasons error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
module.exports = {
  getSingleCancellationReasons,
  getAllCancellationReasons,
  addCancellationReasons,
  getCancellationReasons,
  deleteCancellationReasons,
  updateCancellationReasons,
};
