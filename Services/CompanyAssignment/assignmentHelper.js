"use strict";
/* eslint-disable max-lines */

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
  COMPANY_REPLACED_INDIVIDUAL_REASON,
} = require("../../Utils/ListOfSeedData");
const { createCanceledJourney } = require("../CanceledJourneys");
const { getCancellationReasonIdByName } = require("../Cancellation.service");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToCompany,
} = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
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
    "SELECT shipperRequestId, shippingCost FROM ShipperRequest WHERE shipperRequestUniqueId = ? LIMIT 1",

    [shipperRequestUniqueId],
  );
  if (!prRow) {
    throw new AppError(
      "Shipper request not found while creating JourneyDecision",
      AppError.NOT_FOUND,
    );
  }

  const [[drRow]] = await db().query(
    "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
    [driverRequestUniqueId],
  );
  if (!drRow) {
    throw new AppError(
      "Driver request not found while creating JourneyDecision",
      AppError.NOT_FOUND,
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
       shippingCostByDriver, journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, ?, 'company', ?, ?, ?)`,
    [
      journeyDecisionUniqueId,
      prRow.shipperRequestId,
      drRow.driverRequestId,
      journeyStatusMap.requested, // status 2 — company has requested this driver
      currentDate(),
      prRow.shippingCost || 0,
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
          message: "Assignment helper operation completed",
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
          message: "Assignment helper operation completed",
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
 * **Design Rationale & Offline-First Flow:**
 * Dispatchers can assign a driver even when the driver is completely offline
 * (i.e. has 0 active DriverRequest rows). When this happens, a fresh row is inserted
 * using the origin coordinates from the ShipperRequest so the driver wakes up to a
 * pre-populated job card.
 *
 * **Logic (in order):**
 * 1. Try to find the driver's *most recent* active DriverRequest (`ORDER BY driverRequestId DESC LIMIT 1`).
 *    This successfully handles test drivers that might have stale/duplicate rows.
 * 2. If the existing row has a **terminal individual status** (e.g. rejectedByDriver = 15),
 *    soft-delete it so `createJourneyDecisionForAssignment` does not reuse the stale
 *    JourneyDecision (the "re-ring" bug fix). Fall through to INSERT.
 * 3. If the existing row has an **active individual status** (1–3) with active JourneyDecisions,
 *    soft-delete it and cancel individual connections (Option B). Fall through to INSERT.
 *    If there are no active JourneyDecisions, UPDATE in-place and return.
 * 4. If the existing row has status 4+ (company flow or advanced state), UPDATE in-place and return.
 * 5. If ZERO rows are found, INSERT a fresh DriverRequest.
 *    *Note: We explicitly bypass `createDriverRequest` here because that function contains
 *    its own active-request redundancy checks, which would create confusing edge-cases
 *    if the driver had multiple corrupted rows.*
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
  // Fetch the most recent active row — no status filter so offline drivers (0 rows) fall through
  // to the INSERT path, and drivers with 1+ rows are updated in-place.
  const [existingRows] = await db().query(
    `SELECT driverRequestUniqueId, journeyStatusId
     FROM DriverRequest
     WHERE userUniqueId = ?
       AND driverRequestDeletedAt IS NULL
     ORDER BY driverRequestId DESC
     LIMIT 1`,
    [driverUserUniqueId],
  );

  if (existingRows && existingRows.length > 0) {
    const existingUniqueId = existingRows[0].driverRequestUniqueId;
    const existingStatus   = existingRows[0].journeyStatusId;

    // ── Terminal individual status → soft-delete & fresh INSERT ──────────────
    // If the driver's existing DR has a terminal status from a previous
    // individual flow (e.g. rejectedByDriver = 15), we must NOT reuse that
    // row. The old JourneyDecision is still linked to it and
    // `createJourneyDecisionForAssignment` would find and reuse the old JD,
    // causing the driver to see the stale individual job instead of the new
    // company assignment (the "re-ring" bug). Soft-deleting the old DR and
    // inserting a fresh one breaks the link cleanly.
    const terminalIndividualStatuses = [
      journeyStatusMap.rejectedByDriver, // 15 — driver rejected individual job
    ];

    const activeIndividualStatuses = [
      journeyStatusMap.waiting,    // 1
      journeyStatusMap.requested,  // 2
      journeyStatusMap.acceptedByDriver, // 3
    ];

    if (terminalIndividualStatuses.includes(existingStatus)) {
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestUniqueId: existingUniqueId },
        updateValues: {
          journeyStatusId: journeyStatusMap.replacedByCompanyAssignment,
          driverRequestDeletedAt: currentDate(),
          driverRequestUpdatedAt: currentDate(),
        },
      });
      logger.info("Old DriverRequest soft-deleted (terminal individual status)", {
        driverRequestUniqueId: existingUniqueId,
        existingStatus,
        driverUserUniqueId,
      });

      // ── Notify the driver that their individual job was replaced ──────────
      // Same notification as Option B — explains the transition so the driver
      // isn't confused when the individual job disappears and a company job appears.
      try {
        const [userRows] = await db().query(
          "SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1",
          [driverUserUniqueId],
        );
        const phoneNumber = userRows?.[0]?.phoneNumber;

        const replacementPayload = {
          messageTypes: messageTypes.individual_replaced_by_company,
          message: "Assignment helper operation completed",
          type: "individual_replaced_by_company",
          cancelledDriverRequestUniqueId: existingUniqueId,
          cancelledShipperRequests: [],
          status: journeyStatusMap.replacedByCompanyAssignment,
          driver: null,
          shipper: null,
          journey: null,
          decision: null,
          companyAssignment: null,
          uniqueIds: {
            driverRequestUniqueId: existingUniqueId,
            shipperRequestUniqueId: null,
            journeyDecisionUniqueId: null,
            journeyUniqueId: null,
          },
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
          logger.warn("FCM failed for individual-replaced notification (terminal status)", {
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
            logger.warn("WebSocket failed for individual-replaced notification (terminal status, driver may be offline)", {
              error: e.message,
              driverUserUniqueId,
            }),
          );
        }

        logger.info("Replacement notification sent to driver (terminal status)", {
          driverUserUniqueId,
          cancelledDriverRequestUniqueId: existingUniqueId,
        });
      } catch (notifyErr) {
        logger.warn("Failed to send replacement notification to driver (terminal status, non-blocking)", {
          error: notifyErr.message,
          driverUserUniqueId,
        });
      }

      // Fall through to INSERT path below →

    } else if (activeIndividualStatuses.includes(existingStatus)) {
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
              const companyReasonId = await getCancellationReasonIdByName(COMPANY_REPLACED_INDIVIDUAL_REASON);
              await createCanceledJourney({
                contextId:                 journeyDecisionId,
                contextType:               CANCELED_JOURNEY_CONTEXTS.JOURNEY_DECISIONS,
                canceledBy:                driverUserUniqueId,
                cancellationReasonsTypeId: companyReasonId || 1,
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
            message: "Assignment helper operation completed",
            type: "individual_replaced_by_company",
            cancelledDriverRequestUniqueId: existingUniqueId,
            cancelledShipperRequests,
            status: journeyStatusMap.replacedByCompanyAssignment,
            driver: null,
            shipper: null,
            journey: null,
            decision: null,
            companyAssignment: null,
            uniqueIds: {
              driverRequestUniqueId: existingUniqueId,
              shipperRequestUniqueId: cancelledShipperRequests?.[0] || null,
              journeyDecisionUniqueId: null,
              journeyUniqueId: null,
            },
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

  // 0 rows (offline driver) → INSERT fresh row.
  // We completely bypass createDriverRequest to avoid redundant database checks,
  // since we already explicitly checked for existing rows above.
  const driverRequestUniqueId = uuidv4();
  await db().query(
    `INSERT INTO DriverRequest
      (driverRequestUniqueId, userUniqueId, journeyStatusId,
       originLatitude, originLongitude, originPlace,
       driverRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      driverRequestUniqueId,
      driverUserUniqueId,
      newStatusId,
      originLat ?? 0,
      originLng ?? 0,
      originPlace ?? "Assigned by dispatcher",
      currentDate(),
    ]
  );

  return driverRequestUniqueId;
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

