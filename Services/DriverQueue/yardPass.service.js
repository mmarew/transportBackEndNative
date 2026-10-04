"use strict";

const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { yardAccessWithShipperTurn, stageNameFor } = require("./helpers");

/**
 * YARD GATE CHECK — read-only verdict for the loading-yard gate.
 *
 * The yard's authority is the driver's JOB, not their queueNumber: PASS ⇔ the
 * entry holds an active order (status 3/5/6/7/8). HOLD carries a machine-
 * readable reason (waiting_for_job_offer / offer_pending_accept /
 * reserved_not_assigned / not_in_queue) so staff can answer a "queue number 1
 * says it's my turn" dispute with the system's truth instead of the number.
 *
 * @param {string} queueUniqueId - DriverQueue entry UUID (scanned/typed at the gate)
 * @returns {Promise<object>} { message, data: { verdict, reason, queue, driver, vehicle, order } }
 * @throws {AppError} 404 when the entry does not exist (or is soft-deleted)
 */
exports.yardPass = async (queueUniqueId) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.*, vd.driverUserUniqueId,
            u.fullName AS driverFullName, u.phoneNumber AS driverPhoneNumber,
            v.licensePlate, vt.vehicleTypeName,
            sr.shippableItemName, sr.userUniqueId AS orderShipperUserUniqueId,
            su.fullName AS orderShipperFullName
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v        ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt  ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     JOIN Users u          ON u.userUniqueId           = vd.driverUserUniqueId
     LEFT JOIN ShipperRequest sr
       ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
       AND sr.shipperRequestDeletedAt IS NULL
     LEFT JOIN Users su ON su.userUniqueId = sr.userUniqueId
     WHERE dq.queueUniqueId = ? AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }
  const row = rows[0];
  // Two-level yard rule: base verdict (job = authority), then the shipper-turn
  // overlay — an AGREED truck of a NON-serving shipper HOLDs at the entrance
  // (waiting_shipper_turn); status 5+ trucks are already at the bay and PASS.
  const yardAccess = await yardAccessWithShipperTurn(executor, row);
  const servingShipperUserUniqueId = yardAccess.servingShipperUserUniqueId ?? null;
  let servingShipper = null;
  if (servingShipperUserUniqueId) {
    const [servingRows] = await executor.query(
      `SELECT userUniqueId, fullName, phoneNumber
       FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [servingShipperUserUniqueId],
    );
    servingShipper = servingRows[0] || null;
  }
  const stage = stageNameFor(row.status);
  const shared = {
    queue: {
      queueUniqueId: row.queueUniqueId,
      queueOrganizationUniqueId: row.queueOrganizationUniqueId,
      queueNumber: row.queueNumber,
      loadingOrderNumber: row.loadingOrderNumber ?? null,
      status: row.status,
      stage,
    },
    driver: {
      driverUserUniqueId: row.driverUserUniqueId,
      fullName: row.driverFullName || null,
      phoneNumber: row.driverPhoneNumber || null,
    },
    vehicle: {
      licensePlate: row.licensePlate || null,
      vehicleTypeName: row.vehicleTypeName || null,
    },
  };
  if (yardAccess.verdict === "PASS") {
    return {
      message: "Yard pass granted — driver holds an active job",
      data: {
        verdict: "PASS",
        reason: null,
        ...shared,
        servingShipper: servingShipper || null,
        order: {
          shipperRequestUniqueId: row.shipperRequestUniqueId || null,
          shippableItemName: row.shippableItemName || null,
          shipperName: row.orderShipperFullName || null,
        },
      },
    };
  }
  return {
    message:
      yardAccess.reason === "waiting_shipper_turn"
        ? "Yard pass held — another shipper's turn at the loading yard"
        : "Yard pass denied — driver does not hold an active job",
    data: {
      verdict: "HOLD",
      reason: yardAccess.reason,
      ...shared,
      servingShipper: servingShipper || null,
      order:
        yardAccess.reason === "waiting_shipper_turn"
          ? {
              shipperRequestUniqueId: row.shipperRequestUniqueId || null,
              shippableItemName: row.shippableItemName || null,
              shipperName: row.orderShipperFullName || null,
            }
          : null,
    },
  };
};
