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
 * @summary Remove driver from the queue
 *
 * @description
 * Sets `status: 'removed'` on the driver's queue entry for the given org+day.
 * If the driver has an active offer, the linked order is released back to the
 * queue. The driver is removed from the FIFO and their position is freed.
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
 * Sets `status: 'removed'` on a queue entry. Audit-logged to QueueAuditLog.
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
 * @summary Manually dispatch a waiting order to a queue driver
 *
 * @description
 * Dispatches a specific shipper request (order) to a queue driver, creating a
 * JourneyDecision with status 2 (requestedByShipper) and updating the order
 * status. Exactly ONE driver-selection mode must be provided:
 *
 *   1. `vehicleTypeUniqueId` — offer to the FRONT waiting driver of the type
 *      (FIFO). This is the only mode allowed without a targeted driver.
 *   2. `queueUniqueId` — offer to a SPECIFIC driver's queue entry.
 *   3. `driverPhoneNumber` — offer to a SPECIFIC driver by phone (resolved to
 *      their active vehicle assignment, then their today's queue entry).
 *
 * Modes 2 and 3 are mutually exclusive and ignore FIFO ordering: the targeted
 * entry must be `waiting`/`notagreed` for this org today, match the order's
 * vehicle type, must not have already refused the order, and must not be
 * pinned (targetedShipperUserUUID) to a different shipper — otherwise the
 * dispatch fails with 4xx.
 *
 * If `vehicleTypeUniqueId` is omitted in modes 2–3 it defaults to the order's
 * vehicle type. If `shipperRequestUniqueId` is omitted, dispatches the oldest
 * pending order for the org+vehicle type.
 *
 * @access  Private (QueueOrgAdmin)
 * @body    {string}  queueOrganizationUniqueId   UUID of the queue org (required)
 * @body    {string}  [vehicleTypeUniqueId]       Vehicle type UUID → front-driver mode
 * @body    {string}  [queueUniqueId]             DriverQueue entry UUID → targeted driver
 * @body    {string}  [driverPhoneNumber]         Driver phone (+251...) → targeted driver
 * @body    {string}  [shipperRequestUniqueId]    UUID of a specific order to dispatch
 *
 * @returns {Object}  { message: "success", offered: true, data: { queueUniqueId, queueNumber, driverUserUniqueId, journeyDecisionUniqueId, status } }
 *
 * @example POST /api/queue/dispatch  (front driver)
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-...",
 *   "vehicleTypeUniqueId": "9b2e8446-...",
 *   "shipperRequestUniqueId": "optional-specific-order-uuid"
 * }
 *
 * @example POST /api/queue/dispatch  (specific driver by queue entry)
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-...",
 *   "queueUniqueId": "7680e724-b6ae-482d-aefc-176fef4d6a36",
 *   "shipperRequestUniqueId": "optional-specific-order-uuid"
 * }
 *
 * @example POST /api/queue/dispatch  (specific driver by phone)
 * Body: {
 *   "queueOrganizationUniqueId": "58f68fea-...",
 *   "driverPhoneNumber": "+251912345678",
 *   "shipperRequestUniqueId": "optional-specific-order-uuid"
 * }
 */
router.post(
  "/dispatch",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.dispatchBody),
  controller.dispatch,
);

// ===========================================================================
// HISTORY
// ===========================================================================

/**
 * @route   GET /api/queue/entry/:queueUniqueId/history
 * @summary Column-level change history for a queue entry
 *
 * @description
 * Returns the full DriverQueueHistory for a given entry: every column change
 * (status, targetedShipperUserUUID, queueNumber, shipperRequestUniqueId,
 * queueRefusalCount) with oldValue, who did it, and when.
 *
 * Sorted by most recent first. Current value is always in DriverQueue itself;
 * history shows what each column was BEFORE each change.
 *
 * @access  Private (driver: own entry / QueueOrgAdmin: any entry)
 * @params  {string}  queueUniqueId  UUID of the queue entry (required)
 *
 * @returns {Object}  { message: "success", data: [{ columnName, oldValue, performedBy, performedAt }] }
 *
 * @example GET /api/queue/entry/a1b2c3d4-.../history
 */
router.get(
  "/entry/:queueUniqueId/history",
  validator(schema.entryParams, "params"),
  controller.getEntryHistory,
);

// ===========================================================================
// BIDDING BOARD (flag-only — isBiddingApproved on the batch)
// ===========================================================================

const biddingSchema = require("../../Validations/DriverBid.schema");

/**
 * @route   POST /api/queue/bidding/approve
 * @summary Open/close the bidding board for SPECIFIC orders (per-order)
 *
 * @description
 * Toggles ShipperRequest.isBiddingApproved (the sole, per-order bidding signal)
 * for each given order, independently. Orders within one batch can diverge —
 * e.g. some hired via FIFO at status 3+ while others are opened to bidding.
 * Closed (FALSE, default) = normal FIFO queue order, never distance-matched.
 * Open (TRUE) = distance-matched to nearby drivers (findNearbyDrivers →
 * JourneyDecisions) and skipped by FIFO. Orders keep their ordinary
 * journeyStatusId (there is no 'bidding' status).
 *
 * On approval, only orders that are still WAITING (status 1) are matched.
 *
 * Access: the shipper who owns the orders (or SuperAdmin).
 *
 * @body    {string[]} shipperRequestUniqueIds  The orders to open/close (required, min 1)
 * @body    {boolean}  [approved=true]          TRUE opens the board, FALSE hides it
 *
 * @returns {Object}  { message, data: { shipperRequestUniqueIds, isBiddingApproved, count, waitingMatched } }
 */
router.post(
  "/bidding/approve",
  validator(biddingSchema.approveBidding),
  controller.approveBidding,
);

/**
 * @route   GET /api/queue/bidding/order/:shipperRequestUniqueId/bids
 * @summary List all driver bids placed on a queue order
 *
 * @description
 * Lists DriverBid rows for a single queue order joined with the bidding
 * driver's profile, cheapest bid first. Paginated via query.
 *
 * @params  {string}  shipperRequestUniqueId  The order (required)
 * @query   {number}  [page=1]
 * @query   {number}  [limit=20]
 *
 * @returns {Object}  { message, data: [bids], pagination: { currentPage, limit, totalItems, totalPages } }
 */
router.get(
  "/bidding/order/:shipperRequestUniqueId/bids",
  validator(biddingSchema.getBidsParams, "params"),
  validator(biddingSchema.getBidsQuery, "query"),
  controller.getBidsForOrder,
);

module.exports = router;