/**
 * ### Full assignment data — matches GET /api/company/assignments response shape.
 *
 * Queries the assignment with all joined fields so WS notification `data`
 * is identical to what the REST API returns.
 */
async function getFullAssignmentData(assignmentUniqueId) {
  const [[row]] = await db().query(
    `SELECT
       cba.assignmentUniqueId,
       cba.assignmentStatus,
       cba.companyBidRequestUniqueId,
       cba.driverUserUniqueId,
       cba.journeyDecisionUniqueId,
       u.fullName,
       u.phoneNumber,
       v.licensePlate,
       v.color,
       vt.vehicleTypeUniqueId,
       vt.vehicleTypeName,
       dr.driverRequestUniqueId   AS drUniqueId,
       dr.originLatitude,
       dr.originLongitude,
       dr.originPlace,
       dr.journeyStatusId,
       cba.vehicleUniqueId,
       sr.shipperRequestUniqueId,
       sr.shipperRequestId,
       sr.originLatitude          AS srOriginLatitude,
       sr.originLongitude         AS srOriginLongitude,
       sr.originPlace             AS srOriginPlace,
       sr.destinationLatitude,
       sr.destinationLongitude,
       sr.destinationPlace,
        sr.shippableItemName,
        sr.shippingCost,
        sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
        sr.requestMode,
        sr.journeyStatusId         AS srJourneyStatusId,
        srb.batchId                AS srBatchId,
        jd.decisionTime,
        jd.decisionBy,
        jd.journeyStatusId         AS jdJourneyStatusId,
        j.journeyStartedAt,
        j.journeyCompletedAt
      FROM CompanyBidVehicleAssignment cba
      LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
      LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
      LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
      LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
      LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
      LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId    = sr.shipperRequestBatchUniqueId
      LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
      WHERE cba.assignmentUniqueId = ?
      LIMIT 1`,
    [assignmentUniqueId],
  );
  if (!row) return null;
  return {
    assignmentUniqueId: row.assignmentUniqueId,
    assignmentStatus: row.assignmentStatus,
    batchId: row.srBatchId,
    shipperRequest: {
      shipperRequestUniqueId: row.shipperRequestUniqueId,
      shipperRequestId: row.shipperRequestId,
      batchId: row.srBatchId,
      originLatitude: row.srOriginLatitude,
      originLongitude: row.srOriginLongitude,
      originPlace: row.srOriginPlace,
      destinationLatitude: row.destinationLatitude,
      destinationLongitude: row.destinationLongitude,
      destinationPlace: row.destinationPlace,
      shippableItemName: row.shippableItemName,
      shippingCost: row.shippingCost,
      vehicleTypeUniqueId: row.srVehicleTypeUniqueId,
      requestMode: row.requestMode,
      journeyStatusId: row.srJourneyStatusId,
    },
    driverRequests: [
      {
        driverRequestUniqueId: row.drUniqueId,
        vehicleUniqueId: row.vehicleUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        userUniqueId: row.driverUserUniqueId,
        originLatitude: row.originLatitude,
        originLongitude: row.originLongitude,
        originPlace: row.originPlace,
        journeyStatusId: row.journeyStatusId,
        vehicleOfDriver: {
          licensePlate: row.licensePlate,
          vehicleTypeUniqueId: row.vehicleTypeUniqueId,
          vehicleTypeName: row.vehicleTypeName,
          color: row.color,
        },
      },
    ],
    decisions: [
      {
        journeyDecisionUniqueId: row.journeyDecisionUniqueId,
        journeyStatusId: row.jdJourneyStatusId,
        decisionTime: row.decisionTime,
        decisionBy: row.decisionBy,
      },
    ],
    journey:
      row.journeyStartedAt || row.journeyCompletedAt
        ? {
            journeyDecisionUniqueId: row.journeyDecisionUniqueId,
            journeyStartedAt: row.journeyStartedAt,
            journeyCompletedAt: row.journeyCompletedAt,
          }
        : {},
  };
}

