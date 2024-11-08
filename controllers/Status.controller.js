const {
  createStatus,
  getStatus,
  updateStatus,
  deleteStatus,
  getAllStatuses,
} = require("../Services/Status.service");
const ServerResponder = require("../Utils/ServerResponder");
const createStatusController = async (req, res) => {
  try {
    const { statusName, statusDescription } = req.body;
    const createdStatus = await createStatus({
      statusName,
      statusDescription,
      user: req?.user,
    });
    ServerResponder(res, createdStatus);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, { message: "error", error: "Status creation failed" });
  }
};

const getStatusController = async (req, res) => {
  try {
    const response = await getStatus(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve status",
    });
  }
};

const updateStatusController = async (req, res) => {
  try {
    const response = await updateStatus(req.params.id, req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, { message: "error", error: "Status update failed" });
  }
};

const deleteStatusController = async (req, res) => {
  try {
    const response = await deleteStatus(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, { message: "error", error: "Status deletion failed" });
  }
};

const getAllStatusesController = async (req, res) => {
  try {
    const response = await getAllStatuses();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve statuses",
    });
  }
};

module.exports = {
  createStatusController,
  getStatusController,
  updateStatusController,
  deleteStatusController,
  getAllStatusesController,
};
