"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/DriverQueue.controller");
const schema = require("../../Validations/DriverQueue.schema");
const { validator } = require("../../Middleware/Validator");
const {
  verifyTokenOfAxios,
  verifyIfUserIsQueueOrgAdmin,
} = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/queue/driver/checkin
 * @desc    Driver joins the queue (virtual, from anywhere). Server stamps queueNumber.
 * @access  Private (driver)
 */
router.post(
  "/driver/checkin",
  validator(schema.checkin),
  controller.checkin,
);

/**
 * @route   GET /api/queue/driver/myPosition
 * @desc    Driver's current position + waiting ahead (per vehicle type)
 * @access  Private (driver)
 */
router.get(
  "/driver/myPosition",
  validator(schema.myPositionQuery, "query"),
  controller.myPosition,
);

/**
 * @route   DELETE /api/queue/driver/checkout
 * @desc    Driver leaves the queue (no-show / done for the day)
 * @access  Private (driver)
 */
router.delete(
  "/driver/checkout",
  validator(schema.checkout),
  controller.checkout,
);

/**
 * @route   GET /api/queue/status
 * @desc    Full queue for an org+day, grouped by vehicle type (dispute truth)
 * @access  Private (QueueOrgAdmin / Admin / SuperAdmin)
 */
router.get(
  "/status",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.statusQuery, "query"),
  controller.getQueueStatus,
);

/**
 * @route   POST /api/queue/manualCheckin
 * @desc    QueueOrgAdmin manually checks a driver/vehicle in
 * @access  Private (QueueOrgAdmin)
 */
router.post(
  "/manualCheckin",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.manualCheckin),
  controller.manualCheckin,
);

/**
 * @route   PATCH /api/queue/entry/:queueUniqueId/override
 * @desc    Supervisor override — reorder an entry (audit logged)
 * @access  Private (QueueOrgAdmin)
 */
router.patch(
  "/entry/:queueUniqueId/override",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.entryParams, "params"),
  validator(schema.overrideBody),
  controller.overrideEntry,
);

/**
 * @route   DELETE /api/queue/entry/:queueUniqueId
 * @desc    Remove an entry (checkout / no-show / override) — audit logged
 * @access  Private (QueueOrgAdmin)
 */
router.delete(
  "/entry/:queueUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.entryParams, "params"),
  controller.removeEntry,
);

/**
 * @route   POST /api/queue/dispatch
 * @desc    Manually dispatch a waiting order to the front driver of the matching type
 * @access  Private (QueueOrgAdmin)
 */
router.post(
  "/dispatch",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.dispatchBody),
  controller.dispatch,
);

module.exports = router;