/**
 * ### Notify company + dispatcher when a driver acts on a company assignment.
 *
 * Queries `CompanyBidVehicleAssignment` for the given `shipperRequestUniqueId`.
 * If found (company-targeted), sends:
 *   - FCM to the dispatcher who created the assignment
 *   - WebSocket to all online company members
 *
 * If no company assignment exists (individual flow), returns silently — no-op.
 *
 * @param {Object} opts
 * @param {string} opts.shipperRequestUniqueId
 * @param {string} [opts.driverName=""]  — driver display name for notification body
 * @param {string} opts.action           — one of:
 *   'started_journey' | 'completed_journey' | 'cancelled_by_driver' | 'rejected_by_driver'
 */
const notifyCompanyOnDriverAction = async ({
  shipperRequestUniqueId,
  driverName = "",
  action,
}) => {
  if (!shipperRequestUniqueId || !action) return;

  try {
    const [[assignment]] = await db().query(
      `SELECT cba.assignmentUniqueId, cba.companyBidRequestUniqueId,
              cba.assignmentCreatedBy, cbr.companyUniqueId
       FROM CompanyBidVehicleAssignment cba
       JOIN CompanyBidRequest cbr ON cba.companyBidRequestUniqueId = cbr.companyBidRequestUniqueId
       WHERE cba.shipperRequestUniqueId = ?
         AND cba.assignmentDeletedAt IS NULL
       LIMIT 1`,
      [shipperRequestUniqueId],
    );

    if (!assignment) return;

    // Fetch full record matching GET /api/company/assignments response shape
    const fullAssignment = await getFullAssignmentData(assignment.assignmentUniqueId);

    const actionConfig = {
      going_to_loading_place: {
        title: "Driver going to loading point",
        body: `Driver ${driverName} is on the way to the loading place.`,
        type: "driver_going_to_loading_place",
        messageType: messageTypes.company_driver_going_to_loading,
      },
      started_loading: {
        title: "Driver started loading",
        body: `Driver ${driverName} started loading at the loading place.`,
        type: "driver_started_loading",
        messageType: messageTypes.company_driver_started_loading,
      },
      completed_loading: {
        title: "Driver completed loading",
        body: `Driver ${driverName} completed loading and is ready to depart.`,
        type: "driver_completed_loading",
        messageType: messageTypes.company_driver_completed_loading,
      },
      started_journey: {
        title: "Driver started journey",
        body: `Driver ${driverName} has started the journey.`,
        type: "driver_started_journey",
        messageType: messageTypes.company_driver_journey_started,
      },
      completed_journey: {
        title: "Driver completed journey",
        body: `Driver ${driverName} has completed the journey.`,
        type: "driver_completed_journey",
        messageType: messageTypes.company_driver_completed,
      },
      cancelled_by_driver: {
        title: "Driver cancelled journey",
        body: `Driver ${driverName} cancelled the journey on your freight batch.`,
        type: "driver_cancelled_journey",
        messageType: messageTypes.company_driver_cancelled,
      },
      rejected_by_driver: {
        title: "Driver rejected assignment",
        body: `Driver ${driverName} rejected the freight assignment.`,
        type: "driver_rejected_assignment",
        messageType: messageTypes.company_driver_rejected,
      },
    };

    const config = actionConfig[action];
    if (!config) {
      logger.warn("Unknown company notification action", { action });
      return;
    }

    const companyNotif = { title: config.title, body: config.body };
    const companyData = fullAssignment || {
      type: config.type,
      assignmentUniqueId: assignment.assignmentUniqueId,
      shipperRequestUniqueId,
      companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
    };

    // FCM to the dispatcher / company admin who created the assignment
    sendFCMNotificationToUser({
      userUniqueId: assignment.assignmentCreatedBy,
      roleId: usersRoles.companyAdminRoleId,
      notification: companyNotif,
      data: companyData,
    }).catch((e) =>
      logger.error("FCM failed for company on driver action", {
        error: e.message,
        action,
        shipperRequestUniqueId,
      }),
    );

    // WebSocket to all online company members
    sendSocketIONotificationToCompany({
      companyUniqueId: assignment.companyUniqueId,
      message: {
        messageTypes: config.messageType,
        message: `Driver action: ${action}`,
        notification: companyNotif,
        data: companyData,
      },
    }).catch((e) =>
      logger.warn("WebSocket to company failed on driver action", {
        error: e.message,
        action,
        companyUniqueId: assignment.companyUniqueId,
      }),
    );
  } catch (e) {
    logger.error("Failed to notify company on driver action", {
      error: e.message,
      action,
      shipperRequestUniqueId,
    });
  }
};

