const {
  createStatus,
  getStatus,
  updateStatus,
  deleteStatus,
  getAllStatuses,
} = require("../services/Status.service");

const createStatusController = async (req, res) => {
  try {
    const response = await createStatus(req.body);
    res.status(201).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Status creation failed" });
  }
};

const getStatusController = async (req, res) => {
  try {
    const response = await getStatus(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve status" });
  }
};

const updateStatusController = async (req, res) => {
  try {
    const response = await updateStatus(req.params.id, req.body);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Status update failed" });
  }
};

const deleteStatusController = async (req, res) => {
  try {
    const response = await deleteStatus(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Status deletion failed" });
  }
};

const getAllStatusesController = async (req, res) => {
  try {
    const response = await getAllStatuses();
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve statuses" });
  }
};

module.exports = {
  createStatusController,
  getStatusController,
  updateStatusController,
  deleteStatusController,
  getAllStatusesController,
};
