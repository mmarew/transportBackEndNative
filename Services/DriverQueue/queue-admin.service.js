"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const { emitQueueSnapshot, notifyQueueOrgAdmins } = require("../../Utils/QueueSocket");
const logger = require("../../Utils/logger");
const {
  today, queueOrgReady, logQueueHistory, getVehicleDriverType,
  getVehicleDriverByPhone, nextQueueNumber, publicEntry,
  buildDriverPhotoMap, buildQueueEntry,
} = require("./helpers");
const {
  rescanPendingQueueOrder,
} = require("./dispatch");

/**
 * Full queue for an org+day, grouped by vehicle type — the dispute truth.
 */
exports.getQueueStatus = async (queueOrganizationUniqueId, query) => {
  const executor = db();
  const queueDate = query.queueDate || today();

  // Get queue organization details
  const [orgRows] = await executor.query(
    `SELECT queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
            queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
            checkinRadiusKm, approvalStatus, queueEnabled, approvedBy, approvedAt
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );

  if (orgRows.length === 0) {
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }
  const org = orgRows[0];

  const [rows] = await executor.query(
    `SELECT dq.queueUniqueId, dq.queueNumber, dq.joinedAt, dq.status,
            dq.requestedAt, dq.agreedAt, dq.vehicleDriverUniqueId,
            dq.shipperRequestUniqueId, dq.targetedShipperUserUUID,
            dq.driverLatitude, dq.driverLongitude,
            areq.driverRequestId AS activeDriverRequestId,
            areq.driverRequestUniqueId AS activeDriverRequestUniqueId,
            areq.journeyStatusId AS driverJourneyStatusId,
            vd.driverUserUniqueId, vd.vehicleDriverId AS driverVehicleDriverId,
            v.vehicleUniqueId, v.vehicleTypeUniqueId,
            v.licensePlate,
            vt.vehicleTypeId, vt.vehicleTypeName,
            u.fullName, u.phoneNumber, u.email,
            su.fullName AS shipperFullName, su.phoneNumber AS shipperPhoneNumber,
            su.email AS shipperEmail, su.userUniqueId AS shipperUserUniqueId,
            sr.shipperRequestId, sr.shipperRequestUniqueId AS orderShipperRequestUniqueId,
            sr.shipperRequestBatchUniqueId, sr.userUniqueId AS orderUserUniqueId,
            sr.vehicleTypeUniqueId AS orderVehicleTypeUniqueId,
            sr.journeyStatusId AS orderJourneyStatusId, sr.requestMode,
            sr.targetCompanyUniqueId, sr.originLatitude, sr.originLongitude,
            sr.originPlace, sr.destinationLatitude, sr.destinationLongitude,
            sr.destinationPlace, sr.shipperRequestCreatedAt,
            sr.shippableItemName, sr.shippableItemQtyInQuintal,
            sr.shippingDate, sr.deliveryDate, sr.shippingCost,
            sr.isPodRequired, sr.isCompletionSeen, sr.shipperRequestCreatedBy,
            srbs.queueOrganizationUniqueId AS orderQueueOrganizationUniqueId,
            ordertt.vehicleTypeName AS orderVehicleTypeName,
            jd.journeyDecisionId, jd.journeyDecisionUniqueId,
            jd.shipperRequestId AS decisionShipperRequestId,
            jd.driverRequestId AS decisionDriverRequestId,
            jd.journeyStatusId AS decisionJourneyStatusId,
            jd.decisionTime, jd.decisionBy, jd.journeyDecisionCreatedAt,
            jd.shippingDateByDriver, jd.deliveryDateByDriver, jd.shippingCostByDriver,
            j.journeyUniqueId, j.journeyStatusId AS journeyJourneyStatusId,
            j.fare AS journeyFare, j.journeyStartedAt AS journeyJourneyStartedAt,
            j.journeyCompletedAt AS journeyJourneyCompletedAt
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     LEFT JOIN DriverRequest areq ON areq.driverRequestId = (
       SELECT req.driverRequestId
       FROM DriverRequest req
       WHERE req.userUniqueId = vd.driverUserUniqueId
         AND req.driverRequestDeletedAt IS NULL
       ORDER BY req.driverRequestId DESC
       LIMIT 1
     )
     LEFT JOIN JourneyDecisions jd
       ON jd.driverRequestId = areq.driverRequestId
     LEFT JOIN ShipperRequest sr
       ON sr.shipperRequestId = jd.shipperRequestId
      AND sr.shipperRequestDeletedAt IS NULL
     LEFT JOIN ShipperRequestBatch srbs ON srbs.batchUniqueId = sr.shipperRequestBatchUniqueId
     LEFT JOIN Users su ON su.userUniqueId = sr.userUniqueId
     LEFT JOIN VehicleTypes ordertt ON ordertt.vehicleTypeUniqueId = sr.vehicleTypeUniqueId
     LEFT JOIN Journey j ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC`,
    [queueOrganizationUniqueId, queueDate],
  );

  const photosByDriver = await buildDriverPhotoMap(executor, rows);

  const byType = {};
  for (const row of rows) {
    const typeName =
      row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(buildQueueEntry(row, photosByDriver));
  }

  return {
    message: "Query results fetched",
    data: {
      queueOrganization: org,
      queueDate,
      totalWaiting: rows.filter((r) =>
        ["waiting", "notagreed"].includes(r.status),
      ).length,
      queues: byType,
    },
  };
};


/**
 * QueueOrgAdmin manually checks a driver/vehicle into the queue.
 *
 * Mirrors `checkin`'s create-new-data rule: if the driver already has an entry
 * at this org today (active or leftover), it is soft-deleted (`status='removed'`
 * + `queueDeletedAt`) and a brand-new row is inserted with a fresh queueUniqueId
 * and a fresh back-of-line queueNumber. Every manual check-in therefore yields
 * unique queue data; there is no one-entry-per-(vehicle, org, day) constraint.
 */
exports.manualCheckin = async (data) => {
  const {
    queueOrganizationUniqueId,
    vehicleDriverUniqueId,
    driverPhoneNumber,
    user,
  } = data;
  const executor = db();

  let targetedShipperUserUUID = null;
  if (data.shipperPhoneNumber) {
    targetedShipperUserUUID = await resolveShipperUserByPhone(
      data.shipperPhoneNumber,
      user.userUniqueId,
    );
  }

  await queueOrgReady(executor, queueOrganizationUniqueId);

  // Resolve the driver: by UUID if provided, otherwise by phone number.
  let vehicleDriver;
  if (vehicleDriverUniqueId) {
    vehicleDriver = await getVehicleDriverType(executor, vehicleDriverUniqueId);
  } else if (driverPhoneNumber) {
    vehicleDriver = await getVehicleDriverByPhone(executor, driverPhoneNumber);
  } else {
    throw new AppError(
      "Provide vehicleDriverUniqueId or driverPhoneNumber",
      AppError.BAD_REQUEST,
    );
  }
  const queueDate = today();

  // FENCE: a driver holding an ACTIVE engagement — an UNRESOLVED queue offer
  // (status 2 = requested) or an in-flight journey (accepted/started, not yet
  // completed or cancelled) — cannot be force-checked in. Retiring the queue
  // entry that carries the live offer would orphan it, so the driver must
  // cancel/accept the existing connection first.
  if (await hasActiveJourney(executor, vehicleDriver.driverUserUniqueId)) {
    throw new AppError(
      "Driver has an active journey — finish or cancel it before joining the queue",
      AppError.CONFLICT,
    );
  }

  // FENCE: driver can only be in ONE ACTIVE queue system-wide per day; an
  // active entry in a different org is rejected below. Re-check-in at the same
  // org retires the prior entry and inserts a brand-new row (fresh queueUniqueId),
  // so there is no unique key on (vehicleDriverUniqueId, org, date).
  const { active, atOrg } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
    queueOrganizationUniqueId,
  );
  if (
    active &&
    active.queueOrganizationUniqueId !== queueOrganizationUniqueId
  ) {
    // FENCE: driver is already active in ANOTHER org today. One queue per
    // driver per day system-wide — reject rather than silently return.
    throw new AppError(
      "Driver is already in a queue for today — one queue per day",
      AppError.CONFLICT,
    );
  }

  // RE-CHECK-IN creates BRAND-NEW data: retire any prior same-day entry at this
  // org (soft-delete) and insert a fresh row with a new queueUniqueId +
  // back-of-line queueNumber. There is no unique key on (vehicle, org, day),
  // so multiple historical rows per driver/org/day are retained; the live one
  // is always the newest with queueDeletedAt IS NULL.
  if (atOrg) {
    await logQueueHistory(executor, {
      queueUniqueId: atOrg.queueUniqueId,
      columnName: "status",
      oldValue: atOrg.status,
      newValue: "removed",
      performedBy: user.userUniqueId,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "removed",
        shipperRequestUniqueId: null,
        targetedShipperUserUUID: null,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: user.userUniqueId,
        queueDeletedAt: currentDate(),
        queueDeletedBy: user.userUniqueId,
      },
      conditions: { queueId: atOrg.queueId },
    });
  }

  const queueUniqueId = uuidv4();
  const assignedNumber = await nextQueueNumber(
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleDriver.vehicleTypeUniqueId,
  );

  try {
    await createData({
      tableName: "DriverQueue",
      insertValues: {
        queueUniqueId,
        queueOrganizationUniqueId,
        queueDate,
        queueNumber: assignedNumber,
        vehicleDriverUniqueId,
        targetedShipperUserUUID,
        joinedAt: currentDate(),
        status: "waiting",
        queueCreatedBy: user.userUniqueId,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError(
        "Driver is already in the queue for this day",
        AppError.CONFLICT,
      );
    }
    throw error;
  }

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({ queueOrganizationUniqueId });

  // Audit log for manual checkin
  await createData(
    {
      tableName: "QueueAuditLog",
      insertValues: {
        queueAuditUniqueId: uuidv4(),
        queueOrganizationUniqueId,
        queueDate,
        queueUniqueId,
        action: "manual_checkin",
        afterValue: JSON.stringify({
          queueNumber: assignedNumber,
          status: "waiting",
        }),
        performedBy: user.userUniqueId,
      },
    },
    executor,
  );

  // Auto-dispatch pending orders to this newly available driver
  await rescanPendingQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    user,
    executor,
  });

  return {
    message: "success",
    data: { queueUniqueId, queueNumber: assignedNumber, status: "waiting" },
  };
};


/**
 * Supervisor override — reorder a queue entry. Audit logged.
 */
exports.overrideEntry = async (queueUniqueId, body, user) => {
  const executor = db();
  const { queueNumber, reason } = body;

  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate, queueNumber, queueUniqueId FROM DriverQueue
     WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    columnName: "queueNumber",
    oldValue: rows[0].queueNumber,
    newValue: queueNumber,
    performedBy: user.userUniqueId,
  });

  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      queueNumber,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
    },
    conditions: { queueId: rows[0].queueId },
  });

  await createData({
    tableName: "QueueAuditLog",
    insertValues: {
      queueAuditUniqueId: uuidv4(),
      queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
      queueDate: rows[0].queueDate,
      queueUniqueId: rows[0].queueUniqueId,
      action: "override",
      beforeValue: JSON.stringify({ queueNumber: rows[0].queueNumber }),
      afterValue: JSON.stringify({ queueNumber }),
      reason: reason || null,
      performedBy: user.userUniqueId,
    },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    messageType: "queue_position_changed",
  });

  return { message: "success", data: { queueUniqueId, queueNumber } };
};


/**
 * Remove a queue entry (no-show / override / checkout by admin).
 */
exports.removeEntry = async (queueUniqueId, user) => {
  const executor = db();

  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate, vehicleDriverUniqueId, queueUniqueId, status
     FROM DriverQueue WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    columnName: "status",
    oldValue: rows[0].status,
    newValue: "removed",
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
    },
    conditions: { queueId: rows[0].queueId },
  });

  await createData({
    tableName: "QueueAuditLog",
    insertValues: {
      queueAuditUniqueId: uuidv4(),
      queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
      queueDate: rows[0].queueDate,
      queueUniqueId: rows[0].queueUniqueId,
      action: "remove",
      afterValue: JSON.stringify({ status: "removed" }),
      performedBy: user.userUniqueId,
    },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    messageType: "queue_removed",
  });

  return { message: "success", data: { queueUniqueId, status: "removed" } };
};



module.exports = exports;
