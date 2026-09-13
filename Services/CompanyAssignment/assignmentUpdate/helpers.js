"use strict";

const { db } = require("../../CompanyHelper.service");

/**
 * Resolve companyUniqueId from a CompanyBidVehicleAssignment record.
 */
const getCompanyUniqueId = async (companyBidRequestUniqueId) => {
  const [[bid]] = await db().query(
    "SELECT companyUniqueId FROM CompanyBidRequest WHERE companyBidRequestUniqueId = ? LIMIT 1",
    [companyBidRequestUniqueId],
  );
  return bid?.companyUniqueId || null;
};

const getShipperContact = async (shipperRequestUniqueId) => {
  const [[row]] = await db().query(
    `SELECT u.userUniqueId, u.phoneNumber
     FROM ShipperRequest sr
     JOIN Users u ON sr.userUniqueId = u.userUniqueId
     WHERE sr.shipperRequestUniqueId = ? LIMIT 1`,
    [shipperRequestUniqueId],
  );
  return row || null;
};

module.exports.getCompanyUniqueId = getCompanyUniqueId;
module.exports.getShipperContact = getShipperContact;
