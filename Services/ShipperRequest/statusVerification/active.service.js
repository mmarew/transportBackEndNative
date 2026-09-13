"use strict";

const { pool } = require("../../../Middleware/Database.config");
const {
  getData,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  findNearbyShippers,
} = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const { insertData } = require("../../../CRUD/Create/CreateData");
const {
  sendSocketIONotificationToDriver,
} = require("../../../Utils/Notifications");
const { getVehicleDrivers } = require("../../VehicleDriver.service");
const {
  getJourneyDecision4AllOrSingleUser,
} = require("../../JourneyDecisions.service");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../Utils/logger");
const { currentDate } = require("../../../Utils/CurrentDate");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const { BATCH_DECLINED_JOURNEY_STATUSES } = require("./constants");
const { ensureWaitingDriverRequest } = require("./matching.service");
const { sendShipperNotification } = require("./notify.service");

/**
 * Handles non-waiting requests (status 2, 3, etc.) - fetches existing journey decisions and sends notifications
 * @param {Object} params - Handler parameters
 * @param {Object} params.shipperRequest - Shipper request object
 * @param {Object} params.totalRecords - Total records for pagination
 * @param {number} params.pageSize - Page size
 * @param {number} params.page - Page number
 * @param {Array} params.driversData - Array to push driver data
 * @param {Array} params.decisions - Array to push final decisions
 * @param {Set} params.notifiedDrivers - Set to track notified drivers
 * @param {Set} params.notifiedShippersForAcceptance - Set to track shipper-driver acceptance notifications
 * @param {boolean} params.sendNotificationsToDrivers - Whether to send notifications to drivers
 * @param {boolean} params.sendNotificationsToShipper - Whether to send notifications to shipper
 */
// Removed unused function: handleNonWaitingRequest
// eslint-disable-next-line no-unused-vars
const _handleNonWaitingRequest = async ({
  shipperRequest,
  totalRecords,
  pageSize,
  page,
  driversData,
  decisions,
  notifiedDrivers,
  notifiedShippersForAcceptance,
  sendNotificationsToDrivers,
  sendNotificationsToShipper,
}) => {
  const filters = {
    shipperRequestId: shipperRequest?.shipperRequestId,

    journeyStatusId: shipperRequest?.journeyStatusId,
  };
  // if  shipperRequest?.journeyStatusId, is 6 then get unseen by shipper completed journeys
  if (shipperRequest?.journeyStatusId === journeyStatusMap.journeyCompleted) {
    filters.isCompletionSeen = false;
  }
  const decisionsData = await getJourneyDecision4AllOrSingleUser({
    data: { filters },
  });

  for (let journeyDecision of decisionsData?.data || []) {
    const journeyStatusId = journeyDecision.journeyStatusId;

    // Note: isCompletionSeen filter is now handled at database level (line 280)
    // so we don't need to check it here anymore

    decisions.push(journeyDecision);

    // Journey can be created after journey is started
    let journeyData = [];
    if (journeyStatusId >= journeyStatusMap?.journeyStarted) {
      journeyData = await getData({
        tableName: "Journey",
        conditions: {
          journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
        },
      });
    }
    // get data of driver request
    const driverData = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        driverRequestId: journeyDecision?.driverRequestId,
      },
    });
    // get profile picture data of driver
    const driver = driverData[0];
    const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
      driver?.userUniqueId,
      listOfDocumentsTypeAndId.profilePhoto,
    );

    const data = documents?.data;
    const lastDataIndex = data?.length - 1;
    const driverProfilePhoto = data?.[lastDataIndex]?.attachedDocumentName;
    const phoneNumber = driver?.phoneNumber;

    // get vehicle data of driver
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: driver?.userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicleOfDriver = vdResult?.data;
    // structure driver info
    const driverInfo = {
      vehicleOfDriver: vehicleOfDriver?.[0],
      driver: { ...driver, driverProfilePhoto },
    };
    driversData.push(driverInfo);

    // Use shipperRequest directly - all journey decisions are already filtered by this shipperRequestId
    const message = {
      messageTypes: messageTypes.driver_found_shipper_request,
      message: "Shipper request status verified",
      status: driver?.journeyStatusId,
      shipper: shipperRequest,
      driver: driverInfo,
      journey: journeyData?.length > 0 ? journeyData[0] : null,
      decision: journeyDecision || null,
    };

    // Only send notification if sendNotificationsToDrivers is true and driver hasn't been notified yet
    if (
      sendNotificationsToDrivers &&
      phoneNumber &&
      !notifiedDrivers.has(phoneNumber)
    ) {
      await sendSocketIONotificationToDriver({
        message,
        phoneNumber,
      });
      notifiedDrivers.add(phoneNumber);
    }

    // Send WebSocket notification to shipper when driver accepts (status 3 - acceptedByDriver)
    // Only send if sendNotificationsToShipper is true (e.g., when called from acceptShipperRequest)
    // Don't send when shipper is just checking their status (API endpoint)
    if (
      journeyStatusId === journeyStatusMap.acceptedByDriver &&
      sendNotificationsToShipper
    ) {
      const shipperUserUniqueId = shipperRequest?.userUniqueId;
      const driverUserUniqueId = driver?.userUniqueId;

      // Create unique key for shipper-driver combination to avoid duplicate notifications
      const notificationKey = `${shipperUserUniqueId}-${driverUserUniqueId}`;

      if (
        shipperUserUniqueId &&
        driverUserUniqueId &&
        !notifiedShippersForAcceptance.has(notificationKey)
      ) {
        // Get shipper phone number
        const shipperUserData = await performJoinSelect({
          baseTable: "Users",
          joins: [],
          conditions: { userUniqueId: shipperUserUniqueId },
        });
        const shipperPhoneNumber = shipperUserData?.[0]?.phoneNumber;

        if (shipperPhoneNumber) {
          // Use the extracted notification function
          await sendShipperNotification({
            shipperRequest,
            journeyDecision,
            driverInfo,
            journeyData: journeyData?.length > 0 ? journeyData[0] : {},
            messageType: messageTypes.driver_accepted_shipper_request,
            status: journeyStatusMap.acceptedByDriver,
            totalRecords,
            pageSize,
            page,
          });

          notifiedShippersForAcceptance.add(notificationKey);
        }
      }
    }
  }
};

