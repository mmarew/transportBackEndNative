const {
  updateAttachedDocument,
  createAttachedDocument,
} = require("../Services/AttachedDocuments.service");
const services = require("../Services/User.service");
const ServerResponder = require("../Utils/ServerResponder");

const createUser = async (req, res) => {
  try {
    const response = await services.createUser(req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "User creation failed",
    });
  }
};
const getUsersByRoleUniqueId = async (req, res) => {
  try {
    const response = await services.getUsersByRoleUniqueId(
      req.params.roleUniqueId
    );
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve users",
    });
  }
};

const getUserByEmailOrNameOrPhoneNumber = async (req, res) => {
  try {
    const response = await services.getUserByEmailOrNameOrPhoneNumber(
      req.params.data,
      req.params.roleId
    );
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve user",
    });
  }
};
const loginUser = async (req, res) => {
  try {
    const response = await services.loginUser(
      req.params.phoneNumber,
      req.params.roleId
    );
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve user",
    });
  }
};
const getUserByUserUniqueIdAndroleUniqueId = async (req, res) => {
  try {
    const response = await services.getUserByUserUniqueIdAndroleUniqueId(
      req.params.userUniqueId,
      req.params.roleUniqueId
    );
    console.log("@getUserByUserUniqueIdAndroleUniqueId response", response);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve user",
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
      error: "User creation failed",
    });
  }
};
const getUser = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId =
      req.params.ownerUserUniqueId == "self"
        ? userUniqueId
        : req.params.ownerUserUniqueId;
    console.log("@getUser ownerUserUniqueId", ownerUserUniqueId);
    const response = await services.getUserByUserUniqueId(ownerUserUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve user",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const response = await services.deleteUser(req.params.userUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete user",
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const response = await services.getAllUsers();
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve users",
    });
  }
};
const updateUser = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId =
      req?.params?.ownerUserUniqueId == "self"
        ? userUniqueId
        : req?.params?.ownerUserUniqueId;
    const roleId = user?.roleId;
    const body = { ...req.body, userUniqueId: ownerUserUniqueId, roleId };

    // Initialize response tracker
    const updateResponses = { textUpdate: "success", fileUpdate: "success" };

    // Update user text information
    const textResponse = await services.updateUser(body);
    updateResponses.textUpdate = textResponse.message;
    // console.log("textResponse", textResponse);
    // Handle file upload if files are provided
    if (req.files && req.files.length > 0) {
      const {
        attachedDocumentUniqueId,
        ProfilePhotoTypeId,
        ProfilePhotoDescription,
        ProfilePhotoExpirationDate,
      } = body;

      // Validate attachedDocumentUniqueId
      if (
        !attachedDocumentUniqueId ||
        attachedDocumentUniqueId === "undefined" ||
        attachedDocumentUniqueId === "null"
      ) {
        // Create a new attached document
        const fileResponse = await createAttachedDocument({
          attachedDocumentDescription: ProfilePhotoDescription,
          attachedDocumentName: req.files[0].filename,
          documentTypeId: ProfilePhotoTypeId,
          documentExpirationDate: ProfilePhotoExpirationDate,
          roleId: user.roleId,
          user,
        });
        console.log("fileResponse", fileResponse);
        updateResponses.fileUpdate = fileResponse.message;
      } else {
        // Update the existing attached document
        const fileResponse = await updateAttachedDocument(
          attachedDocumentUniqueId,
          user,
          body,
          req.files
        );
        console.log("fileResponse", fileResponse);
        updateResponses.fileUpdate = fileResponse.message;
      }
    } else {
      updateResponses.fileUpdate = "success";
    }

    // Consolidate response based on update results
    const { textUpdate, fileUpdate } = updateResponses;

    if (textUpdate === "success" && fileUpdate === "success") {
      return ServerResponder(res, textResponse); // Both updates successful
    }

    if (textUpdate === "success" && fileUpdate === "error") {
      return ServerResponder(res, {
        message: "error",
        error:
          "Failed to update profile image, but other information updated successfully.",
      });
    }

    if (textUpdate === "error" && fileUpdate === "success") {
      return ServerResponder(res, {
        message: "error",
        error:
          "Failed to update user information, but profile image updated successfully.",
      });
    }

    return ServerResponder(res, {
      message: "error",
      error: "Failed to update both user information and profile image.",
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return ServerResponder(res, {
      message: "error",
      error: "Failed to update user profile due to an unexpected error.",
    });
  }
};

module.exports = {
  getUserByEmailOrNameOrPhoneNumber,
  getUsersByRoleUniqueId,
  getUserByUserUniqueIdAndroleUniqueId,
  updateUser,
  verifyUserByOTP,
  createUser,
  getUser,
  deleteUser,
  getAllUsers,
  loginUser,
};
