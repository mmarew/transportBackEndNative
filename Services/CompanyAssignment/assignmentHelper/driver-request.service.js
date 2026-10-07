"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../../Utils/CurrentDate");
const { db } = require("../../CompanyHelper.service");
const {
  journeyStatusMap,
  usersRoles,
  CANCELED_JOURNEY_CONTEXTS,
  COMPANY_REPLACED_INDIVIDUAL_REASON,
  isTerminalJourneyStatus,
} = require("../../../Utils/ListOfSeedData");
const { createCanceledJourney } = require("../../CanceledJourneys");
const { getCancellationReasonIdByName } = require("../../Cancellation.service");
const { sendFCMNotificationToUser } = require("../../Firebase.service");
const { sendSocketIONotificationToDriver } = require("../../../Utils/Notifications");
const messageTypes = require("../../../Utils/MessageTypes");
const logger = require("../../../Utils/logger");
const { updateData } = require("../../../CRUD/Update/Data.update");

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
 * @param {string} [opts.shipperRequestUniqueId] - slot being assigned; enables the
 *        one-decision-per-DR guard in `driverRequestMustStartFresh`
 * @returns {Promise<string>} The driverRequestUniqueId to link in the assignment.
 */

/**
 * driverRequestMustStartFresh
 * ───────────────────────────
 * `JourneyDecisions.driverRequestId` is UNIQUE (Database/schema/06_driver_orders.js:50),
 * so one DriverRequest carries at most ONE decision for its whole life — and
 * `createJourneyDecisionForAssignment` returns that decision verbatim whenever
 * the slot matches. Two situations must therefore NOT reuse the driver's
 * current DR row:
 *
 *  - the linked decision belongs to a DIFFERENT slot → the fresh INSERT blows
 *    up with ER_DUP_ENTRY (this is the pre-existing `POST /assignments/auto`
 *    500: a driver cancelled a company job, DR went back to waiting with the
 *    old decision still attached, and auto-assign tried to reuse it);
 *  - the linked decision is TERMINAL for THIS slot (driver cancel / company
 *    recall leaves exactly that state) → the new assignment would silently be
 *    stamped with a dead decision and the driver would see a cancelled
 *    journey instead of the replacement.
 *
 * In both cases the old DR+JD pair is kept as history and a fresh DR is
 * inserted below, so the new job gets its own decision.
 *
 * Returns false when there is no slot context, no linked decision, the status
 * is `rejectedByDriver` (its own branch also notifies the driver), or an active
 * INDIVIDUAL decision on another slot (the individual-cancellation branch must
 * process that one — it also returns the individual slot to waiting).
 *
 * @param {Object} opts
 * @param {string} opts.existingUniqueId
 * @param {number} opts.existingStatus
 * @param {string} [opts.shipperRequestUniqueId]
 * @returns {Promise<boolean>}
 */
async function driverRequestMustStartFresh({
  existingUniqueId,
  existingStatus,
  shipperRequestUniqueId,
}) {
  if (!shipperRequestUniqueId) return false;

  const [rows] = await db().query(
    `SELECT jd.journeyDecisionUniqueId, jd.journeyStatusId,
            sr.shipperRequestUniqueId
       FROM JourneyDecisions jd
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       LEFT JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
      WHERE dr.driverRequestUniqueId = ?
      LIMIT 1`,
    [existingUniqueId],
  );
  const linked = rows?.[0];
  if (!linked?.journeyDecisionUniqueId) return false;
  if (Number(existingStatus) === journeyStatusMap.rejectedByDriver) {
    return false; // handled by the terminal-individual branch below (notifies the driver)
  }

  const individualStatuses = [
    journeyStatusMap.waiting,    // 1
    journeyStatusMap.requested,  // 2
    journeyStatusMap.acceptedByDriver, // 3
  ];

  if (linked.shipperRequestUniqueId === shipperRequestUniqueId) {
    // Same slot: reuse only while the decision is still live (idempotent
    // retry); a terminal one must be replaced by a fresh decision.
    return isTerminalJourneyStatus(linked.journeyStatusId);
  }

  // Different slot: delegate only when the individual-cancellation branch
  // below will actually process it (active individual DR + active individual
  // decision); in every other case the row cannot be reused.
  const handledByIndividualBranch =
    individualStatuses.includes(Number(linked.journeyStatusId)) &&
    individualStatuses.includes(Number(existingStatus));
  return !handledByIndividualBranch;
}

const upsertDriverRequest = async ({
  driverUserUniqueId,
  newStatusId,
  originLat,
  originLng,
  originPlace,
  shipperRequestUniqueId,
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

    // ── One decision per DriverRequest guard ─────────────────────────────────
    // See driverRequestMustStartFresh: a decision that belongs to another slot
    // (ER_DUP_ENTRY) or a terminal decision on this slot (stale cancelled
    // journey) both disqualify the row from reuse. Soft-delete it and fall
    // through to the INSERT path so the new job gets a fresh decision.
    const mustStartFresh = await driverRequestMustStartFresh({
      existingUniqueId,
      existingStatus,
      shipperRequestUniqueId,
    });

    if (mustStartFresh) {
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestUniqueId: existingUniqueId },
        updateValues: {
          journeyStatusId: journeyStatusMap.replacedByCompanyAssignment,
          driverRequestDeletedAt: currentDate(),
          driverRequestUpdatedAt: currentDate(),
        },
      });
      logger.info("DriverRequest soft-deleted (linked decision belongs to another or finished job)", {
        driverRequestUniqueId: existingUniqueId,
        driverUserUniqueId,
        shipperRequestUniqueId,
      });
    }

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

    if (!mustStartFresh && terminalIndividualStatuses.includes(existingStatus)) {
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

    } else if (!mustStartFresh && activeIndividualStatuses.includes(existingStatus)) {
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
    } else if (!mustStartFresh) {
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

module.exports.upsertDriverRequest = upsertDriverRequest;
module.exports.findActiveAssignmentForSlot = findActiveAssignmentForSlot;
module.exports.driverRequestMustStartFresh = driverRequestMustStartFresh;