/**
 * Driver-anchored bid-board pull, used at check-in.
 *
 * findNearbyDrivers is ORDER-anchored: it can only see drivers who already hold
 * an eligible (waiting/rejectedByDriver) DriverRequest when it runs. A driver
 * who checks in AFTER the bid order was created has only terminal history and
 * is invisible to it. So the check-in matches in the reverse direction — search
 * pending bid orders around the driver's CURRENT check-in coordinates
 * (findNearbyShippers — no DriverRequest needed to search), scope to THIS org's
 * open bidding board, and offer the nearest open board order.
 *
 * Contention policy: the driver's single active request (activeRequestGuard) is
 * NEVER force-released here. If it is already engaged elsewhere,
 * ensureWaitingDriverRequest returns null and the pull reports offered:false —
 * the driver stays in line and the queue waits for the timeout sweepers to clear
 * the foreign hold.
 *
 * Batch-refusal rule: a driver who already reached a "said no" status on ANY
 * order of the candidate's batch (BATCH_DECLINED_JOURNEY_STATUSES — rejected /
 * cancelled / no-answer) is NOT pulled for the other batch jobs on re-check-in.
 * Re-linking a cooled batch to the driver is a manual dispatch decision only.
 *
 * @param {Object}   params
 * @param {string}   params.driverUserUniqueId - just-checked-in driver
 * @param {number}   params.driverLatitude     - driver's CURRENT position (lat)
 * @param {number}   params.driverLongitude    - driver's CURRENT position (lng)
 * @param {string}   params.queueOrganizationUniqueId - this org's board only
 * @param {string}   params.vehicleTypeUniqueId
 * @param {Object}   params.user - request actor (audit + notification)
 * @returns {Promise<{ offered: boolean, data: Object|null }>}
 */
