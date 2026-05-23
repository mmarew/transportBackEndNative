"use strict";


const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db} = require("../CompanyHelper.service");







const deleteBid = async (companyBidRequestUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET companyBidRequestDeletedAt = ?, companyBidRequestDeletedBy = ?
     WHERE companyBidRequestUniqueId = ? AND companyBidRequestDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Bid not found or already deleted", 404);
  }
  return { message: "success", data: "Bid deleted" };
};

// ── Mark cancellation as seen by company ──────────────────────────────────────
// Called when a company dispatcher opens/acknowledges the cancelled bid.
// Mirrors DriverRequest.isCancellationByShipperSeenByDriver pattern.
module.exports = {
  deleteBid
};
