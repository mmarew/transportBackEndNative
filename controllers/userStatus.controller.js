// controllers/UserStatusController.js
const {
  registerUserStatus,
  getUserStatus,
  deleteUserStatus,
  updateUserStatus,
} = require("../services/userStatus.service");
const ServerResponder = require("../Utils/ServerResponder");

const registerUserStatusController = async (req, res) => {
  try {
    const response = await registerUserStatus(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "User status registration failed",
    });
  }
};

const getUserStatusController = async (req, res) => {
  try {
    const response = await getUserStatus();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve user status",
    });
  }
};

const deleteUserStatusController = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await deleteUserStatus(id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete user status",
    });
  }
};

const updateUserStatusController = async (req, res) => {
  try {
    const { id } = req.params;
    const response = await updateUserStatus(id, req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to update user status",
    });
  }
};

module.exports = {
  registerUserStatusController,
  getUserStatusController,
  deleteUserStatusController,
  updateUserStatusController,
};
