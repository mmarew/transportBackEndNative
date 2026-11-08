"use strict";
const { v4: uuidv4 } = require("uuid");
const {
  getNotificationStatuses,
  shouldHandleNotificationStatus,
  isTerminalStatus,
} = require("./helpers.service");
const { handleJourneyStatusOne } = require("./handleJourneyStatusOne.service");
const { handleExistingJourney } = require("./handleExistingJourney.service");

const { checkActiveDriverRequest, getData } = require("../../../CRUD/Read/ReadData");

const {
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../../../Utils/ListOfSeedData");

const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");
const { currentDate } = require("../../../Utils/CurrentDate");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected
const { getVehicleDrivers } = require("../../VehicleDriver.service");
const { pool } = require("../../../Middleware/Database.config");

const getCompanyAssignmentJourneyStatus = (assignmentStatus, driverRequestStatus) => {
  const companyStatuses = {
    assigned: journeyStatusMap.requested,
    reassigned: journeyStatusMap.requested,
    confirmed_by_driver: journeyStatusMap.acceptedByShipper,
    going_to_loading: journeyStatusMap.goToLoadingPlace,
    journey_started: journeyStatusMap.journeyStarted,
  };
  if (companyStatuses[assignmentStatus] !== undefined) {
    return companyStatuses[assignmentStatus];
  }
  const linkedStatus = Number(driverRequestStatus);
  return activeJourneyStatuses.includes(linkedStatus)
    ? linkedStatus
    : journeyStatusMap.requested;
};

const getActiveCompanyAssignmentStatus = async (userUniqueId, vehicle) => {
  const connection = await pool.getConnection();
  let companyAssignment;
  let driverRequestUniqueId;
  let status;
  try {
    await connection.beginTransaction();
    const [assignmentRows] = await connection.query(
      `SELECT
         cbva.assignmentUniqueId,
         cbva.assignmentStatus,
         cbva.companyBidRequestUniqueId,
         cbva.shipperRequestUniqueId,
         cbva.vehicleUniqueId,
         cbva.driverUserUniqueId,
         cbva.driverRequestUniqueId,
         cbva.journeyDecisionUniqueId,
         tc.companyUniqueId,
         tc.companyName,
         tc.companyPhone,
         sr.originLatitude,
         sr.originLongitude,
         sr.originPlace
       FROM CompanyBidVehicleAssignment cbva
       LEFT JOIN CompanyBidRequest cbr
         ON cbva.companyBidRequestUniqueId = cbr.companyBidRequestUniqueId
       LEFT JOIN TransportCompany tc
         ON cbr.companyUniqueId = tc.companyUniqueId
       LEFT JOIN ShipperRequest sr
         ON cbva.shipperRequestUniqueId = sr.shipperRequestUniqueId
       WHERE cbva.driverUserUniqueId = ?
         AND cbva.assignmentStatus NOT IN (
           'completed', 'cancelled_by_company', 'cancelled_by_shipper',
           'cancelled_by_driver', 'rejected_by_driver'
         )
         AND cbva.assignmentDeletedAt IS NULL
       ORDER BY cbva.assignmentCreatedAt DESC
       LIMIT 1
       FOR UPDATE`,
      [userUniqueId],
    );
    companyAssignment = assignmentRows[0];
    if (!companyAssignment) {
      await connection.commit();
      return null;
    }

    driverRequestUniqueId = companyAssignment.driverRequestUniqueId;
    const [driverRequestRows] = driverRequestUniqueId
      ? await connection.query(
          `SELECT driverRequestId, journeyStatusId
           FROM DriverRequest
           WHERE driverRequestUniqueId = ?
           LIMIT 1
           FOR UPDATE`,
          [driverRequestUniqueId],
        )
      : [[]];
    const linkedDriverRequest = driverRequestRows[0];
    let driverRequestId = linkedDriverRequest?.driverRequestId;
    status = getCompanyAssignmentJourneyStatus(
      companyAssignment.assignmentStatus,
      linkedDriverRequest?.journeyStatusId,
    );

    if (linkedDriverRequest) {
      await connection.query(
        `UPDATE DriverRequest
         SET journeyStatusId = ?,
             driverRequestDeletedAt = NULL,
             driverRequestUpdatedAt = ?
         WHERE driverRequestId = ?`,
        [status, currentDate(), linkedDriverRequest.driverRequestId],
      );
    } else {
      driverRequestUniqueId = driverRequestUniqueId || uuidv4();
      const [insertResult] = await connection.query(
        `INSERT INTO DriverRequest
           (driverRequestUniqueId, userUniqueId, journeyStatusId,
            originLatitude, originLongitude, originPlace, driverRequestCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          driverRequestUniqueId,
          userUniqueId,
          status,
          companyAssignment.originLatitude ?? 0,
          companyAssignment.originLongitude ?? 0,
          companyAssignment.originPlace ?? "Assigned by dispatcher",
          currentDate(),
        ],
      );
      driverRequestId = insertResult.insertId;
      await connection.query(
        `UPDATE CompanyBidVehicleAssignment
         SET driverRequestUniqueId = ?
         WHERE assignmentUniqueId = ?
           AND assignmentDeletedAt IS NULL`,
        [driverRequestUniqueId, companyAssignment.assignmentUniqueId],
      );
    }

    if (companyAssignment.journeyDecisionUniqueId && linkedDriverRequest) {
      await connection.query(
        `UPDATE JourneyDecisions
         SET journeyStatusId = ?, journeyDecisionUpdatedAt = ?
         WHERE journeyDecisionUniqueId = ? AND driverRequestId = ?`,
        [status, currentDate(), companyAssignment.journeyDecisionUniqueId, driverRequestId],
      );
    } else if (companyAssignment.journeyDecisionUniqueId) {
      await connection.query(
        `UPDATE JourneyDecisions
         SET driverRequestId = ?, journeyStatusId = ?, journeyDecisionUpdatedAt = ?
         WHERE journeyDecisionUniqueId = ?`,
        [driverRequestId, status, currentDate(), companyAssignment.journeyDecisionUniqueId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [driverRequests, shipperRequests, decisions] = await Promise.all([
    getData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId },
    }),
    companyAssignment.shipperRequestUniqueId
      ? getData({
          tableName: "ShipperRequest",
          conditions: { shipperRequestUniqueId: companyAssignment.shipperRequestUniqueId },
        })
      : [],
    companyAssignment.journeyDecisionUniqueId
      ? getData({
          tableName: "JourneyDecisions",
          conditions: { journeyDecisionUniqueId: companyAssignment.journeyDecisionUniqueId },
        })
      : [],
  ]);
  const linkedDriverRequest = driverRequests[0];
  const driver = {
    ...linkedDriverRequest,
    driverRequestUniqueId,
    userUniqueId,
    fullName: linkedDriverRequest?.fullName ?? vehicle.fullName,
    phoneNumber: linkedDriverRequest?.phoneNumber ?? vehicle.phoneNumber,
    journeyStatusId: status,
  };
  const shipper = shipperRequests[0] ?? null;
  const decision = decisions[0] ?? null;

  return {
    message: "Company assignment status fetched",
    status,
    uniqueIds: {
      driverRequestUniqueId,
      shipperRequestUniqueId: companyAssignment.shipperRequestUniqueId,
      journeyDecisionUniqueId: companyAssignment.journeyDecisionUniqueId,
    },
    driver: { driver, vehicle },
    shipper,
    journey: null,
    decision,
    companyAssignment,
  };
};

// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js

const verifyDriverJourneyStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // ── DRIVER QUEUE CONTEXT (Fix C) ──────────────────────────────
    // One truth block for the app: the two-number model (immutable
    // queueNumber + derived linePosition), hasActiveJob, activeOrder,
    // reservation and the yard-gate verdict. Attached to EVERY response
    // below — including the "no active request" ones, because a driver can
    // be waiting in a queue (or merely reserved for a shipper) with no
    // DriverRequest at all. Field name `driverQueue` avoids colliding with
    // the existing `queue` org object that handleExistingJourney returns.
    let driverQueue = null;
    try {
      const { driverQueueContext } = require("../../DriverQueue");
      driverQueue = await driverQueueContext(pool, { userUniqueId });
    } catch (queueError) {
      logger.warn("driverQueueContext unavailable for verifyDriverJourneyStatus", {
        error: queueError.message,
        userUniqueId,
      });
    }
    const withQueue = (payload) => ({ ...payload, driverQueue });

    // Step 1: Check if the driver has a vehicle via VehicleDriver relation
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicle = vdResult?.data?.[0];
    if (!vehicle) {
      throw new AppError("No vehicle found for this driver", AppError.NOT_FOUND);
    }
    const vehicleTypeUniqueId = vehicle?.vehicleTypeUniqueId;

    // Step 2: Check for an active driver request, including cancellation and notSelectedInBid statuses
    // This optimized query combines all checks into one database request to reduce data rerequest
    if (!activeRequest?.length) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    // console.log("@activeRequest", activeRequest);
    const driverRequest = activeRequest?.[0];
    logger.debug("@driverRequest", driverRequest);
    if (!driverRequest) {
      const companyAssignmentStatus = await getActiveCompanyAssignmentStatus(
        userUniqueId,
        vehicle,
      );
      if (companyAssignmentStatus) {
        return withQueue(companyAssignmentStatus);
      }
      return withQueue({
        message: "Driver journey status verified",
        data: null,
        status: null,
        vehicle,
      });
    }

    // Step 3: Validate journey status
    const journeyStatusId = driverRequest?.journeyStatusId;
    // Allow notSelectedInBid (14), cancellation statuses (7, 10), and rejectedByShipper (8) to go through to handleExistingJourney for proper notification
    // Other terminal statuses (> 6) are excluded, but these need to notify the driver
    const notificationStatuses = getNotificationStatuses();
    const shouldHandleStatus = shouldHandleNotificationStatus(
      journeyStatusId,
      notificationStatuses,
    );
    if (isTerminalStatus(journeyStatusId) && !shouldHandleStatus) {
      return withQueue({
        message: "No active driver request",
        data: null,
        status: null,
        vehicle,
        driver: null,
        shipper: null,
      });
    }
    if (journeyStatusId === journeyStatusMap.waiting) {
      return withQueue(
        await handleJourneyStatusOne(
          driverRequest,
          vehicle,
          vehicleTypeUniqueId,
        ),
      );
    }
    return withQueue(await handleExistingJourney(driverRequest, vehicle));
  } catch (error) {
    logger.error("Error in verifyDriverJourneyStatus", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to verify driver status",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = {
  verifyDriverJourneyStatus,
};
