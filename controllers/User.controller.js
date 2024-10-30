const services = require("../services/User.service");
const ServerResponder = require("../Utils/ServerResponder");

const createUser = async (req, res) => {
  try {
    const response = await services.createUser(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "User creation failed",
    });
  }
};
const getUserByEmailOrNameOrPhoneNumber = async (req, res) => {
  try {
    const response = await services.getUserByEmailOrNameOrPhoneNumber(
      req.params.data
    );
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve user",
    });
  }
};
const verifyUserByOTP = async (req, res, next) => {
  try {
    ServerResponder(res, await services.verifyUserByOTP(req));
  } catch (error) {
    console.log("@verifyUserByOTP in verifyUserByOTP error", error);
    ServerResponder(res, {
      message: "error",
      data: "User creation failed",
    });
  }
};
const getUser = async (req, res) => {
  try {
    const response = await services.getUser(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve user",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const response = await services.deleteUser(req.params.userUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete user",
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const response = await services.getAllUsers();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve users",
    });
  }
};
const updateUser = async (req, res) => {
  try {
    const response = await services.updateUser(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to update user",
    });
  }
};

module.exports = {
  getUserByEmailOrNameOrPhoneNumber,
  updateUser,
  verifyUserByOTP,
  createUser,
  getUser,
  deleteUser,
  getAllUsers,
};
