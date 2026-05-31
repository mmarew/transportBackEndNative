const { default: axios } = require("axios");
const {
  ATTACHED_DOCUMENTS_ENDPOINTS,
} = require("../../Routes/EndPoints/attachedDocuments.endpoints");
const { unAuthorizedDriver, backendURL, usersData } = require("../constants");

const authorizeDriversDocuments = async () => {
  try {
    const pendingDocuments =
      unAuthorizedDriver.driver?.data?.[0]?.attachedDocumentsByStatus?.PENDING;
    console.log(
      "🚀 ~ authorizeDriversDocuments ~ pendingDocuments:",
      pendingDocuments,
    );

    const endpoints =
      ATTACHED_DOCUMENTS_ENDPOINTS.ADMIN_ACCEPT_REJECT_DOCUMENTS;
    //put {{url}}/api/admin/acceptRejectAttachedDocuments
    await Promise.all(
      pendingDocuments.map(async (pendingDocument) => {
        const attachedDocumentUniqueId = pendingDocument.attachedDocumentUniqueId;

        const payload = {
          roleId: pendingDocument.roleId,  // use the actual roleId from the document
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

        console.log(
          "🚀 ~ authorizeDriversDocuments ~ approvalResult:",
          approvalResult.data,
        );
      }),
    );
  } catch (error) {
    console.log(
      "❌ Error in authorizeDriversDocuments:",
      error.message || error,
    );
  }
};
module.exports = { authorizeDriversDocuments };
