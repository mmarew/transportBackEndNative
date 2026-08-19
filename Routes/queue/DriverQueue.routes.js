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

// ===========================================================================
// DRIVER ENDPOINTS
// ===========================================================================

/**
 * @route   POST /api/queue/driver/checkin
 * @summary Check in to a queue (create or re-checkin)
 *
 * @description
 * Creates a new queue entry OR revives an existing one for the same
 * driver + org + day (idempotent).
 *
 * **Behavior by state:**
 *   1. **No active entry** — creates a new DriverQueue row with an
 *      auto-assigned `queueNumber` (next FIFO position).
 *   2. **Existing entry in same org+day, status "waiting"** — returns the
 *      existing entry (`alreadyCheckedIn: true`). Does NOT create a
 *      duplicate.
 *   3. **Existing entry, status "deleted" (checkout)** — revives the entry,
 *      preserving the original `queueNumber`.
 *   4. **Driver has an active journey (JourneyDecision status 2–8)** —
 *      returns the existing journey (`alreadyInJourney: true`). No new
 *      entry created.
 *
 * **Shipper reservation (`shipperPhoneNumber`):**
 *   When provided, the server resolves the phone → `userUniqueId` (existing
 *   user lookup, or auto-create via `requestedFrom: "street"` — no OTP)
 *   and stores it as `targetedShipperUserUUID` on the DriverQueue row.
 *   This reserves the queue position exclusively for that shipper.
 *   Dispatch will only offer orders from that shipper to this driver;
 *   other orders skip this driver and advance to the next in FIFO.
 *
 * On re-checkin, `targetedShipperUserUUID` is updated if a new phone is
 * provided.
 *
 * @access  Private (driver)
 * @body    {string}  queueOrganizationUniqueId  UUID of the queue org (required)
 * @body    {string}  vehicleDriverUniqueId      UUID of vehicle-driver link (required)
 * @body    {number}  [latitude]                  Driver's current latitude (-90 to 90)
 * @body    {number}  [longitude]                 Driver's current longitude (-180 to 180)
 * @body    {string}  [shipperPhoneNumber]        Shipper's phone, 8-20 chars.
 *            When provided, this queue entry is reserved for that shipper only.
 *
 * @returns {Object}  Canonical queue position (same shape as myPosition):
 *   { queue: { queueNumber, waitingAhead, vehicleType, targetedShipperUserUUID,
 *              shipper: { userUniqueId, fullName, phoneNumber } | null, ... },
 *     organization: { queueOrganizationUniqueId, organizationName, ... } }
 *
 * @example POST /api/queue/driver/checkin
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-99f4-490c-9f8a-7e1978082ba7",
 *   "vehicleDriverUniqueId": "ed8c9496-db34-41d0-8c2e-d407e4354294",
 *   "shipperPhoneNumber": "+251922112481"
 * }
 */
router.post(
  "/driver/checkin",
  validator(schema.checkin),
  controller.checkin,
);

/**
 * @route   GET /api/queue/driver/myPosition
 * @summary Get driver's current queue position and shipper info
 *
 * @description
 * Returns the driver's queue position for a given org+day, including
 * how many drivers are waiting ahead. Same canonical shape returned by
 * checkin so the driver app can render consistently.
 *
 * If `targetedShipperUserUUID` is set on the entry, the response includes
 * a `shipper` object: `{ userUniqueId, fullName, phoneNumber }` resolved
 * from the Users table, or `null` if the user no longer exists.
 *
 * @access  Private (driver)
 * @query   {string}  [queueOrganizationUniqueId]  UUID of the queue org (optional)
 *
 * @returns {Object}  { queue: { queueNumber, waitingAhead, vehicleType,
 *                      targetedShipperUserUUID, shipper: {...} | null, ... },
 *                      organization: { ... } }
 *
 * @example GET /api/queue/driver/myPosition?queueOrganizationUniqueId=58f68fea-...
 */
router.get(
  "/driver/myPosition",
  validator(schema.myPositionQuery, "query"),
  controller.myPosition,
);

/**
 * @route   DELETE /api/queue/driver/checkout
 * @summary Remove driver from the queue (soft delete)
 *
 * @description
 * Sets `queueDeletedAt` on the driver's queue entry for the given org+day.
 * The driver is removed from the FIFO and their position is freed.
 * Pass `queueOrganizationUniqueId` in body or query.
 *
 * @access  Private (driver)
 * @body|@query  {string}  queueOrganizationUniqueId  UUID of the queue org
 *
 * @returns {Object}  { message: "success" }
 *
 * @example DELETE /api/queue/driver/checkout
 * Body: { "queueOrganizationUniqueId": "58f68fea-..." }
 */
router.delete(
  "/driver/checkout",
  validator(schema.checkout),
  controller.checkout,
);

// ===========================================================================
// QUEUE STATUS (QueueOrgAdmin / Admin / SuperAdmin)
// ===========================================================================

/**
 * @route   GET /api/queue/status
 * @summary Full queue for an org+day, grouped by vehicle type
 *
 * @description
 * Returns all queue entries for a given org+day, grouped by vehicle type.
 * Includes entries in all states (waiting, dispatched, etc.) so admins can
 * audit the true queue state. Use this as the source of truth for disputes.
 *
 * @access  Private (QueueOrgAdmin / Admin / SuperAdmin)
 * @query   {string}  queueOrganizationUniqueId  UUID of the queue org (required)
 * @query   {string}  [queueDate]                 Date in YYYY-MM-DD (defaults to today)
 *
 * @returns {Array}   Array of vehicle types, each containing an array of
 *                    queue entries with queueNumber, driver info, status, etc.
 *
 * @example GET /api/queue/status?queueOrganizationUniqueId=58f68fea-...&queueDate=2026-08-19
 */
