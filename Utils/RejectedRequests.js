const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("./ListOfSeedData");
// Statuses that make a shipper request ineligible to auto-match with a driver:
// - rejectedByDriver (driver rejected the offer before accepting)
// - cancelledByDriver (driver cancelled after accepting)
// - rejectedByShipper (shipper rejected the driver)
// - cancelledByAdmin (admin cancelled the request)
const REJECTED_STATUS_IDS = [
  journeyStatusMap.cancelledByDriver,
  journeyStatusMap.rejectedByShipper,
  journeyStatusMap.rejectedByDriver,
  journeyStatusMap.cancelledByAdmin,
];

/**
 * Checks whether a driver rejected/cancelled a shipper request.
 *
 * Batch-scoped: when the shipper request belongs to a multi-request batch
 * (shipperRequestBatchUniqueId), a rejection/cancellation of ANY request in the
 * same batch blocks the ENTIRE batch from auto-matching to that driver. This
 * stops "if the driver cancels one job of 5, the next 4 come to him".
 *
 * Requests without a batch fall back to the single-request check (legacy).
 *
 * @param {Object} params
 * @param {number} params.shipperRequestId - Target shipper request ID
 * @param {string} [params.shipperRequestBatchUniqueId] - Optional batch UUID to avoid an extra lookup
 * @param {string} params.driverUserUniqueId - Driver's unique identifier
 * @returns {Promise<{message: string, status?: number, data?: Array}>}
 */
const VerifyIfShipperRequestWasNotRejected = async ({
  shipperRequestId,
  shipperRequestBatchUniqueId = null,
  driverUserUniqueId,
}) => {
  let batchUniqueId = shipperRequestBatchUniqueId;

  if (!batchUniqueId) {
    const [[sr]] = await pool.query(
      `SELECT shipperRequestBatchUniqueId FROM ShipperRequest WHERE shipperRequestId = ? LIMIT 1`,
      [shipperRequestId],
    );
    batchUniqueId = sr?.shipperRequestBatchUniqueId ?? null;
  }

  const statusPlaceholders = REJECTED_STATUS_IDS.map(() => "?").join(", ");
  const statusValues = REJECTED_STATUS_IDS;

  let sql;
  let values;

  if (batchUniqueId) {
    sql = `
      SELECT jd.journeyDecisionUniqueId
      FROM JourneyDecisions jd
      JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      WHERE dr.userUniqueId = ?
        AND sr.shipperRequestBatchUniqueId = ?
        AND jd.journeyStatusId IN (${statusPlaceholders})
      LIMIT 1
    `;
    values = [driverUserUniqueId, batchUniqueId, ...statusValues];
  } else {
    sql = `
      SELECT * FROM JourneyDecisions
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      WHERE JourneyDecisions.shipperRequestId = ?
        AND DriverRequest.userUniqueId = ?
        AND JourneyDecisions.journeyStatusId IN (${statusPlaceholders})
    `;
    values = [shipperRequestId, driverUserUniqueId, ...statusValues];
  }

  const [result] = await pool.query(sql, values);
  if (result.length === 0) {
    return { message: "success", status: 1, data: result };
  } else {
    return {
      message: "error",
      error:
        "Shipper request was rejected by the driver, cancelled by the driver, or cancelled by admin",
    };
  }
};
const VerifyIfDriverDidNotRejectShippersRequest = async ({
  shipperRequestId,
  driverUserUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join ShipperRequest on JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId where JourneyDecisions.driverRequestId = ? and ShipperRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    driverUserUniqueId,
    shipperRequestId,
    journeyStatusMap.cancelledByShipper,
    journeyStatusMap.rejectedByDriver,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1 };
  } else {
    return {
      message: "error",
      error:
        "Driver request was rejected by the shipper or cancelled by the shipper",
    };
  }
};
module.exports = {
  VerifyIfShipperRequestWasNotRejected,
  VerifyIfDriverDidNotRejectShippersRequest,
};
