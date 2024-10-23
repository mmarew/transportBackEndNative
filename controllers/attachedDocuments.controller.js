const attachedDocumentsService = require("../Services/attachedDocuments.service");
const ServerResponder = require("../Utils/ServerResponder");
const createAttachedDocuments = async (req, res) => {
  try {
    // Use req.user instead of req?.user to get user data
    const userUniqueId = req?.user?.userUniqueId;
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
          file: document.attachedDocumentName,
          status: "failed",
          reason: resultOfCreateFiles.data, // Reason for failure
        });
      } else {
        fileSuccesses.push(document.attachedDocumentName); // Track successful files
        uploadResults.push({
          file: document.attachedDocumentName,
          status: "success",
        });
      }
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
    const userUniqueId = req.params.userUniqueId;
    let ownerUserUniqueId = userUniqueId;
    if (userUniqueId == "self") ownerUserUniqueId = req.user.userUniqueId;
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

const getAttachedDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await attachedDocumentsService.getAttachedDocumentById(id);
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
    const { id } = req.params;
    const {
      userUniqueId,
      documentDescription,
      documentName,
      userDocumentListId,
    } = req.body;

    // Check for file update
    const documentPath = req.file ? req.file.path : null;

    const result = await attachedDocumentsService.updateAttachedDocument(id, {
      userUniqueId,
      documentName,
      documentDescription,
      userDocumentListId,
      documentPath,
      updatedBy: req.user?.userUniqueId, // Assuming req.user contains user data
    });

    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating attached document", error });
  }
};

const deleteAttachedDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await attachedDocumentsService.deleteAttachedDocument(id);
    if (!result) {
      return res.status(404).json({ message: "Attached document not found" });
    }
    return res
      .status(200)
      .json({ message: "Attached document deleted successfully" });
  } catch (error) {
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
  getAttachedDocumentById,
  updateAttachedDocument,
  deleteAttachedDocument,
};
