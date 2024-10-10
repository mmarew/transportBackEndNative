const attachedDocumentsService = require("../services/attachedDocuments.service");

const createAttachedDocument = async (req, res) => {
  try {
    const {
      userUniqueId,
      documentDescription,
      documentName,
      userDocumentListId,
    } = req.body;

    // File details from Multer
    const documentPath = req.file ? req.file.path : null;

    if (!documentPath) {
      return res.status(400).json({ message: "No document uploaded" });
    }

    const result = await attachedDocumentsService.createAttachedDocument({
      userUniqueId,
      documentName,
      documentDescription,
      userDocumentListId,
      documentPath,
      createdBy: req.user?.userUniqueId, // Assuming req.user contains user data
    });

    return res.status(201).json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error creating attached document", error });
  }
};

const getAllAttachedDocuments = async (req, res) => {
  try {
    const result = await attachedDocumentsService.getAllAttachedDocuments();
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

module.exports = {
  createAttachedDocument,
  getAllAttachedDocuments,
  getAttachedDocumentById,
  updateAttachedDocument,
  deleteAttachedDocument,
};
