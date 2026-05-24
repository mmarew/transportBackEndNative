"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  
  
  
} = require("../CompanyHelper.service");
const {
  journeyStatusMap,
  usersRoles,
  CANCELED_JOURNEY_CONTEXTS,
} = require("../../Utils/ListOfSeedData");
const { createCanceledJourney } = require("../CanceledJourneys");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSocketIONotificationToDriver } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const { createDriverRequest } = require("../../CRUD/Create/CreateData");
const { updateData } = require("../../CRUD/Update/Data.update");

const {
  verifyDriverJourneyStatus,
} = require("../DriverRequest/statusVerification");



/**
 * Creates a JourneyDecision record that formally links a ShipperRequest
 * to a DriverRequest at the moment of company assignment (status 2).
 *
 * This is the canonical join between the shipper's request and the assigned
 * driver's request. Without it, `handleExistingJourney` in the status-
 * verification service cannot resolve the shipper context and would
 * incorrectly reset the DriverRequest back to status 1.
 *
 * Called by: createAssignment, createBulkAssignments, autoAssignBatch.
 * At confirmation (confirmed_by_driver) the same row is updated to status 4.
 *
 * @param {string} shipperRequestUniqueId
 * @param {string} driverRequestUniqueId
 * @param {string} createdByUserUniqueId  — dispatcher / company admin
 * @returns {Promise<string>} journeyDecisionUniqueId
 */
