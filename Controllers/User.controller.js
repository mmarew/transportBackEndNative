const path = require("path");
// import uuidv4
const { v4: uuidv4 } = require("uuid");
const {
  updateAttachedDocument,
  createAttachedDocument,
} = require("../Services/AttachedDocuments.service");
const services = require("../Services/User.service");
const { uploadToFTP } = require("../Utils/FTPHandler");
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

const loginUser = async (req, res) => {
  try {
    const response = await services?.loginUser(
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
const getUserByUserUniqueIdAndRoleUniqueId = async (req, res) => {
  try {
    const response = await services.getUserByUserUniqueIdAndRoleUniqueId(
      req.params.userUniqueId,
      req.params.roleUniqueId
    );
    console.log("@getUserByUserUniqueIdAndRoleUniqueId response", response);
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

const getUserByFilterDetailed = async (req, res) => {
  try {
    // Accept filters via query string, and optional pagination
    const filters = req.query || {};
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    // include role/status information by default (do not expect includeRoles from client)
    const response = await services.getUserByFilterDetailed(
      filters,
      page,
      limit
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

const updateUser = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    // self means the user is updating himself,so userUniqueId is the same as ownerUserUniqueId
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
    console.log("textResponse", textResponse);

    // Handle file upload if files are provided
    if (req.files && req.files.length > 0) {
      const {
        attachedDocumentUniqueId,
        profilePhotoTypeId,
        ProfilePhotoDescription,
        ProfilePhotoExpirationDate,
      } = body;

      // --- FTP UPLOAD LOGIC ---
      const file = req.files[0]; // Get the first uploaded file

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const uniqueFilename = `${user.userId}_${uuidv4()}${fileExtension}`;

      let fileUrl; // Variable to store the FTP file URL

      try {
        // Upload to FTP server - pass the buffer and unique filename
        fileUrl = await uploadToFTP(file.buffer, uniqueFilename);
        console.log("File uploaded to FTP. URL:", fileUrl);
      } catch (ftpError) {
        console.error("FTP Upload failed:", ftpError);
        // If FTP upload fails, respond with error but text update may have succeeded
        return ServerResponder(res, {
          message: "partial_success",
          error:
            "User information updated, but failed to upload profile image to server.",
        });
      }
      // --- END FTP UPLOAD LOGIC ---

      // Validate attachedDocumentUniqueId
      if (
        !attachedDocumentUniqueId ||
        attachedDocumentUniqueId === "undefined" ||
        attachedDocumentUniqueId === "null"
      ) {
        // Create a new attached document with FTP URL
        const fileResponse = await createAttachedDocument({
          attachedDocumentDescription: ProfilePhotoDescription,
          attachedDocumentName: fileUrl, // Use the FTP URL instead of local path
          documentTypeId: profilePhotoTypeId,
          documentExpirationDate: ProfilePhotoExpirationDate,
          roleId: user.roleId,
          user,
          userUniqueId: ownerUserUniqueId,
        });
        console.log("fileResponse", fileResponse);
        updateResponses.fileUpdate = fileResponse.message;
      } else {
        // Update the existing attached document with new FTP URL
        const fileResponse = await updateAttachedDocument(
          attachedDocumentUniqueId,
          user,
          body,
          [fileUrl] // Pass the new URL to the update function
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
        message: "partial_success",
        error: "User information updated, but failed to update profile image.",
      });
    }

    if (textUpdate === "error" && fileUpdate === "success") {
      return ServerResponder(res, {
        message: "partial_success",
        error: "Profile image updated, but failed to update user information.",
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

// // update user using multer disk storage
// const updateUser = async (req, res) => {
//   try {
//     const user = req?.user;
//     const userUniqueId = user?.userUniqueId;
//     // self means the user is updating himself,so userUniqueId is the same as ownerUserUniqueId
//     const ownerUserUniqueId =
//       req?.params?.ownerUserUniqueId == "self"
//         ? userUniqueId
//         : req?.params?.ownerUserUniqueId;
//     const roleId = user?.roleId;
//     const body = { ...req.body, userUniqueId: ownerUserUniqueId, roleId };

//     // Initialize response tracker
//     const updateResponses = { textUpdate: "success", fileUpdate: "success" };

//     // Update user text information
//     const textResponse = await services.updateUser(body);
//     updateResponses.textUpdate = textResponse.message;
//     console.log("textResponse", textResponse);
//     // Handle file upload if files are provided
//     if (req.files && req.files.length > 0) {
//       const {
//         attachedDocumentUniqueId,
//         profilePhotoTypeId,
//         ProfilePhotoDescription,
//         ProfilePhotoExpirationDate,
//       } = body;

//       // Validate attachedDocumentUniqueId
//       if (
//         !attachedDocumentUniqueId ||
//         attachedDocumentUniqueId === "undefined" ||
//         attachedDocumentUniqueId === "null"
//       ) {
//         // Create a new attached document
//         const fileResponse = await createAttachedDocument({
//           attachedDocumentDescription: ProfilePhotoDescription,
//           attachedDocumentName: req.files[0].filename,
//           documentTypeId: profilePhotoTypeId,
//           documentExpirationDate: ProfilePhotoExpirationDate,
//           roleId: user.roleId,
//           user,
//           userUniqueId: ownerUserUniqueId,
//         });
//         console.log("fileResponse", fileResponse);
//         updateResponses.fileUpdate = fileResponse.message;
//       } else {
//         // Update the existing attached document
//         const fileResponse = await updateAttachedDocument(
//           attachedDocumentUniqueId,
//           user,
//           body,
//           req.files
//         );
//         console.log("fileResponse", fileResponse);
//         updateResponses.fileUpdate = fileResponse.message;
//       }
//     } else {
//       updateResponses.fileUpdate = "success";
//     }

//     // Consolidate response based on update results
//     const { textUpdate, fileUpdate } = updateResponses;

//     if (textUpdate === "success" && fileUpdate === "success") {
//       return ServerResponder(res, textResponse); // Both updates successful
//     }

//     if (textUpdate === "success" && fileUpdate === "error") {
//       return ServerResponder(res, {
//         message: "error",
//         error:
//           "Failed to update profile image, but other information updated successfully.",
//       });
//     }

//     if (textUpdate === "error" && fileUpdate === "success") {
//       return ServerResponder(res, {
//         message: "error",
//         error:
//           "Failed to update user information, but profile image updated successfully.",
//       });
//     }

//     return ServerResponder(res, {
//       message: "error",
//       error: "Failed to update both user information and profile image.",
//     });
//   } catch (error) {
//     console.error("Error updating user profile:", error);
//     return ServerResponder(res, {
//       message: "error",
//       error: "Failed to update user profile due to an unexpected error.",
//     });
//   }
// };
const createUserByAdminOrSuperAdmin = async (req, res) => {
  try {
    const response = await services.createUserByAdminOrSuperAdmin({
      body: req.body,
      userUniqueId: req?.user?.userUniqueId,
    });
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create user",
    });
  }
};
module.exports = {
  createUserByAdminOrSuperAdmin,
  getUsersByRoleUniqueId,
  getUserByUserUniqueIdAndRoleUniqueId,
  updateUser,
  verifyUserByOTP,
  createUser,
  getUser,
  deleteUser,
  getUserByFilterDetailed,
  loginUser,
};