const pullPendingBidOrderForDriver = async ({
  driverUserUniqueId,
  driverLatitude,
  driverLongitude,
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  user,
}) => {
  try {
    if (!driverLatitude || !driverLongitude) {
      logger.warn("pullPendingBidOrderForDriver: no check-in coordinates", {
        driverUserUniqueId,
      });
      return { offered: false, data: null };
    }
    const executor = transactionStorage.getStore() || pool;

    const nearByShippers = await findNearbyShippers({
      originLatitude: driverLatitude,
      originLongitude: driverLongitude,
      vehicleTypeUniqueId,
    });

    // Scope to THIS org's open bidding board only. findNearbyShippers returns
    // street orders (no org) plus any org's board; its lifecycle filter is
    // (waiting, requested, acceptedByDriver) — accepted orders are no longer
    // offerable, so keep waiting/requested. Already ordered distanceKm ASC.
    const board = (nearByShippers || []).filter(
      (r) =>
        r.queueOrganizationUniqueId &&
        r.queueOrganizationUniqueId === queueOrganizationUniqueId &&
        (r.isBiddingApproved === true ||
          r.isBiddingApproved === 1 ||
          r.isBiddingApproved === "1") &&
        (Number(r.journeyStatusId) === journeyStatusMap.waiting ||
          Number(r.journeyStatusId) === journeyStatusMap.requested),
    );

    for (const order of board) {
      // BATCH-level guard: block this driver on the ENTIRE batch when they carry
      // an ACTIVE (requested/acceptedByDriver) decision on ANY order of it OR
      // have reached a "said no" terminal status on ANY order of it
      // (BATCH_DECLINED_JOURNEY_STATUSES). The declined set is the batch-refusal
      // rule: once a driver rejects/cancels/times out on one job of a batch the
      // other jobs must NOT be auto-pulled on re-check-in — re-linking is a
      // manual dispatch decision only. Mirrors findNearbyDrivers'
      // VerifyIfShipperRequestWasNotRejected exclusion (matching.js:95-109) plus
      // the active-offer hold.
      const [existing] = await executor.query(
        `SELECT COUNT(*) AS count
         FROM JourneyDecisions jd
         JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
         JOIN ShipperRequest sr2 ON sr2.shipperRequestId = jd.shipperRequestId
         WHERE dr.userUniqueId = ? AND sr2.shipperRequestBatchUniqueId = ?
           AND jd.journeyStatusId IN (${[...BATCH_DECLINED_JOURNEY_STATUSES, journeyStatusMap.requested, journeyStatusMap.acceptedByDriver].map(() => "?").join(", ")})`,
        [
          driverUserUniqueId,
          order.shipperRequestBatchUniqueId,
          ...BATCH_DECLINED_JOURNEY_STATUSES,
          journeyStatusMap.requested,
          journeyStatusMap.acceptedByDriver,
        ],
      );
      if (existing[0].count > 0) continue;

      // Headroom guard: at most 5 invites per bid order.
      const [cnt] = await executor.query(
        `SELECT COUNT(*) AS count FROM JourneyDecisions WHERE shipperRequestId = ?`,
        [order.shipperRequestId],
      );
      // eslint-disable-next-line no-magic-numbers -- max drivers to offer per request
      if (cnt[0].count >= 5) continue;

      // Arm the driver for THIS offer at their CURRENT check-in position so the
      // distance used by the offer is their live position, never a finished job.
      // Returns null when the driver holds an active engagement — skip (no
      // reclaim). Returns an existing decisionless waiting request otherwise.
      const fresh = await ensureWaitingDriverRequest(
        executor,
        driverUserUniqueId,
        queueOrganizationUniqueId,
        {
          latitude: driverLatitude,
          longitude: driverLongitude,
          place: "Queue check-in",
        },
      );
      if (!fresh) return { offered: false, data: null };

      // Mint the JourneyDecision exactly like handleWaitingRequest (:370-422).
      const journeyDecisionUniqueId = uuidv4();
      const journeyDecisionPayload = {
        journeyDecisionUniqueId,
        shipperRequestId: order.shipperRequestId,
        driverRequestId: fresh.driverRequestId,
        journeyStatusId: journeyStatusMap.requested,
        decisionTime: currentDate(),
        decisionBy: "shipper",
        journeyDecisionCreatedBy: user.userUniqueId,
        journeyDecisionCreatedAt: currentDate(),
      };
      try {
        await insertData({
          tableName: "JourneyDecisions",
          colAndVal: journeyDecisionPayload,
        });
      } catch (error) {
        if (
          error.code === "ER_DUP_ENTRY" ||
          error.message?.includes("Duplicate entry") ||
          error.message?.includes("driverRequestId")
        ) {
          logger.warn(
            "pullPendingBidOrderForDriver: duplicate decision, skipping",
            { driverUserUniqueId, shipperRequestId: order.shipperRequestId },
          );
          continue;
        }
        throw error;
      }
      await updateData({
        tableName: "ShipperRequest",
        conditions: { shipperRequestId: order.shipperRequestId },
        updateValues: { journeyStatusId: journeyStatusMap.requested },
      });
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestId: fresh.driverRequestId },
        updateValues: { journeyStatusId: journeyStatusMap.requested },
      });

      if (user?.phoneNumber) {
        try {
          await sendSocketIONotificationToDriver({
            message: {
              messageTypes: messageTypes.driver_found_shipper_request,
              message: "Driver found for shipper request",
              status: journeyStatusMap.requested,
              shipper: order,
              driver: { driver: { driverUserUniqueId } },
              journey: null,
              decisions: journeyDecisionPayload,
              totalRecords: null,
              pageSize: null,
              page: null,
            },
            phoneNumber: user.phoneNumber,
          });
        } catch (error) {
          logger.warn("pullPendingBidOrderForDriver: notification failed", {
            error: error.message,
            driverUserUniqueId,
          });
        }
      }
      return {
        offered: true,
        data: {
          journeyDecisionUniqueId,
          shipperRequestId: order.shipperRequestId,
          shipperRequestUniqueId: order.shipperRequestUniqueId,
          driverRequestId: fresh.driverRequestId,
          journeyStatusId: journeyStatusMap.requested,
        },
      };
    }
    return { offered: false, data: null };
  } catch (error) {
    logger.error("Error in pullPendingBidOrderForDriver", {
      error: error.message,
      stack: error.stack,
      driverUserUniqueId,
      queueOrganizationUniqueId,
    });
    return { offered: false, data: null };
  }
};

module.exports.pullPendingBidOrderForDriver = pullPendingBidOrderForDriver;
