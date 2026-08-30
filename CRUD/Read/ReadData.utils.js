
const { performJoinSelect } = require("./ReadData.core");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { getData } = require("./ReadData.core");

const checkUserExists = async (userUniqueId) => {
  const existingUser = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  return existingUser?.length ? existingUser[0] : null;
};
//checkActiveShipperRequest is used to get active shipper request from shipper request table, user table ,journey decisions table


const getCancellationDetails = async (contextId) => {
  const result = await performJoinSelect({
    baseTable: "CanceledJourneys",
    joins: [
      {
        table: "CancellationReasonsType",
        on: "CanceledJourneys.cancellationReasonsTypeId = CancellationReasonsType.cancellationReasonsTypeId",
      },
    ],
    conditions: {
      "CanceledJourneys.contextId": contextId,
    },
    orderBy: "CanceledJourneys.canceledTime",
    orderDirection: "DESC",
    limit: 1,
  });

  if (!result || result.length === 0) {
    return null;
  }
  return result[0];
};


const getAttachedDocumentsByUserUniqueIdAndDocumentTypeId = async (
  ownerUserUniqueId,
  documentTypeId,
  connection = null,
) => {
  const { getAttachedDocumentsByFilter } = require("../../Services/AttachedDocuments/read.service");
  const result = await getAttachedDocumentsByFilter({
    filter: {
      ownerType: "user",
      ownerUniqueId: ownerUserUniqueId,
      documentTypeId,
    },
    pagination: { page: 1, limit: 1000, offset: 0 },
    sort: { by: "attachedDocumentCreatedAt", order: "ASC" },
  });

  // Return the stored relative path ("/uploads/...") instead of the resolved
  // backend base URL; the frontends prepend their own API base URL.
  if (Array.isArray(result?.data)) {
    for (const doc of result.data) {
      const uploadsIdx =
        typeof doc.attachedDocumentName === "string"
          ? doc.attachedDocumentName.indexOf("/uploads/")
          : -1;
      if (uploadsIdx !== -1) {
        doc.attachedDocumentName = doc.attachedDocumentName.slice(uploadsIdx);
      }
    }
  }

  return result;
};

module.exports = {
  checkUserExists,
  getCancellationDetails,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId
};