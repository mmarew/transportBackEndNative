const { performJoinSelect } = require("../CRUD/Read/ReadData");
const attachedDocumentsService = require("../Services/attachedDocuments.service");
const { sendNotificationToAdmin } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const createAttachedDocuments = async (req, res) => {
  try {
    const user = req?.user;
    // Use req.user instead of req?.user to get user data
    const userUniqueId = user?.userUniqueId;
    const roleId = user?.roleId;
    const createdByUserId = userUniqueId;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const uploadResults = []; // To track success or failure of each file upload
    const documentsToRegister = [];

    // Loop through all uploaded files
    req.files.forEach((file) => {
      const expirationDateKey = `${file.fieldname}ExpirationDate`; // Dynamic expiration date field name
      const typeIdKey = `${file.fieldname}TypeId`; // Dynamic type ID field name
      const descriptionKey = `${file.fieldname}Description`; // Dynamic description field name

      const documentExpirationDate = req.body[expirationDateKey] || null;
      const attachedDocumentDescription = req.body[descriptionKey] || null;
      const documentTypeId = req.body[typeIdKey];

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
          userUniqueId,
          attachedDocumentDescription,
          attachedDocumentName: file.filename, // File path where it's stored
          documentTypeId,
          documentExpirationDate,
          createdByUserId,
        });
      }
    });

    const fileErrors = [];
    const fileSuccesses = [];

    // Save all documents
    for (const document of documentsToRegister) {
      const resultOfCreateFiles =
        await attachedDocumentsService.createAttachedDocument({ ...document });

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
            on: "users.userUniqueId = UserRole.userUniqueId",
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
    return res.status(200).json({
      message: "Upload completed",
      data: uploadResults, // Contains detailed info about each file (success or failure)
    });
  } catch (error) {
    console.error("Error uploading documents:", error);
    return res
      .status(500)
      .json({ message: "Error uploading documents", error });
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
    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching attached documents", error });
  }
};

const getAttachedDocumentByUniqueId = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params;
    const result = await attachedDocumentsService.getAttachedDocumentByUniqueId(
      attachedDocumentUniqueId
    );
    if (!result) {
      return res.status(404).json({ message: "Attached document not found" });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching attached document", error });
  }
};

const updateAttachedDocument = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params;
    const {
      userUniqueId,
      documentDescription,
      documentTypeId,
      documentExpirationDate,
    } = req.body;

    // Check if files were uploaded
    let attachedDocumentName = null;
    if (req.files && req.files.length > 0) {
      const file = req.files[0]; // Assuming only one file is uploaded
      attachedDocumentName = file.filename; // Store the file name of the uploaded file
    }

    // Pass file details and body data to the service for handling
    const result = await attachedDocumentsService.updateAttachedDocument(
      attachedDocumentUniqueId,
      {
        userUniqueId,
        documentDescription,
        documentTypeId,
        documentExpirationDate,
        attachedDocumentName, // Pass the file name if available
        updatedByUserId: req.user?.userUniqueId, // Assuming req.user contains user data
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    console.log("error", error);
    return res
      .status(500)
      .json({ message: "Error updating attached document", error });
  }
};

const deleteAttachedDocument = async (req, res) => {
  try {
    const { attachedDocumentUniqueId } = req.params;

    const result = await attachedDocumentsService.deleteAttachedDocument(
      attachedDocumentUniqueId
    );
    if (!result) {
      return res.status(404).json({ message: "Attached document not found" });
    }
    return res
      .status(200)
      .json({ message: "Attached document deleted successfully" });
  } catch (error) {
    console.log("first error", error);
    return res
      .status(500)
      .json({ message: "Error deleting attached document", error });
  }
};

const acceptRejectAttachedDocuments = async (req, res) => {
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
    console.log("error", error);
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
