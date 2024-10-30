const {
  createStatus,
  getStatus,
  updateStatus,
  deleteStatus,
  getAllStatuses,
} = require("../services/Status.service");
const { statusList } = require("../Utils/listOfFixedData");
const createStatusController = async (req, res) => {
  try {
    const results = [];
    const errors = [];

    for (const status of statusList) {
      try {
        const createdRole = await createStatus({
          ...status,
          user: req?.user,
        });
        if (createdRole.message == "success") {
          results.push({ status, message: "Status inserted successfully" });
        } else {
          errors.push({ status, error: createdRole.error });
        }
      } catch (error) {
        console.error("Error inserting status:", error);
        errors.push({ status, error: "Failed to insert status" });
      }
    }

    if (errors.length > 0) {
      return res.status(207).json({
        message: "Some statuses failed to insert",
        insertedStatuses: results,
        failedStatuses: errors,
      });
    }

    return res.status(201).json({
      message: "All statuses inserted successfully",
      data: results,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Status creation failed" });
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
