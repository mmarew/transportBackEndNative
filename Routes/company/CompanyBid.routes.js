"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyBid.controller");
const schema = require("../../Validations/CompanyBid.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

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
  "/:companyBidRequestUniqueId/status",
  validator(schema.bidParams, "params"),
  validator(schema.updateBidStatus),
  controller.updateBidStatus,
);

/**
 * @route   DELETE /api/company/bids/:companyBidRequestUniqueId
 */
router.delete(
  "/:companyBidRequestUniqueId",
  validator(schema.bidParams, "params"),
  controller.deleteBid,
);

module.exports = router;
