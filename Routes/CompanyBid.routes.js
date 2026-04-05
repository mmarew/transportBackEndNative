"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/CompanyBid.controller");
const schema = require("../Validations/CompanyBid.schema");
const { validator } = require("../Middleware/Validator");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/bids
 */
router.post("/api/company/bids", validator(schema.submitBid), controller.submitBid);

/**
 * @route   GET /api/company/bids
 */
router.get("/api/company/bids", validator(schema.getBidsQuery, "query"), controller.getBids);

/**
 * @route   PATCH /api/company/bids/:companyBidRequestUniqueId/status
 */
router.patch(
  "/api/company/bids/:companyBidRequestUniqueId/status",
  validator(schema.bidParams, "params"),
  validator(schema.updateBidStatus),
  controller.updateBidStatus,
);

/**
 * @route   DELETE /api/company/bids/:companyBidRequestUniqueId
 */
router.delete(
  "/api/company/bids/:companyBidRequestUniqueId",
  validator(schema.bidParams, "params"),
  controller.deleteBid,
);

module.exports = router;
