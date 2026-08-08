const {
  
  
  getDriverRequestByRequestUniqueId,
  
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");


const {
  sendSocketIONotificationToShipper,
  
  sendNotificationToDriver,
} = require("../../Utils/Notifications");







const messageTypes = require("../../Utils/MessageTypes");
const {
  journeyStatusMap,
  
  
} = require("../../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("../JourneyStatus");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");



const AppError = require("../../Utils/AppError");

/**
 * Handles the case when a driver doesn't answer a shipper request
 * Updates existing shipper request status based on number of active drivers
 * - If only 1 active driver: Updates shipper status to waiting (1), updates driver and decision to noAnswerFromDriver (13)
 * - If multiple active drivers: Leaves shipper status unchanged, updates driver and decision to noAnswerFromDriver (13)
 * @param {Object} body - Request body containing shipperRequestUniqueId and driverRequestUniqueId
 * @returns {Promise<Object>} Response containing status and message type
 */
const noAnswerFromDriver = async (body) => {
  const shipperRequestUniqueId = body.shipperRequestUniqueId;
  const { getShipperRequest4allOrSingleUser } = require("../ShipperRequest");
  const shipperRequestResult = await getShipperRequest4allOrSingleUser({
    data: {
      target: "all",
      filters: { shipperRequestUniqueId },
      page: 1,
      limit: 1,
    },
  });
  const shipperRequestFormatted =
    shipperRequestResult?.data?.[0] || null;
  const driverRequestUniqueId = body.driverRequestUniqueId;
  const driverRequest = await getDriverRequestByRequestUniqueId(
    driverRequestUniqueId,
  );

  // Extract shipper request data from formatted structure
  // data[0] has structure: {shipperRequest: {...}, driverRequests: [...], decisions: [...], journey: {...}}
  const shipperData =
    shipperRequestFormatted?.shipperRequest ||
    shipperRequestFormatted?.data ||
    null;
  const driverData =
    driverRequest?.data?.[0] || driverRequest?.data || driverRequest[0] || null;

  // Validate shipper data exists
  if (!shipperData) {
    throw new AppError("Shipper request not found", AppError.NOT_FOUND);
  }

  // Validate driver data exists
  if (!driverData) {
    throw new AppError("Driver request not found", AppError.NOT_FOUND);
  }

  // Check if driver already responded (acceptedByDriver or acceptedByShipper)
  const respondedStatuses = [
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByShipper,
  ];
  if (respondedStatuses.includes(shipperData.journeyStatusId)) {
    return {
      message: "Driver timeout processed",
      data: messageTypes.driver_answered_calls,
    };
  }

  // Fetch all necessary data BEFORE transaction (read operations)
  // Get driverRequestId from driverData
  const shipperRequestId = shipperData?.shipperRequestId;

  // Determine if shipper should be updated to waiting
  // This will be set within the transaction based on active driver count
  let shouldUpdateShipperToWaiting = false;

  // Wrap status updates in a single transaction to ensure atomicity
  // All operations must succeed or all must fail to maintain data consistency
  await executeInTransaction(
    async (connection) => {
      // 1. Count active JourneyDecisions for this shipper request (status IN 2, 3, 4)
      // This ensures we count accurately even if other transactions are modifying data
      // We check BEFORE updating to know if this is the only active driver
      let journeyDecisionCount = 0;
      if (shipperRequestUniqueId) {
        // Count journey decisions for this shipper request using transaction connection
        // This ensures we see a consistent snapshot within the transaction
        // Count only active JourneyDecisions (status IN 2, 3, 4): requested, acceptedByDriver, acceptedByShipper
        // If count === 1, this is the only active driver, so shipper goes back to waiting
        // If count > 1, multiple drivers are active, so shipper status stays unchanged
        const countSql = `
          SELECT COUNT(*) as count 
          FROM JourneyDecisions 
          INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId 
          WHERE ShipperRequest.shipperRequestUniqueId = ?
            AND JourneyDecisions.journeyStatusId IN (?, ?, ?)
        `;
        const [countResult] = await connection.query(countSql, [
          shipperRequestUniqueId,
          journeyStatusMap.requested, // 2
          journeyStatusMap.acceptedByDriver, // 3
          journeyStatusMap.acceptedByShipper, // 4
        ]);
        journeyDecisionCount = countResult[0]?.count || 0;

        // Determine if shipper status should be updated to waiting
        // Only update if this is the only active driver (only 1 JourneyDecision with status IN 2, 3, 4)
        // If shipper has multiple active drivers (count > 1), leave status unchanged
        // This logic: if only 1 active driver was matched, and they don't answer, shipper has no active drivers left
        shouldUpdateShipperToWaiting = journeyDecisionCount === 1;
      }

      // 2. Update journey status to noAnswerFromDriver (within transaction)
      // This updates DriverRequest, JourneyDecisions, and Journey (if exists)
      await updateJourneyStatus({
        ...body,
        connection, // Pass connection for transaction support
      });

      // 3. Update ShipperRequest status (only if this is the only active driver)
      // If shipper has multiple active drivers, leave status unchanged
      if (shipperRequestId && shouldUpdateShipperToWaiting) {
        // Update the ShipperRequest to reflect the no answer.
        // For company_target mode, the company still owns the bid, so slot returns to acceptedByShipper (4)
        // For individual_target mode, the slot returns to waiting (1) for a new driver
        const isCompanyTarget = shipperData && (shipperData.requestMode === 'company_target' || shipperData.targetCompanyUniqueId !== null);
        const revertStatus = isCompanyTarget ? journeyStatusMap.acceptedByShipper : journeyStatusMap.waiting;

        await updateData({
          tableName: "ShipperRequest",
          conditions: { shipperRequestId },
          updateValues: {
            journeyStatusId: revertStatus,
          },
          connection, // Pass connection for transaction support
        });
      }
    },
    {
      timeout: 15000, // 15 second timeout for no answer operations
      logging: true,
    },
  );

  // After successful transaction commit, handle notifications
  const driverPhoneNumber = driverData.phoneNumber;
  const shipperPhoneNumber = shipperData?.phoneNumber;

  // Determine final shipper status for response
  const finalShipperStatus = shouldUpdateShipperToWaiting
    ? journeyStatusMap.waiting
    : shipperData.journeyStatusId;

  const messageToShipper = {
    messageType: messageTypes.request_other_driver,
    message: "Driver timeout processed",
    shipper: {
      ...shipperData,
      journeyStatusId: finalShipperStatus,
    },
    status: finalShipperStatus,
  };

  const messageToDriver = {
    message: "Driver timeout processed",
    shipper: null,
    driver: null,
    status: null,
    messageType: messageTypes.driver_not_answered,
  };

  // Send notifications after successful transaction commit
  sendNotificationToDriver({
    message: messageToDriver,
    phoneNumber: driverPhoneNumber,
  });
  sendSocketIONotificationToShipper({
    message: messageToShipper,
    phoneNumber: shipperPhoneNumber,
  });

  return {
    status: finalShipperStatus,
    message: "Driver timeout processed",
    data: messageTypes.driver_not_answered,
  };
};
module.exports = { noAnswerFromDriver };
