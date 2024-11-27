const { performJoinSelect, getData } = require("../CRUD/Read/ReadData");
const attachedDocumentsService = require("../Services/AttachedDocuments.service");
const { deleteFile } = require("../Utils/fileUtils");
const { sendNotificationToAdmin } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const createAttachedDocuments = async (req, res) => {
  try {
    console.log("@createAttachedDocuments req.body", req.body);
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    const roleId = user?.roleId;

    if (!req.files || req.files.length === 0) {
      return ServerResponder(res, {
        message: error,
        error: "No files uploaded",
      });
    }

    const uploadResults = []; // To track success or failure of each file upload
    const documentsToRegister = [];

    // Loop through all uploaded files
    req.files.forEach((file) => {
      const expirationDateKey = `${file.fieldname}ExpirationDate`; // Dynamic expiration date field name
      const descriptionKey = `${file.fieldname}Description`; // Dynamic description field name
      const typeIdKey = `${file.fieldname}TypeId`; // Dynamic type ID field name
      const fileNumberKey = `${file.fieldname}FileNumber`; // Dynamic file number field name

      const documentExpirationDate = req.body[expirationDateKey] || null;
      const attachedDocumentDescription = req.body[descriptionKey] || null;
      const documentTypeId = req.body[typeIdKey];
      const attachedDocumentFileNumber = req.body[fileNumberKey];

      if (!documentTypeId) {
        uploadResults.push({
          file: file.fieldname,
          status: "failed",
          reason: "Document type ID is required",
        });
      } else {
        documentsToRegister.push({
          fieldname: file.fieldname,
          user,
          attachedDocumentDescription,
          attachedDocumentName: file.filename, // File path where it's stored
          documentTypeId,
          documentExpirationDate,
          attachedDocumentFileNumber,
        });
      }
    });

    const fileErrors = [];
    const fileSuccesses = [];

    // Save all documents
    for (const document of documentsToRegister) {
      const resultOfCreateFiles =
        await attachedDocumentsService.createAttachedDocument({
          ...document,
          roleId,
        });
      console.log(
        "@createAttachedDocuments controller resultOfCreateFiles",
        resultOfCreateFiles
      );

      if (resultOfCreateFiles.message === "error") {
        fileErrors.push(document.attachedDocumentName); // Track failed files
        uploadResults.push({
          file: document.fieldname,
          status: "failed",
          reason: resultOfCreateFiles.error, // Reason for failure
        });
      } else {
        fileSuccesses.push(document.attachedDocumentName); // Track successful files
        uploadResults.push({
          file: document.fieldname,
          status: "success",
        });
      }
    }
    if (fileSuccesses.length > 0) {
      // get user data
      const userData = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "UserRole",
            on: "Users.userUniqueId = UserRole.userUniqueId",
          },
          {
            table: "UserRoleStatusCurrent",
            on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
          },
        ],
        conditions: {
          "Users.userUniqueId": userUniqueId,
          "UserRole.roleId": roleId,
        },
      });
      const document =
        await attachedDocumentsService.getAttachedDocumentsByUser(userUniqueId);
      const message = {
        ...userData[0],
        document,
        message: "verify users document",
      };
      sendNotificationToAdmin({ message });
    }
    // Return the detailed upload results for each file
    if (fileErrors.length > 0 && fileSuccesses.length > 0) {
      return ServerResponder(res, {
        message: "success",
        data: "some documents uploaded successfully, but some failed",
      });
    } else if (fileErrors.length > 0 && fileSuccesses.length === 0) {
      return ServerResponder(res, {
        message: "error",
        error: "all documents failed",
      });
    }
    ServerResponder(res, {
      message: "success",
      data: "documents uploaded successfully",
    });
  } catch (error) {
    console.log("Error uploading documents:", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to upload documents",
    });
  }
};

const getAttachedDocumentsByUser = async (req, res) => {
  try {
    let ownerUserUniqueId = req.params.userUniqueId;
    let userUniqueId = req.user.userUniqueId;
    if (ownerUserUniqueId == "self") ownerUserUniqueId = userUniqueId;
    const result = await attachedDocumentsService.getAttachedDocumentsByUser(
      ownerUserUniqueId
    );
    return ServerResponder(res, result);
  } catch (error) {
    console.log(" error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to see usersDocument",
    });
  }
};

const getAttachedDocumentByUniqueId = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params;
    const result = await attachedDocumentsService.getAttachedDocumentByUniqueId(
      attachedDocumentUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to see usersDocument",
    });
  }
};

const updateAttachedDocument = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params; // Extract the document ID
    const user = req?.user; // Extract the user object from the request
    const files = req.files,
      body = req.body;
    console.log("files", files);
    console.log("body", body);
    console.log("attachedDocumentUniqueId", attachedDocumentUniqueId);
    // Call the service to update the document
    const result = await attachedDocumentsService.updateAttachedDocument(
      attachedDocumentUniqueId,
      user,
      body,
      files
    );

    // Respond with the result
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error updating attached document:", error);
    ServerResponder(res, {
      message: "error",
      error: "Unable to update attached document",
    });
  }
};

const deleteAttachedDocument = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params;

    const result = await attachedDocumentsService.deleteAttachedDocument(
      attachedDocumentUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Unable to delete attached document",
    });
  }
};

const acceptRejectAttachedDocuments = async (req, res) => {
  // console.log("@acceptRejectAttachedDocuments req.body", req.body);
  const user = req?.user;
  req.body.user = user;
  const ownerUserUniqueId = req.params.userUniqueId;
  req.body.ownerUserUniqueId = ownerUserUniqueId;
  try {
    const result = await attachedDocumentsService.acceptRejectAttachedDocuments(
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@acceptRejectAttachedDocuments error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to see usersDocument",
    });
  }
};
module.exports = {
  acceptRejectAttachedDocuments,
  createAttachedDocuments,
  getAttachedDocumentsByUser,
  getAttachedDocumentByUniqueId,
  updateAttachedDocument,
  deleteAttachedDocument,
};
