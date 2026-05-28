const { backendURL } = require("../constants");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const createDriverDocument = async (token, documentType) => {
  const form = new FormData();

  // 1. Attach the file itself (using the dynamic key name from documentType)
  const dummyFilePath = path.join(__dirname, "../dummy.txt");
  form.append(
    documentType.uploadedDocumentName,
    fs.createReadStream(dummyFilePath),
  );

  // 2. Attach the Document Type ID (using the dynamic key name)
  form.append(documentType.uploadedDocumentTypeId, documentType.documentTypeId);

  // 3. Attach File Number if required
  if (documentType.isFileNumberRequired === 1) {
    form.append(documentType.uploadedDocumentFileNumber, "FILE-" + Date.now());
  }

  // 4. Attach Expiration Date if required
  if (documentType.isExpirationDateRequired === 1) {
    form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
  }

  // 5. Attach Description if required
  if (documentType.isDescriptionRequired === 1) {
    form.append(
      documentType.uploadedDocumentDescription,
      "Dummy test description",
    );
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(), // Crucial for multipart/form-data with Node.js Axios
    },
  };

  try {
    const res = await axios.post(
      backendURL + "/api/user/attachDocuments/self",
      form,
      config,
    );
    console.log(`✅ Success! Uploaded ${documentType.documentTypeName}:`);
    console.log(res.data);
  } catch (error) {
    console.log(`❌ Failed to upload ${documentType.documentTypeName}.`);
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
  }
};

module.exports = {
  createDriverDocument,
};