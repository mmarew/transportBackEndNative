const { default: axios } = require("axios");
const {
  ATTACHED_DOCUMENTS_ENDPOINTS,
} = require("../../Routes/EndPoints/attachedDocuments.endpoints");
const { unAuthorizedDriver, backendURL, usersData } = require("../constants");

const authorizeDriversDocuments = async () => {
  try {
    const pendingDocuments =
      unAuthorizedDriver.driver?.data?.[0]?.attachedDocumentsByStatus?.PENDING;
    
    if (!pendingDocuments || pendingDocuments.length === 0) {
      console.log("⏩ No pending documents to authorize");
      return;
    }

    console.log(`📋 Found ${pendingDocuments.length} pending documents to authorize`);

    const endpoints =
      ATTACHED_DOCUMENTS_ENDPOINTS.ADMIN_ACCEPT_REJECT_DOCUMENTS;
    
    await Promise.all(
      pendingDocuments.map(async (pendingDocument) => {
        const attachedDocumentUniqueId = pendingDocument.attachedDocumentUniqueId;

        const payload = {
          roleId: pendingDocument.roleId,
          attachedDocumentUniqueId: attachedDocumentUniqueId,
          action: "ACCEPTED",
          reason: "Document is valid and accepted.",
        };
        
        const approvalResult = await axios.put(backendURL + endpoints, payload, {
          headers: {
            Authorization: `Bearer ${usersData.admin.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        console.log(`✅ Approved: ${pendingDocument.documentTypeName}`);
      }),
    );
    
    console.log("✅ All pending documents authorized");
  } catch (error) {
    console.log(
      "❌ Error in authorizeDriversDocuments:",
      error.response?.data?.error || error.message,
    );
  }
};
module.exports = { authorizeDriversDocuments };
