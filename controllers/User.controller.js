const {
  createUser,
  getUser,
  deleteUser,
  getAllUsers,
} = require("../services/User.service");
const services = require("../services/User.service");
const ServerResponder = require("../Utils/ServerResponder");

const createUserController = async (req, res) => {
  try {
    const response = await createUser(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "User creation failed",
    });
  }
};
const verifyUserByOTP = async (req, res, next) => {
  try {
    ServerResponder(res, await services.verifyUserByOTP(req));
  } catch (error) {
    console.log("error in verifyUserByOTP controller error", error);
    ServerResponder(res, {
      message: "error",
      data: "User creation failed",
    });
  }
};
const getUserController = async (req, res) => {
  try {
    const response = await getUser(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve user",
    });
  }
};

const deleteUserController = async (req, res) => {
  try {
    const response = await deleteUser(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to delete user",
    });
  }
};

const getAllUsersController = async (req, res) => {
  try {
    const response = await getAllUsers();
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      data: "Failed to retrieve users",
    });
  }
};

module.exports = {
  verifyUserByOTP,
  createUserController,
  getUserController,
  deleteUserController,
  getAllUsersController,
};
