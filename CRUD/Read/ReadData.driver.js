const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap, activeJourneyStatuses } = require("../../Utils/ListOfSeedData");
const { performJoinSelect } = require("./ReadData.core");

const checkActiveDriverRequest = async (userUniqueId) => {
    // Build placeholders for IN clause
    const activeStatusPlaceholders = activeJourneyStatuses
      .map(() => "?")
      .join(", ");

    const query = `
      SELECT DISTINCT
        DriverRequest.*,
        Users.fullName,
        Users.phoneNumber,
        Users.email,
        JourneyDecisions.isNotSelectedSeenByDriver,
        JourneyDecisions.isRejectionByShipperSeenByDriver
      FROM DriverRequest
      INNER JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      LEFT JOIN JourneyDecisions ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE DriverRequest.userUniqueId = ?
      AND (
        -- Active statuses
        DriverRequest.journeyStatusId IN (${activeStatusPlaceholders})
        OR
        -- notSelectedInBid (14) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isNotSelectedSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- Cancellation statuses (7, 10, 12) with not seen status
        (
          DriverRequest.journeyStatusId IN (?, ?, ?)
          AND DriverRequest.isCancellationByShipperSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- rejectedByShipper (8) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isRejectionByShipperSeenByDriver = 'not seen by driver yet'
        )
      )
      ORDER BY 
        CASE 
          WHEN DriverRequest.journeyStatusId = ${journeyStatusMap.journeyStarted} THEN 100
          WHEN DriverRequest.journeyStatusId = ${journeyStatusMap.acceptedByShipper} THEN 90
          WHEN DriverRequest.journeyStatusId IN (
            ${journeyStatusMap.cancelledByShipper}, 
            ${journeyStatusMap.cancelledByAdmin}, 
            ${journeyStatusMap.cancelledBySystem}, 
            ${journeyStatusMap.notSelectedInBid}, 
            ${journeyStatusMap.rejectedByShipper}
          ) THEN 80
          WHEN DriverRequest.journeyStatusId = ${journeyStatusMap.acceptedByDriver} THEN 70
          WHEN DriverRequest.journeyStatusId = ${journeyStatusMap.requested} THEN 60
          WHEN DriverRequest.journeyStatusId = ${journeyStatusMap.waiting} THEN 10
          ELSE 0
        END DESC,
        DriverRequest.driverRequestId DESC
      LIMIT 1
    `;

    const queryExecutor = transactionStorage.getStore() || pool;
    const [results] = await queryExecutor.query(query, [
      userUniqueId,
      ...activeJourneyStatuses,
      journeyStatusMap.notSelectedInBid,
      journeyStatusMap.cancelledByShipper,
      journeyStatusMap.cancelledByAdmin,
      journeyStatusMap.cancelledBySystem,
      journeyStatusMap.rejectedByShipper,
    ]);

    return results; // Returns an array of active requests (if any)
};


const getDriverRequestByRequestUniqueId = async (driverRequestUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "DriverRequest",
    joins: [
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: {
      driverRequestUniqueId: driverRequestUniqueId,
    },
  });

  if (!result?.length) {
    throw new AppError("Request not found", AppError.NOT_FOUND);
  }

  return result[0];
};

module.exports = {
  checkActiveDriverRequest,
  getDriverRequestByRequestUniqueId
};