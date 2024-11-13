const smsSenderService = require("../Services/SMSSender.service");
const ServerResponder = require("../Utils/ServerResponder");
// controller createSMSSender
const createSMSSender = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    console.log("first", phoneNumber, "password", password);
    const result = await smsSenderService.createSMSSender({
      phoneNumber,
      password,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating SMS sender:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create SMS sender",
    });
  }
};

const getAllSMSSenders = async (req, res) => {
  try {
    const result = await smsSenderService.getAllSMSSenders();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error retrieving SMS senders:", error);
    ServerResponder(res, { message: "Failed to retrieve SMS senders" });
  }
};

const getSMSSenderById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await smsSenderService.getSMSSenderById(id);
    if (!result) {
      return res.status(404).json({ message: "SMS sender not found" });
    }
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error retrieving SMS sender:", error);
    ServerResponder(res, { message: "Failed to retrieve SMS sender" });
  }
};

const updateSMSSender = async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, password } = req.body;
    const result = await smsSenderService.updateSMSSender(id, {
      phoneNumber,
      password,
    });
    if (result.affectedRows === 0) {
      return ServerResponder(res, { message: "SMS sender not found" });
    }
    ServerResponder(res, { message: "SMS sender updated successfully" });
  } catch (error) {
    console.log("Error updating SMS sender:", error);
    ServerResponder(res, { message: "Failed to update SMS sender" });
  }
};

const deleteSMSSender = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await smsSenderService.deleteSMSSender(id);
    if (result.affectedRows === 0) {
      ServerResponder(res, { message: "SMS sender not found" });
    }
    ServerResponder(res, { message: "SMS sender deleted successfully" });
  } catch (error) {
    console.log("Error deleting SMS sender:", error);
    ServerResponder(res, { message: "Failed to delete SMS sender" });
  }
};

module.exports = {
  createSMSSender,
  getAllSMSSenders,
  getSMSSenderById,
  updateSMSSender,
  deleteSMSSender,
};