/**
 * ### Batch fetch full assignment records — matches GET /api/company/assignments.
 *
 * Accepts an array of assignmentUniqueId values and returns all matched records
 * in a single query, keyed by assignmentUniqueId.
 */
async function getAssignmentsData(assignmentUniqueIds) {
  if (!assignmentUniqueIds || assignmentUniqueIds.length === 0) return {};
  const [rows] = await db().query(
    `SELECT
       cba.assignmentUniqueId,
       cba.assignmentStatus,
       cba.companyBidRequestUniqueId,
       cba.driverUserUniqueId,
       cba.journeyDecisionUniqueId,
       u.fullName,
       u.phoneNumber,
       v.licensePlate,
       v.color,
       vt.vehicleTypeUniqueId,
       vt.vehicleTypeName,
       dr.driverRequestUniqueId   AS drUniqueId,
       dr.originLatitude,
       cba.vehicleUniqueId,
       dr.originLongitude,
       dr.originPlace,
       dr.journeyStatusId,
       sr.shipperRequestUniqueId,
       sr.shipperRequestId,
       sr.originLatitude          AS srOriginLatitude,
       sr.originLongitude         AS srOriginLongitude,
       sr.originPlace             AS srOriginPlace,
       sr.destinationLatitude,
       sr.destinationLongitude,
       sr.destinationPlace,
        sr.shippableItemName,
        sr.shippingCost,
        sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
        sr.requestMode,
        sr.journeyStatusId         AS srJourneyStatusId,
        srb.batchId                AS srBatchId,
        jd.decisionTime,
        jd.decisionBy,
        jd.journeyStatusId         AS jdJourneyStatusId,
        j.journeyStartedAt,
        j.journeyCompletedAt
      FROM CompanyBidVehicleAssignment cba
      LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
      LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
      LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
      LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
      LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
      LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId    = sr.shipperRequestBatchUniqueId
      LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
      WHERE cba.assignmentUniqueId IN (?)
        AND cba.assignmentDeletedAt IS NULL`,
    [assignmentUniqueIds],
  );
  const map = {};
  for (const row of rows) {
    map[row.assignmentUniqueId] = {
      assignmentUniqueId: row.assignmentUniqueId,
      assignmentStatus: row.assignmentStatus,
      batchId: row.srBatchId,
      shipperRequest: {
        shipperRequestUniqueId: row.shipperRequestUniqueId,
        shipperRequestId: row.shipperRequestId,
        batchId: row.srBatchId,
        originLatitude: row.srOriginLatitude,
        originLongitude: row.srOriginLongitude,
        originPlace: row.srOriginPlace,
        destinationLatitude: row.destinationLatitude,
        destinationLongitude: row.destinationLongitude,
        destinationPlace: row.destinationPlace,
        shippableItemName: row.shippableItemName,
        shippingCost: row.shippingCost,
        vehicleTypeUniqueId: row.srVehicleTypeUniqueId,
        requestMode: row.requestMode,
        journeyStatusId: row.srJourneyStatusId,
      },
      driverRequests: [
        {
          driverRequestUniqueId: row.drUniqueId,
          vehicleUniqueId: row.vehicleUniqueId,
          fullName: row.fullName,
          phoneNumber: row.phoneNumber,
          userUniqueId: row.driverUserUniqueId,
          originLatitude: row.originLatitude,
          originLongitude: row.originLongitude,
          originPlace: row.originPlace,
          journeyStatusId: row.journeyStatusId,
          vehicleOfDriver: {
            licensePlate: row.licensePlate,
            vehicleTypeUniqueId: row.vehicleTypeUniqueId,
            vehicleTypeName: row.vehicleTypeName,
            color: row.color,
          },
        },
      ],
      decisions: [
        {
          journeyDecisionUniqueId: row.journeyDecisionUniqueId,
          journeyStatusId: row.jdJourneyStatusId,
          decisionTime: row.decisionTime,
          decisionBy: row.decisionBy,
        },
      ],
      journey:
        row.journeyStartedAt || row.journeyCompletedAt
          ? {
              journeyDecisionUniqueId: row.journeyDecisionUniqueId,
              journeyStartedAt: row.journeyStartedAt,
              journeyCompletedAt: row.journeyCompletedAt,
            }
          : {},
    };
  }
  return map;
}

module.exports = {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  findActiveAssignmentForSlot,
  notifyCompanyOnDriverAction,
  getFullAssignmentData,
  getAssignmentsData,
};
