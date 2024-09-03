const {
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
  getAllUserRoleStatuses,
} = require("../services/userRoleStatuse.service");

const createUserRoleStatusController = async (req, res) => {
  try {
    const response = await createUserRoleStatus(req.body);
    res.status(201).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "User role status creation failed" });
  }
};

const getUserRoleStatusController = async (req, res) => {
  try {
    const response = await getUserRoleStatus(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve user role status" });
  }
};

const updateUserRoleStatusController = async (req, res) => {
  try {
    const response = await updateUserRoleStatus(req.params.id, req.body);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "User role status update failed" });
  }
};

const deleteUserRoleStatusController = async (req, res) => {
  try {
    const response = await deleteUserRoleStatus(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "User role status deletion failed" });
  }
};

const getAllUserRoleStatusesController = async (req, res) => {
  try {
    const response = await getAllUserRoleStatuses();
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve user role statuses" });
  }
};

module.exports = {
  createUserRoleStatusController,
  getUserRoleStatusController,
  updateUserRoleStatusController,
  deleteUserRoleStatusController,
  getAllUserRoleStatusesController,
};