router.get(
  "/status",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.statusQuery, "query"),
  controller.getQueueStatus,
);

// ===========================================================================
// ADMIN / QUEUEORGADMIN ACTIONS
// ===========================================================================

/**
 * @route   POST /api/queue/manualCheckin
 * @summary Admin manually checks a driver into the queue
 *
 * @description
 * Use when a driver arrives physically but can't self-check-in (phone dead,
 * no app, etc.). The admin provides the driver and vehicle info; the server
 * creates the queue entry.
 *
 * Optionally accepts `queueNumber` to assign a specific position, and
 * `shipperPhoneNumber` to reserve the entry for a specific shipper (same
 * behavior as driver checkin).
 *
 * @access  Private (QueueOrgAdmin)
 * @body    {string}  queueOrganizationUniqueId  UUID of the queue org (required)
 * @body    {string}  vehicleDriverUniqueId      UUID of vehicle-driver link (required)
 * @body    {number}  [queueNumber]               Specific position to assign (default: auto FIFO)
 * @body    {string}  [shipperPhoneNumber]        Shipper's phone, 8-20 chars
 *
 * @returns {Object}  { message: "success", data: { queueUniqueId, queueNumber } }
 *
 * @example POST /api/queue/manualCheckin
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-...",
 *   "vehicleDriverUniqueId": "ed8c9496-...",
 *   "queueNumber": 5,
 *   "shipperPhoneNumber": "+251922112481"
 * }
 */
router.post(
  "/manualCheckin",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.manualCheckin),
  controller.manualCheckin,
);

/**
 * @route   PATCH /api/queue/entry/:queueUniqueId/override
 * @summary Admin reorders a queue entry (supervisor override)
 *
 * @description
 * Manually moves a driver to a specific position in the queue. Audit-logged
 * with before/after values and optional reason.
 *
 * **When to use:**
 *   - Driver disputes their position ("I was here before him")
 *   - VIP or priority override
 *   - Correcting a system mistake (double-booking, wrong assignment)
 *   - Any situation where the admin needs to manually reorder the queue
 *
 * **When NOT to use:**
 *   - Driver updating their own shipper phone → use POST /driver/checkin
 *   - Removing a driver → use DELETE /entry/:queueUniqueId
 *
 * @access  Private (QueueOrgAdmin)
 * @params  {string}  queueUniqueId  UUID of the queue entry (required)
 * @body    {number}  queueNumber    New position (1-based, required)
 * @body    {string}  [reason]       Explanation for the override
 *
 * @returns {Object}  { message: "success", data: { queueUniqueId, queueNumber } }
 *
 * @example PATCH /api/queue/entry/a1b2c3d4-.../override
 * Body: { "queueNumber": 3, "reason": "Driver arrived earlier, system glitch" }
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
 * @summary Remove a queue entry (admin checkout / no-show)
 *
 * @description
 * Soft-deletes a queue entry by setting `queueDeletedAt`. Audit-logged.
 * Use this when a driver is a no-show, leaves early, or is removed by
 * admin decision.
 *
 * **When to use:**
 *   - Driver didn't show up (no-show)
 *   - Driver left without checking out
 *   - Admin removing a driver from the queue
 *
 * **When NOT to use:**
 *   - Driver checking themselves out → use DELETE /driver/checkout
 *   - Reordering → use PATCH /entry/:queueUniqueId/override
 *
 * @access  Private (QueueOrgAdmin)
 * @params  {string}  queueUniqueId  UUID of the queue entry (required)
 *
 * @returns {Object}  { message: "success" }
 *
 * @example DELETE /api/queue/entry/a1b2c3d4-...
 */
router.delete(
  "/entry/:queueUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.entryParams, "params"),
  controller.removeEntry,
);

/**
 * @route   POST /api/queue/dispatch
 * @summary Manually dispatch a waiting order to the front driver
 *
 * @description
 * Dispatches a specific shipper request (order) to the front driver of
 * the matching vehicle type in the queue. Creates a JourneyDecision with
 * status 2 (requestedByShipper) and updates the order status.
 *
 * If `shipperRequestUniqueId` is omitted, dispatches the oldest pending
 * order for the org+vehicle type.
 *
 * @access  Private (QueueOrgAdmin)
 * @body    {string}  queueOrganizationUniqueId  UUID of the queue org (required)
 * @body    {string}  vehicleTypeUniqueId         UUID of the vehicle type (required)
 * @body    {string}  [shipperRequestUniqueId]    UUID of a specific order to dispatch
 *
 * @returns {Object}  { message: "success", data: { journeyDecision, driver, order } }
 *
 * @example POST /api/queue/dispatch
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-...",
 *   "vehicleTypeUniqueId": "9b2e8446-...",
 *   "shipperRequestUniqueId": "optional-specific-order-uuid"
 * }
 */
router.post(
  "/dispatch",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.dispatchBody),
  controller.dispatch,
);

module.exports = router;
