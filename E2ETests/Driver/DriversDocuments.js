const { backendURL } = require("../constants");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const createDriverDocument = async (token, documentType) => {
  const form = new FormData();

  const dummyFilePath = path.join(__dirname, "../dummy.txt");
  const fileBuffer = fs.readFileSync(dummyFilePath);
  form.append(
    documentType.uploadedDocumentName,
    new Blob([fileBuffer]),
    "dummy.txt",
  );

  form.append(documentType.uploadedDocumentTypeId, documentType.documentTypeId);

  if (documentType.isFileNumberRequired === 1) {
    form.append(documentType.uploadedDocumentFileNumber, "FILE-" + Date.now());
  }

  if (documentType.isExpirationDateRequired === 1) {
    form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
  }

  if (documentType.isDescriptionRequired === 1) {
    form.append(
      documentType.uploadedDocumentDescription,
      "Dummy test description",
    );
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    await axios.post(
      backendURL + "/api/user/attachDocuments/self",
      form,
      config,
    );
    console.log(`✅ Uploaded User Document: ${documentType.documentTypeName}`);
  } catch (error) {
    console.log(`❌ Failed to upload user document: ${documentType.documentTypeName}`);
    console.log("Error:", error.response?.data?.error || error.message);
  }
};

module.exports = {
  createDriverDocument,
};