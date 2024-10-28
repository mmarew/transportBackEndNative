const smsSenderService = require("../Services/SMSSender.service");

const createSMSSender = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    const result = await smsSenderService.createSMSSender({
      phoneNumber,
      password,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating SMS sender:", error);
    res.status(500).json({ message: "Failed to create SMS sender" });
  }
};

const getAllSMSSenders = async (req, res) => {
  try {
    const result = await smsSenderService.getAllSMSSenders();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error retrieving SMS senders:", error);
    res.status(500).json({ message: "Failed to retrieve SMS senders" });
  }
};

const getSMSSenderById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await smsSenderService.getSMSSenderById(id);
    if (!result) {
      return res.status(404).json({ message: "SMS sender not found" });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("Error retrieving SMS sender:", error);
    res.status(500).json({ message: "Failed to retrieve SMS sender" });
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
      return res.status(404).json({ message: "SMS sender not found" });
    }
    res.status(200).json({ message: "SMS sender updated successfully" });
  } catch (error) {
    console.error("Error updating SMS sender:", error);
    res.status(500).json({ message: "Failed to update SMS sender" });
  }
};

const deleteSMSSender = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await smsSenderService.deleteSMSSender(id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "SMS sender not found" });
    }
    res.status(200).json({ message: "SMS sender deleted successfully" });
  } catch (error) {
    console.error("Error deleting SMS sender:", error);
    res.status(500).json({ message: "Failed to delete SMS sender" });
  }
};

module.exports = {
  createSMSSender,
  getAllSMSSenders,
  getSMSSenderById,
  updateSMSSender,
  deleteSMSSender,
};
