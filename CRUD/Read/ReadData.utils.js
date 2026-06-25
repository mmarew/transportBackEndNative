
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
  const sqlToGetDocument = `select * from AttachedDocuments, DocumentTypes where attachedDocumentCreatedByUserId=? and DocumentTypes.documentTypeId=?`;
  const values = [ownerUserUniqueId, documentTypeId];
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [documents] = await queryExecutor.query(sqlToGetDocument, values);

  return {
    message: "success",
    data: documents,
  };
};

module.exports = {
  checkUserExists,
  getCancellationDetails,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId
};