async function createJourneyDecisionForAssignment(
  shipperRequestUniqueId,
  driverRequestUniqueId,
  createdByUserUniqueId,
) {
  // Resolve numeric PKs
  const [[prRow]] = await db().query(
    "SELECT shipperRequestId FROM ShipperRequest WHERE shipperRequestUniqueId = ? LIMIT 1",

    [shipperRequestUniqueId],
  );
  if (!prRow) {
    throw new AppError(
      "Shipper request not found while creating JourneyDecision",
      404,
    );
  }

  const [[drRow]] = await db().query(
    "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
    [driverRequestUniqueId],
  );
  if (!drRow) {
    throw new AppError(
      "Driver request not found while creating JourneyDecision",
      404,
    );
  }

  // Idempotency: if a JD already exists for this driverRequestId, return it.
  // Option B creates a NEW DriverRequest (old one is soft-deleted), so the new
  // DR will never collide with the cancelled individual JD's old DR.
  const [[existing]] = await db().query(
    "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
    [drRow.driverRequestId],
  );
  if (existing) {
    return existing.journeyDecisionUniqueId;
  }

  const journeyDecisionUniqueId = uuidv4();
  await db().query(
    `INSERT INTO JourneyDecisions
      (journeyDecisionUniqueId, shipperRequestId, driverRequestId,
       journeyStatusId, decisionTime, decisionBy,
       journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
    [
      journeyDecisionUniqueId,
      prRow.shipperRequestId,
      drRow.driverRequestId,
      journeyStatusMap.requested, // status 2 — company has requested this driver
      currentDate(),
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  logger.info("JourneyDecision created at assignment time", {
    journeyDecisionUniqueId,
    shipperRequestUniqueId,
    driverRequestUniqueId,
    journeyStatusId: journeyStatusMap.requested,
  });

  return journeyDecisionUniqueId;
}

/**
 * Sends both FCM + WebSocket notification to an assigned driver.
 * Used by createAssignment, createBulkAssignments, and autoAssignBatch
 * so all three paths behave identically.
 *
 * @param {Object} opts
 * @param {string} opts.driverUserUniqueId
 * @param {string} opts.assignmentUniqueId
 * @param {string} opts.driverRequestUniqueId
 * @param {string} opts.shipperRequestUniqueId
 * @param {string} opts.companyBidRequestUniqueId
 */
const notifyAssignedDriver = async (opts) => {
  const {
    driverUserUniqueId,
    assignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
    companyBidRequestUniqueId,
  } = opts;

  const notificationData = {
    type: "company_driver_assignment",
    assignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
    companyBidRequestUniqueId,
  };

  // 1. FCM — wakes up the app even when it's in the background
  sendFCMNotificationToUser({
    userUniqueId: driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New freight assignment",
      body: "You have been assigned to a freight job. Please confirm or reject.",
    },
    data: notificationData,
  }).catch((e) =>
    logger.error("FCM failed for driver assignment", {
      error: e.message,
      driverUserUniqueId,
      assignmentUniqueId,
    }),
  );

  // 2. WebSocket — instant delivery when app is already open
  try {
    const [userRows] = await db().query(
      "SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1",
      [driverUserUniqueId],
    );
    const phoneNumber = userRows?.[0]?.phoneNumber;

    if (phoneNumber) {
      // Call verifyDriverJourneyStatus to get the exact same payload the driver
      // would receive on the next poll — includes shipper, decision, companyAssignment.
      let wsPayload;
      try {
        const statusResult = await verifyDriverJourneyStatus({
          userUniqueId: driverUserUniqueId,
        });
        wsPayload = {
          messageTypes: messageTypes.company_driver_assignment,
          message: "success",
          ...statusResult, // status, driver, shipper, decision, journey, companyAssignment
        };
      } catch (verifyErr) {
        // Fallback: send minimal payload so ResponseHandler still dispatches status=2
        logger.warn(
          "verifyDriverJourneyStatus failed in notifyAssignedDriver, using fallback payload",
          {
            error: verifyErr.message,
            driverUserUniqueId,
          },
        );
        wsPayload = {
          messageTypes: messageTypes.company_driver_assignment,
          message: "success",
          status: journeyStatusMap.requested,
          companyAssignment: {
            assignmentUniqueId,
            driverRequestUniqueId,
            shipperRequestUniqueId,
            companyBidRequestUniqueId,
          },
          driver: null,
          shipper: null,
          journey: null,
          decision: null,
        };
      }

      sendSocketIONotificationToDriver({
        phoneNumber,
        message: wsPayload,
      }).catch((e) =>
        logger.warn(
          "WebSocket failed for driver assignment (driver may be offline)",
          {
            error: e.message,
            driverUserUniqueId,
            assignmentUniqueId,
          },
        ),
      );
    }
  } catch (e) {
    logger.warn("Could not fetch driver phone for WebSocket notification", {
      error: e.message,
      driverUserUniqueId,
    });
  }
};

/**
 * upsertDriverRequest
 * ────────────────────
 * Creates or reuses a DriverRequest row for the given driver at assignment time.
 *
 * **Offline-first design:** A dispatcher can assign a driver even when the driver
 * is offline (no active DriverRequest). In that case a fresh row is inserted with
 * the origin coordinates from the ShipperRequest, so the driver wakes up to a
 * pre-populated job card.
 *
 * **Rules (in order):**
 * 1. Exactly ONE non-deleted DriverRequest exists → UPDATE it in-place and reuse
 *    its UUID. No status filter — works for waiting, offline, or any state.
 * 2. Zero rows (driver offline) or 2+ rows (test pollution) → INSERT a fresh row.
 *
 * @param {Object} opts
 * @param {string} opts.driverUserUniqueId
 * @param {number} opts.newStatusId        - journeyStatusId to set (e.g. requested = 2)
 * @param {number} opts.originLat
 * @param {number} opts.originLng
 * @param {string} opts.originPlace
 * @returns {Promise<string>} The driverRequestUniqueId to link in the assignment.
 */
const upsertDriverRequest = async ({
  driverUserUniqueId,
  newStatusId,
  originLat,
  originLng,
  originPlace,
}) => {
  // Fetch up to 2 rows — no status filter so offline drivers (0 rows) fall through
  // to the INSERT path, and drivers with exactly 1 row are updated in-place.
  const [existingRows] = await db().query(
    `SELECT driverRequestUniqueId, journeyStatusId
     FROM DriverRequest
     WHERE userUniqueId = ?
       AND driverRequestDeletedAt IS NULL
     LIMIT 2`,
    [driverUserUniqueId],
  );

  if (existingRows && existingRows.length === 1) {
    const existingUniqueId = existingRows[0].driverRequestUniqueId;
    const existingStatus   = existingRows[0].journeyStatusId;

    // ── Option B: Cancel individual connection before company assignment ──────
    // If the driver is currently active in an individual journey (status 1–3),
    // cancel their existing JourneyDecision(s) with 'cancelled_by_system' and
    // return the ShipperRequest to 'waiting' so another driver can pick it up.
    // Status 4+ means the shipper already accepted — those are left untouched
    // (company should not steal a driver mid-confirmed journey).
    const activeIndividualStatuses = [
      journeyStatusMap.waiting,    // 1
      journeyStatusMap.requested,  // 2
      journeyStatusMap.acceptedByDriver, // 3
    ];

    if (activeIndividualStatuses.includes(existingStatus)) {
      // Find all active JourneyDecisions for this DriverRequest
      const [activeDecisions] = await db().query(
        `SELECT jd.journeyDecisionUniqueId, jd.shipperRequestId,
                sr.shipperRequestUniqueId
         FROM JourneyDecisions jd
         INNER JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
         LEFT JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
         WHERE dr.driverRequestUniqueId = ?
           AND jd.journeyStatusId IN (?, ?, ?)
           AND jd.journeyDecisionDeletedAt IS NULL`,
        [
          existingUniqueId,
          journeyStatusMap.waiting,
          journeyStatusMap.requested,
          journeyStatusMap.acceptedByDriver,
        ],
      );

      if (activeDecisions.length > 0) {
        logger.info("Company assignment: cancelling individual JourneyDecisions for driver", {
          driverUserUniqueId,
          driverRequestUniqueId: existingUniqueId,
          count: activeDecisions.length,
        });

        for (const decision of activeDecisions) {
          // 1. Mark the individual JourneyDecision as replaced by company assignment (status 16)
          await updateData({
            tableName: "JourneyDecisions",
            conditions: { journeyDecisionUniqueId: decision.journeyDecisionUniqueId },
            updateValues: {
              journeyStatusId: journeyStatusMap.replacedByCompanyAssignment,
              journeyDecisionUpdatedAt: currentDate(),
            },
          });

          // 2. Return the individual ShipperRequest back to waiting
          //    so another driver can pick it up
          if (decision.shipperRequestUniqueId) {
            await updateData({
              tableName: "ShipperRequest",
              conditions: { shipperRequestUniqueId: decision.shipperRequestUniqueId },
              updateValues: {
                journeyStatusId: journeyStatusMap.waiting,
                shipperRequestUpdatedAt: currentDate(),
              },
            });

            logger.info("Individual ShipperRequest returned to waiting", {
              shipperRequestUniqueId: decision.shipperRequestUniqueId,
            });
          }

          // 3. Register the cancellation in CanceledJourneys for audit/analytics.
          //    This matches the pattern used by every other cancellation path.
          //    contextType = JourneyDecisions (journey has not started yet)
          //    contextId   = journeyDecisionId (numeric PK, same as requestActions.service.js)
          try {
            const [jdPkRow] = await db().query(
              `SELECT journeyDecisionId, userUniqueId AS shipperUserUniqueId
               FROM JourneyDecisions jd
               INNER JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
               WHERE jd.journeyDecisionUniqueId = ? LIMIT 1`,
              [decision.journeyDecisionUniqueId],
            );
            const journeyDecisionId       = jdPkRow?.[0]?.journeyDecisionId;
            const shipperUserUniqueId     = jdPkRow?.[0]?.shipperUserUniqueId;

            if (journeyDecisionId) {
              await createCanceledJourney({
                contextId:                 journeyDecisionId,
                contextType:               CANCELED_JOURNEY_CONTEXTS.JOURNEY_DECISIONS,
                canceledBy:                driverUserUniqueId, // driver whose slot is being taken over
                cancellationReasonsTypeId: 19,                 // "App-related technical issue" (admin/system reason)
                roleId:                    usersRoles.driverRoleId,
                driverUserUniqueId,
                shipperUserUniqueId:       shipperUserUniqueId ?? null,
              });
              logger.info("CanceledJourney audit row written for system-cancelled individual JD", {
                journeyDecisionUniqueId: decision.journeyDecisionUniqueId,
                journeyDecisionId,
                driverUserUniqueId,
              });
            }
          } catch (auditErr) {
            // Non-critical — log but do NOT fail the assignment
            logger.warn("Failed to write CanceledJourney audit row (non-blocking)", {
              journeyDecisionUniqueId: decision.journeyDecisionUniqueId,
              error: auditErr.message,
            });
          }
        }

        // ── Soft-delete the old DriverRequest so a NEW one is created ──────────
        // This preserves the cancelled DR + JD pair as historical records.
        // The INSERT path below will create a fresh DR for the company assignment.
        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestUniqueId: existingUniqueId },
          updateValues: {
            journeyStatusId: journeyStatusMap.replacedByCompanyAssignment,
            driverRequestDeletedAt: currentDate(),
            driverRequestUpdatedAt: currentDate(),
          },
        });
        logger.info("Old DriverRequest soft-deleted after Option B cancellation", {
          driverRequestUniqueId: existingUniqueId,
          driverUserUniqueId,
        });

        // ── Notify the driver that their individual job was replaced ───────────
        // Fire-and-forget — don't block the assignment transaction.
        // The driver will also receive a company_driver_assignment notification
        // once the new assignment is fully created.
        try {
          const [userRows] = await db().query(
            "SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1",
            [driverUserUniqueId],
          );
          const phoneNumber = userRows?.[0]?.phoneNumber;

          // Collect cancelled ShipperRequest details for the driver's UI
          const cancelledShipperRequests = activeDecisions
            .filter(d => d.shipperRequestUniqueId)
            .map(d => d.shipperRequestUniqueId);

          const replacementPayload = {
            messageTypes: messageTypes.individual_replaced_by_company,
            message: "success",
            type: "individual_replaced_by_company",
            cancelledDriverRequestUniqueId: existingUniqueId,
            cancelledShipperRequests,
            journeyStatusId: journeyStatusMap.replacedByCompanyAssignment,
          };

          // 1. FCM — wakes app even in background
          sendFCMNotificationToUser({
            userUniqueId: driverUserUniqueId,
            roleId: usersRoles.driverRoleId,
            notification: {
              title: "Job reassigned by your company",
              body: "Your individual shipper match has been replaced by a company fleet assignment. Open the app to see your new job.",
            },
            data: {
              type: "individual_replaced_by_company",
              cancelledDriverRequestUniqueId: existingUniqueId,
            },
          }).catch(e =>
            logger.warn("FCM failed for individual-replaced notification", {
              error: e.message,
              driverUserUniqueId,
            }),
          );

          // 2. WebSocket — instant delivery when app is open
          if (phoneNumber) {
            sendSocketIONotificationToDriver({
              phoneNumber,
              message: replacementPayload,
            }).catch(e =>
              logger.warn("WebSocket failed for individual-replaced notification (driver may be offline)", {
                error: e.message,
                driverUserUniqueId,
              }),
            );
          }

          logger.info("Replacement notification sent to driver", {
            driverUserUniqueId,
            cancelledDriverRequestUniqueId: existingUniqueId,
            cancelledShipperRequests,
          });
        } catch (notifyErr) {
          // Non-critical — log but do NOT fail the assignment
          logger.warn("Failed to send replacement notification to driver (non-blocking)", {
            error: notifyErr.message,
            driverUserUniqueId,
          });
        }

        // Fall through to the INSERT path below →
      } else {
        // Driver is in active individual status range but has no active JDs —
        // just update the existing DR in-place for the company assignment.
        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestUniqueId: existingUniqueId },
          updateValues: {
            journeyStatusId: newStatusId,
            originLatitude: originLat ?? 0,
            originLongitude: originLng ?? 0,
            originPlace: originPlace ?? "Assigned by dispatcher",
            driverRequestUpdatedAt: currentDate(),
          },
        });
        return existingUniqueId;
      }
    } else {
      // Status 4+ (shipper accepted, journey started, etc.) or non-individual status
      // — just update the existing DR in-place for the company assignment.
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestUniqueId: existingUniqueId },
        updateValues: {
          journeyStatusId: newStatusId,
          originLatitude: originLat ?? 0,
          originLongitude: originLng ?? 0,
          originPlace: originPlace ?? "Assigned by dispatcher",
          driverRequestUpdatedAt: currentDate(),
        },
      });
      return existingUniqueId;
    }
  }

  // 0 rows (offline driver) or 2+ rows (stale test data) → INSERT fresh row.
  const result = await createDriverRequest(
    {
      currentLocation: {
        latitude: originLat ?? 0,
        longitude: originLng ?? 0,
        description: originPlace ?? "Assigned by dispatcher",
      },
    },
    driverUserUniqueId,
    newStatusId,
  );

  // createDriverRequest returns existing active rows without inserting when
  // one already exists (activeJourneyStatuses check). Extract the UUID safely.
  const row = result?.data?.[0];
  if (!row?.driverRequestUniqueId) {
    throw new AppError("Failed to create or reuse DriverRequest", 500);
  }
  return row.driverRequestUniqueId;
};

/**
 * findActiveAssignmentForSlot
 * ────────────────────────────
 * Checks whether a given ShipperRequest slot already has a non-terminal
 * CompanyBidVehicleAssignment for the specified bid.
 *
 * "Active" means any status that is NOT a terminal cancel/reject:
 *   assigned | confirmed_by_driver | going_to_loading | journey_started
 *
 * Returns the assignment row if one exists, or null if the slot is free.
 * Used as a duplicate-assignment guard before creating a new assignment.
 *
 * @param {string} companyBidRequestUniqueId
 * @param {string} shipperRequestUniqueId
 * @returns {Promise<Object|null>} existing assignment row or null
 */
async function findActiveAssignmentForSlot(
  companyBidRequestUniqueId,
  shipperRequestUniqueId,
) {
  const [rows] = await db().query(
    `SELECT assignmentUniqueId, assignmentStatus
     FROM CompanyBidVehicleAssignment
     WHERE companyBidRequestUniqueId = ?
       AND shipperRequestUniqueId  = ?
       AND assignmentDeletedAt IS NULL
       AND assignmentStatus NOT IN (
         'rejected_by_driver',
         'cancelled_by_company',
         'cancelled_by_shipper',
         'cancelled_by_driver'
       )
     LIMIT 1`,
    [companyBidRequestUniqueId, shipperRequestUniqueId],
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = { createJourneyDecisionForAssignment, notifyAssignedDriver, upsertDriverRequest, findActiveAssignmentForSlot };
