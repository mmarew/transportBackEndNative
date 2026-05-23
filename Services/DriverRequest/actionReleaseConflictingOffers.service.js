const {
  getData,
  performJoinSelect,
  getDriverRequestByRequestUniqueId,
  checkActiveDriverRequest,
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createDriverRequest } = require("../../CRUD/Create/CreateData");
const { getUserByUserUniqueId, createUser } = require("../User.service");
const {
  sendSocketIONotificationToShipper,
  sendSocketIONotificationToAdmin,
  sendNotificationToDriver,
} = require("../../Utils/Notifications");
const { sendSms } = require("../../Utils/smsSender");
const { createJourneyRoutePoint } = require("../JourneyRoutePoints.service");
const {
  getTariffRateByVehicleTypeUniqueId,
} = require("../TariffRateForVehicleTypes.service");
const { createJourneyDecision } = require("../JourneyDecisions.service");
const { currentDate } = require("../../Utils/CurrentDate");
const { createJourney } = require("../Journey");
const {
  createCanceledJourney,
  getJourneyDataByContextType,
} = require("../CanceledJourneys.service");
const messageTypes = require("../../Utils/MessageTypes");
const {
  journeyStatusMap,
  CANCELED_JOURNEY_CONTEXTS,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");
const { updateJourneyStatus } = require("../JourneyStatus.service");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { fetchJourneyNotificationData } = require("./helpers");
const AppError = require("../../Utils/AppError");

/**
 * releaseConflictingOffers
 * ────────────────────────
 * When a driver accepts ONE offer (individual or company), this function
 * auto-releases all OTHER pending offers for the same driver.
 *
 * Phase 1 of the Job Queue pattern:
 *   - Individual accepted → cancel pending company assignments
 *   - Company confirmed   → cancel pending individual journey decisions
 *
 * @param {string} driverUserUniqueId - The driver's user ID
 * @param {string} acceptedType       - 'individual' or 'company'
 * @param {string} [excludeId]        - ID to exclude (the one being accepted)
 */
const releaseConflictingOffers = async (
  driverUserUniqueId,
  acceptedType,
  excludeId = null,
) => {
  const { pool } = require("../../Middleware/Database.config");

  if (acceptedType === "individual") {
    // Driver accepted an individual request → release pending company assignments
    try {
      const [pendingAssignments] = await pool.query(
        `SELECT assignmentUniqueId, driverRequestUniqueId, shipperRequestUniqueId
         FROM CompanyBidVehicleAssignment
         WHERE driverUserUniqueId = ?
           AND assignmentStatus IN ('assigned')
           AND assignmentDeletedAt IS NULL`,
        [driverUserUniqueId],
      );

      for (const assignment of pendingAssignments) {
        // Mark the company assignment as cancelled
        await pool.query(
          `UPDATE CompanyBidVehicleAssignment
           SET assignmentStatus = 'cancelled_by_driver',
               assignmentUpdatedAt = ?
           WHERE assignmentUniqueId = ?`,
          [currentDate(), assignment.assignmentUniqueId],
        );

        // Clean up the DriverRequest created for this company assignment
        if (assignment.driverRequestUniqueId) {
          await pool.query(
            `UPDATE DriverRequest
             SET journeyStatusId = ?, driverRequestUpdatedAt = ?
             WHERE driverRequestUniqueId = ?`,
            [
              journeyStatusMap.cancelledByDriver,
              currentDate(),
              assignment.driverRequestUniqueId,
            ],
          );
        }

        // Clean up JourneyDecision if one was created at assignment time
        if (assignment.driverRequestUniqueId) {
          await pool.query(
            `UPDATE JourneyDecisions jd
             INNER JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
             SET jd.journeyStatusId = ?
             WHERE dr.driverRequestUniqueId = ?
               AND jd.journeyStatusId IN (?, ?)`,
            [
              journeyStatusMap.cancelledByDriver,
              assignment.driverRequestUniqueId,
              journeyStatusMap.waiting,
              journeyStatusMap.requested,
            ],
          );
        }

        logger.info("Auto-released company assignment (driver accepted individual)", {
          assignmentUniqueId: assignment.assignmentUniqueId,
          driverUserUniqueId,
        });
      }
    } catch (err) {
      // Non-blocking: log but don't fail the acceptance
      logger.error("Failed to auto-release company assignments", {
        driverUserUniqueId,
        error: err.message,
      });
    }
  } else if (acceptedType === "company") {
    // Driver confirmed a company assignment → release pending individual offers
    try {
      // Find pending individual JourneyDecisions for this driver
      const [pendingDecisions] = await pool.query(
        `SELECT jd.journeyDecisionUniqueId, jd.shipperRequestId,
                dr.driverRequestUniqueId, dr.driverRequestId
         FROM JourneyDecisions jd
         INNER JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
         WHERE dr.userUniqueId = ?
           AND jd.journeyStatusId IN (?, ?)
           AND dr.driverRequestUniqueId != ?`,
        [
          driverUserUniqueId,
          journeyStatusMap.waiting,
          journeyStatusMap.requested,
          excludeId || "",
        ],
      );

      for (const decision of pendingDecisions) {
        // Cancel the journey decision
        await pool.query(
          `UPDATE JourneyDecisions SET journeyStatusId = ? WHERE journeyDecisionUniqueId = ?`,
          [journeyStatusMap.cancelledByDriver, decision.journeyDecisionUniqueId],
        );

        // Reset the DriverRequest
        await pool.query(
          `UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ? WHERE driverRequestUniqueId = ?`,
          [
            journeyStatusMap.cancelledByDriver,
            currentDate(),
            decision.driverRequestUniqueId,
          ],
        );

        // Check if this was the only active driver for the ShipperRequest
        // If so, reset ShipperRequest to waiting
        const [[{ activeCount }]] = await pool.query(
          `SELECT COUNT(*) AS activeCount FROM JourneyDecisions
           WHERE shipperRequestId = ? AND journeyStatusId IN (?, ?, ?)`,
          [
            decision.shipperRequestId,
            journeyStatusMap.requested,
            journeyStatusMap.acceptedByDriver,
            journeyStatusMap.acceptedByShipper,
          ],
        );

        if (activeCount === 0) {
          await pool.query(
            `UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestId = ?`,
            [journeyStatusMap.waiting, decision.shipperRequestId],
          );
        }

        logger.info("Auto-released individual offer (driver confirmed company)", {
          journeyDecisionUniqueId: decision.journeyDecisionUniqueId,
          driverUserUniqueId,
        });
      }
    } catch (err) {
      logger.error("Failed to auto-release individual offers", {
        driverUserUniqueId,
        error: err.message,
      });
    }
  }
};
module.exports = { releaseConflictingOffers };
