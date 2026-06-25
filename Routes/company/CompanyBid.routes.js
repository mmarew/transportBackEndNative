"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyBid.controller");
const schema = require("../../Validations/CompanyBid.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { COMPANY_BID_ENDPOINTS } = require("../EndPoints/companyBid.endpoints");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/bids
 */
router.post("/", validator(schema.submitBid), controller.submitBid);

/**
 * @route   GET /api/company/bids
 */
router.get("/", validator(schema.getBidsQuery, "query"), controller.getBids);

/**
 * @route   PATCH /api/company/bids/:companyBidRequestUniqueId/status
 */
router.patch(
  COMPANY_BID_ENDPOINTS.ROUTER.UPDATE_BID_STATUS,
  validator(schema.bidParams, "params"),
  validator(schema.updateBidStatus),
  controller.updateBidStatus,
);

/**
 * @route   DELETE /api/company/bids/:companyBidRequestUniqueId
 */
router.delete(
  COMPANY_BID_ENDPOINTS.ROUTER.DELETE_BID,
  validator(schema.bidParams, "params"),
  controller.deleteBid,
);

/**
 * @route   PATCH /api/company/bids/:companyBidRequestUniqueId/markAsSeen
 * Marks a cancelled bid's notification as seen by the company.
 * Call this when the company dispatcher acknowledges the cancellation in the UI.
 */
router.patch(
  COMPANY_BID_ENDPOINTS.ROUTER.MARK_AS_SEEN,
  validator(schema.bidParams, "params"),
  controller.markCancellationAsSeen,
);

module.exports = router;
