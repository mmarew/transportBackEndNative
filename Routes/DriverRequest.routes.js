const express = require("express");
const {
  deleteRequestController,
  verifyDriverJourneyStatusController,
  createRequest,
  acceptShipperRequest,
  startJourney,
  noAnswerFromDriver,
  completeJourney,
  cancelDriverRequest,
  takeFromStreet,
  createAndAcceptNewRequest,
  sendUpdatedLocationController,
  getDriverRequestController,
  getCancellationNotificationsController,
  markNegativeStatusAsSeenController,
  updateDriverRequestController,
} = require("../Controllers/Driver.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyDriversIdentity,
  verifyShippersIdentity,
} = require("../Middleware/VerifyUsersIdentity");

const { validator } = require("../Middleware/Validator");
const {
  createRequest: createRequestSchema,
  takeFromStreet: takeFromStreetSchema,
  createAndAcceptNewRequest: createAndAcceptNewRequestSchema,
  getCancellationNotificationsQuery: getCancellationNotificationsQuerySchema,
  markNegativeStatusAsSeen: markNegativeStatusAsSeenSchema,
  acceptShipperRequest: acceptShipperRequestSchema,
  verifyDriverJourneyStatus: verifyDriverJourneyStatusSchema,
  sendUpdatedLocation: sendUpdatedLocationSchema,
  completeJourney: completeJourneySchema,
  startJourney: startJourneySchema,
  updateDriverRequest: updateDriverRequestSchema,
  requestIdParams: requestIdParamsSchema,
} = require("../Validations/DriverRequest.schema");
const { DRIVER_REQUEST_ENDPOINTS } = require("./EndPoints/driverRequest.endpoints");

const router = express.Router();
/**
 * Take From Street Endpoint
 *
 * Purpose: Enables drivers to register a shipper pickup directly from the street,
 * bypassing the normal app-based matching system. This is used when a driver encounters
 * a shipper on the street and needs to immediately start tracking the journey.
 *
 * How it works:
 * - Driver encounters shipper on street and collects their information (phone, destination, item details)
 * - System creates shipper user account (if not exists) using phone number
 * - Creates ShipperRequest with journeyStatusId = 5 (journeyStarted), skipping normal flow (waiting → requested → accepted)
 * - Creates DriverRequest with journeyStatusId = 5 (journeyStarted)
 * - Creates JourneyDecision linking driver and shipper requests with status = 5
 * - Creates Journey record immediately with status = 5 (journeyStarted)
 * - Records origin location via JourneyRoutePoints table for GPS tracking
 * - Sends welcome SMS to shipper with driver name and item details
 * - Returns complete journey data for real-time tracking
 *
 * Database Operations (Atomic):
 * 1. Checks driver status:
 *    - If driver has active request with status >= 3 (acceptedByDriver+): Returns current status
 *    - If driver has active request with status 1-2 (waiting/requested): Cancels it first
 * 2. Creates Users record: New shipper user with phone number, fake email, roleId=1 (shipper)
 * 3. Creates ShipperRequest: With journeyStatusId=5, stores origin/destination, item details, shipping costs/dates
 * 4. Creates DriverRequest: With journeyStatusId=5, uses driver's current location as origin
 * 5. Creates JourneyDecisions: Links ShipperRequest and DriverRequest, stores driver-provided shipping dates/costs
 * 6. Creates Journey: Sets status=5 (journeyStarted), records startTime, initializes fare=0
 * 7. Creates JourneyRoutePoints: Records origin location (driver's current GPS position) for tracking
 *
 * Request Body:
 * - phoneNumber: Shipper's phone number (required, used to create/find user)
 * - shipperRequestBatchUniqueId: Batch ID for grouping related requests (required)
 * - originLocation: {latitude, longitude, description} - Driver's current location (required)
 * - destination: {latitude, longitude, place} - Delivery destination (required)
 * - vehicleTypeUniqueId: Type of vehicle being used (required)
 * - shippableItemName: Name/description of items being transported (optional)
 * - shippableItemQtyInQuintal: Quantity in quintals (optional)
 * - shippingDate: Date when shipping starts (optional)
 * - deliveryDate: Expected delivery date (optional)
 * - shippingCost: Cost of transportation (optional)
 * - cancellationReasonsTypeId: Reason ID if canceling existing request (optional)
 *
 * Response:
 * - Returns complete journey data including:
 *   - shipper: Shipper user and request information
 *   - driver: Driver information with vehicle details and tariff rates
 *   - journey: Journey record with status, start time, fare
 *   - decision: JourneyDecision linking driver and shipper
 *   - status: journeyStatusId (5 = journeyStarted)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Driver identity verified through token (verified national ID, driving license, insurance in system)
 * - Shipper can track goods via app using phone number to ensure driver authenticity
 *
 * Use Case:
 * Driver picks up shipper on street → Registers via this endpoint → Journey immediately starts
 * → Shipper receives SMS with tracking details → Both can monitor journey progress in real-time
 * → System tracks location via JourneyRoutePoints for route visualization
 *
 * Special Note:
 * This endpoint bypasses the normal bid/matching workflow. The journey starts immediately
 * at status 5 (journeyStarted) instead of going through waiting (1) → requested (2) →
 * acceptedByDriver (3) → acceptedByShipper (4) → journeyStarted (5).
 */
router.post(
  DRIVER_REQUEST_ENDPOINTS.TAKE_FROM_STREET,
  verifyTokenOfAxios,
  validator(takeFromStreetSchema),
  takeFromStreet,
);
/**
 * Create Driver Request Endpoint
 *
 * Purpose: Registers a driver to search for nearby shipper requests and participate in the
 * online bidding/matching system. This is the first step in the normal job matching workflow,
 * where drivers register their availability and location before goods are seen (unlike
 * takeFromStreet which happens after pickup).
 *
 * How it works:
 * - Driver provides current location (GPS coordinates)
 * - System creates DriverRequest with journeyStatusId = 1 (waiting) if driver has no active request
 * - System automatically searches for nearby shippers within ~1km radius
 * - If match found, creates JourneyDecision linking driver and shipper
 * - Updates both requests to status = 2 (requested)
 * - Sends WebSocket notification to matched shipper
 * - Driver enters bid stage where shipper can accept/reject their offer
 *
 * Workflow:
 * 1. Driver Registration (this endpoint) → status: waiting (1)
 * 2. Auto-matching with nearby shippers → status: requested (2)
 * 3. Driver provides bid price → status: acceptedByDriver (3)
 * 4. Shipper accepts driver → status: acceptedByShipper (4)
 * 5. Driver starts journey → status: journeyStarted (5)
 * 6. Journey completion → status: journeyCompleted (6)
 *
 * Database Operations:
 * 1. Validates driver health (not deleted, status = ACTIVE, has required documents)
 * 2. Checks for existing active request (status 1-5): Returns existing if found
 * 3. Creates DriverRequest in DriverRequest table:
 *    - journeyStatusId = 1 (waiting) by default
 *    - Stores driver's current location (originLatitude, originLongitude, originPlace)
 *    - Links to driver via userUniqueId
 * 4. If findNewRequest = true (default):
 *    - Verifies driver has active vehicle with matching vehicleTypeUniqueId
 *    - Searches ShipperRequest table for nearby shippers:
 *      * Within ~1km radius (latitude/longitude range)
 *      * Matching vehicleTypeUniqueId
 *      * Status = waiting (1), requested (2), or acceptedByDriver (3)
 *      * Excludes shippers this driver previously rejected
 *    - If match found:
 *      * ✅ Creates JourneyDecisions record linking driver and shipper (within transaction)
 *      * ✅ Updates DriverRequest: journeyStatusId 1 → 2 (requested) (within transaction)
 *      * ✅ Updates ShipperRequest: journeyStatusId 1 → 2 (requested) if it was waiting (within transaction)
 *      * ✅ All three operations wrapped in transaction (15 second timeout) - atomic updates
 *      * Sends WebSocket notification to shipper with driver details (after DB updates)
 *      * Returns matched shipper data with vehicle information
 *    - If no match: Returns driver request with status = 1 (waiting)
 *
 * Request Body:
 * - currentLocation: {latitude, longitude, description} - Driver's current GPS location (required)
 * - journeyStatusId: Optional override (defaults to 1 = waiting)
 *
 * Response (if match found):
 * - message: "success"
 * - status: 2 (requested)
 * - driver: Driver request data with vehicle information
 * - shipper: Matched shipper request data
 * - decision: JourneyDecision linking driver and shipper
 * - vehicle: Vehicle details with tariff rates
 *
 * Response (if no match):
 * - message: "success"
 * - status: 1 (waiting)
 * - driver: Driver request data
 * - shipper: null
 * - decision: null
 * - vehicle: Vehicle details
 *
 * Response (if active request exists):
 * - Returns existing active request (status 1-5) with current journey state
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver health (active status, not deleted, has required documents)
 * - Verifies driver has active vehicle before matching
 *
 * Authorization:
 * - Only drivers can create driver requests
 * - Driver must be healthy (validated, active, not deleted)
 * - Driver must have at least one active vehicle assignment
 *
 * Use Case:
 * Driver opens app → Registers availability with current location → System finds nearby shippers
 * → Driver receives shipper request → Driver provides bid price → Shipper accepts/rejects
 * → If accepted, journey starts
 *
 * Difference from takeFromStreet:
 * - This endpoint: Driver registers BEFORE seeing goods (normal matching workflow)
 * - takeFromStreet: Driver picks up goods directly from street (journey starts immediately)
 *
 * Performance Notes:
 * - Matching algorithm searches within ~1km radius (0.941 degrees ≈ 1km)
 * - Searches for shippers with status 1, 2, or 3 (waiting, requested, acceptedByDriver)
 * - Filters out shippers driver previously rejected to avoid duplicate matches
 * - Status updates (JourneyDecisions, DriverRequest, ShipperRequest) execute atomically
 *   within a transaction (15 second timeout) - prevents data inconsistency if any operation fails
 *
 * Transaction Coverage:
 * - ✅ Auto-matching path: Fully wrapped in transaction (executeStatusUpdates function)
 *   - Creates JourneyDecisions (within transaction)
 *   - Updates DriverRequest status (within transaction)
 *   - Updates ShipperRequest status (within transaction)
 *   - All operations are atomic - either all succeed or all fail
 */
router.post(
  DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(createRequestSchema),
  createRequest,
);
/**
 * Create and Accept New Request Endpoint
 *
 * Purpose: Allows a driver to manually accept a specific shipper request from their device,
 * even when they are NOT within the ~1km automatic matching radius. This is used when drivers
 * browse available job posts and manually select a shipper request to accept.
 *
 * How it works:
 * - Driver views available shipper requests on their device (may be outside 1km radius)
 * - Driver manually selects a specific shipper request to accept
 * - Driver provides bid price (shippingCostByDriver) and accepts the request
 * - System creates or updates DriverRequest, JourneyDecision, and ShipperRequest
 * - All three tables updated to status = 3 (acceptedByDriver) atomically
 * - Returns a completed journey data for driver to see the accepted request
 *
 * Difference from /api/driver/request:
 * - /api/driver/request: Auto-matches with nearby shippers (~1km radius) → status: requested (2)
 * - This endpoint: Driver manually selects specific shipper → status: acceptedByDriver (3)
 * - This endpoint: Bypasses automatic matching, driver chooses specific job post
 *
 * Database Operations:
 * 1. Fetches ShipperRequest by shipperRequestUniqueId to validate it exists
 * 2. Validates shipper request status (must be <= acceptedByDriver, i.e., not already accepted)
 * 3. Checks if JourneyDecision already exists linking this driver and shipper:
 *
 *    IF JourneyDecision EXISTS (driver previously matched with this shipper):
 *      ✅ Wrapped in TRANSACTION (lines 351-388):
 *      - Updates JourneyDecisions: journeyStatusId → 3 (acceptedByDriver), stores shippingCostByDriver
 *      - Updates ShipperRequest: journeyStatusId → 3 (acceptedByDriver)
 *      - Updates DriverRequest: journeyStatusId → 3 (acceptedByDriver)
 *      - All updates atomic (10 second timeout)
 *
 *    IF JourneyDecision DOES NOT EXIST (new match):
 *      ✅ Wrapped in TRANSACTION (lines 391-437):
 *      - Checks for existing active DriverRequest for driver (within transaction)
 *      - Creates new DriverRequest if none exists, or uses existing one
 *      - Creates new JourneyDecisions linking driver and shipper with status = 3
 *      - Updates ShipperRequest: journeyStatusId → 3 (acceptedByDriver)
 *      - All operations atomic (15 second timeout)
 *
 * 4. Returns driver status via verifyDriverJourneyStatus() with complete journey data
 *
 * Request Body:
 * - shipperRequestUniqueId: Unique ID of the shipper request to accept (required)
 * - shippingCostByDriver: Bid price/transportation cost offered by driver (required)
 * - currentLocation: {latitude, longitude, description} - Driver's current location (required if no existing DriverRequest)
 *
 * Response:
 * - Returns driver status from verifyDriverJourneyStatus() including:
 *   - driver: Driver request data with vehicle information
 *   - shipper: Accepted shipper request data
 *   - decision: JourneyDecision linking driver and shipper
 *   - journey: Journey data if exists, otherwise null
 *   - status: 3 (acceptedByDriver)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates shipper request exists and is in acceptable status
 * - Verifies shipper request not already accepted (status > 3)
 *
 * Authorization:
 * - Only drivers can accept shipper requests
 * - Driver must be authenticated and verified
 * - Shipper request must exist and be in waiting (1), requested (2), or acceptedByDriver (3) status
 *
 * Use Case:
 * Driver browses job posts → Sees shipper request outside 1km radius → Selects specific request
 * → Provides bid price → Accepts request → Enters bid stage where shipper can accept/reject
 * → If shipper accepts, journey can start
 *
 * Status Flow:
 * 1. Shipper creates request → status: waiting (1)
 * 2. Auto-matching finds nearby drivers → status: requested (2) (optional, if driver was nearby)
 * 3. Driver manually accepts (this endpoint) → status: acceptedByDriver (3)
 * 4. Shipper accepts driver → status: acceptedByShipper (4)
 * 5. Driver starts journey → status: journeyStarted (5)
 *
 * Performance Notes:
 * - Checks for existing JourneyDecision before creating new one (avoids duplicates)
 * - If existing linkage found, updates are wrapped in transaction (atomic)
 * - If new linkage created, all operations are wrapped in transaction (atomic)
 * - Final verifyDriverJourneyStatus() call fetches complete journey data for response
 *
 * Transaction Coverage:
 * - ✅ Existing JourneyDecision path: Fully wrapped in transaction (lines 351-388, 10 second timeout)
 * - ✅ New JourneyDecision path: Fully wrapped in transaction (lines 391-437, 15 second timeout)
 *   - Checks for existing DriverRequest (within transaction)
 *   - Creates DriverRequest if needed (within transaction)
 *   - Creates JourneyDecisions (within transaction)
 *   - Updates ShipperRequest (within transaction)
 *   - All operations are atomic - either all succeed or all fail
 */
router.post(
  DRIVER_REQUEST_ENDPOINTS.CREATE_AND_ACCEPT_NEW_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(createAndAcceptNewRequestSchema),
  createAndAcceptNewRequest,
);

/**
 * Driver Accept Shipper Request (Bid Participation) Endpoint
 *
 * Purpose: Allows a driver to accept a shipper request they were automatically matched with
 * and provide their bid price (shippingCostByDriver). This is the "bid participation step" where
 * the driver responds to the auto-match notification by accepting the request with their proposed cost.
 *
 * Context & Workflow:
 * 1. Driver registers availability via /api/driver/request → status: waiting (1)
 * 2. System auto-matches driver with nearby shipper (~1km radius) → status: requested (2)
 * 3. Driver receives notification (phone rings/notification) about matched shipper
 * 4. Driver calls this endpoint to accept and provide bid price → status: acceptedByDriver (3) [THIS STEP]
 * 5. Shipper receives notification with driver's bid and can accept/reject
 * 6. If shipper accepts → status: acceptedByShipper (4)
 * 7. Driver starts journey → status: journeyStarted (5)
 *
 * How it works:
 * - Driver provides their bid price (shippingCostByDriver) and accepts the matched shipper request
 * - System validates the request exists and belongs to the authenticated driver
 * - System validates that JourneyDecision, ShipperRequest, and DriverRequest IDs all match
 * - All three tables updated atomically: JourneyDecisions, ShipperRequest, DriverRequest
 * - Status changes from requested (2) to acceptedByDriver (3) across all tables
 * - Shipper receives WebSocket and FCM notifications with driver's bid details
 * - Driver receives confirmation with complete journey data
 *
 * Database Operations:
 * 1. Validates driver request exists via JOIN query:
 *    - Joins DriverRequest → JourneyDecisions → ShipperRequest → Users
 *    - Verifies driverRequestUniqueId exists and matches authenticated userUniqueId
 * 2. Validates request linkage integrity:
 *    - Ensures journeyDecisionUniqueId matches JourneyDecisions record
 *    - Ensures shipperRequestUniqueId matches ShipperRequest record
 *    - Ensures driverRequestUniqueId matches DriverRequest record
 *    - All three must be linked correctly or returns error
 * 3. ✅ Wrapped in TRANSACTION via updateJourneyStatus():
 *    - Updates JourneyDecisions:
 *      * journeyStatusId: 2 (requested) → 3 (acceptedByDriver)
 *      * shippingCostByDriver: Stores driver's bid price
 *    - Updates ShipperRequest:
 *      * journeyStatusId: 2 (requested) → 3 (acceptedByDriver)
 *    - Updates DriverRequest:
 *      * journeyStatusId: 2 (requested) → 3 (acceptedByDriver)
 *    - All updates execute atomically (15 second timeout)
 *    - If any update fails, all changes are rolled back
 * 4. Fetches complete journey notification data:
 *    - Retrieves shipper request details
 *    - Retrieves journey decision with bid information
 *    - Retrieves driver information and vehicle details
 *    - Retrieves journey data if exists
 * 5. Sends notifications to shipper:
 *    - WebSocket notification via sendShipperNotification()
 *    - FCM push notification to shipper's device
 *    - Notification includes driver details and bid price
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request (required)
 * - shipperRequestUniqueId: Unique ID of the shipper request being accepted (required)
 * - journeyDecisionUniqueId: Unique ID of the JourneyDecision linking driver and shipper (required)
 * - shippingCostByDriver: Driver's proposed bid price/transportation cost (required, min: 0)
 * - userUniqueId: Automatically set from authentication token (set by controller)
 * - journeyStatusId: Automatically set to 3 (acceptedByDriver) by controller
 *
 * Response:
 * - message: "success"
 * - status: 3 (acceptedByDriver)
 * - uniqueIds: {
 *     driverRequestUniqueId: UUID,
 *     shipperRequestUniqueId: UUID,
 *     journeyDecisionUniqueId: UUID,
 *     journeyUniqueId: UUID or null
 *   }
 * - driver: {
 *     driver: Driver request data with vehicle type and location,
 *     vehicle: Vehicle details with tariff rates
 *   }
 * - shipper: Shipper request data with user information
 * - journey: Journey data if exists, otherwise null
 * - decision: JourneyDecision data with bid information
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver request exists and belongs to authenticated driver
 * - Validates request linkage integrity (all IDs must match correctly)
 * - Prevents drivers from accepting requests not assigned to them
 *
 * Authorization:
 * - Only drivers can accept shipper requests
 * - Driver must own the driverRequestUniqueId being updated
 * - Driver must be authenticated and verified
 * - Request must exist and be in requested (2) status (validated implicitly)
 *
 * Validation:
 * - Validates all three unique IDs (driver, shipper, decision) are provided
 * - Validates shippingCostByDriver is a valid number >= 0
 * - Validates driver request exists in database
 * - Validates driver request belongs to authenticated user
 * - Validates all IDs match the actual database records
 *
 * Error Cases:
 * - "User authentication required": userUniqueId missing from token
 * - "Request not found": driverRequestUniqueId doesn't exist
 * - "Driver user does not match driver request": Driver doesn't own the request
 * - "Request found is not valid to accept": IDs don't match database records
 * - "Unable to fetch journey data": Error retrieving notification data
 * - "Unable to accept shipper request": General error during acceptance
 *
 * Use Case:
 * Driver receives notification on phone → Opens app → Sees matched shipper request
 * → Reviews shipper details (origin, destination, item) → Provides bid price
 * → Clicks "Accept" → This endpoint called → Shipper notified → Shipper reviews bid
 * → Shipper accepts/rejects driver's offer
 *
 * Difference from createAndAcceptNewRequest:
 * - acceptShipperRequest: Driver accepts request from auto-match (within 1km) → already matched
 * - createAndAcceptNewRequest: Driver manually selects request from job board (outside 1km) → creates new match
 *
 * Performance Notes:
 * - Uses JOIN query to validate request in single database call
 * - Transaction ensures atomic updates across 3 tables (prevents partial updates)
 * - Fetches notification data after transaction commit (ensures consistency)
 * - Notifications sent after successful database commit (prevents notifications for failed updates)
 * - Returns data without calling verifyDriverJourneyStatus (optimized, uses already-fetched data)
 *
 * Transaction Coverage:
 * - ✅ Fully wrapped in transaction via updateJourneyStatus()
 * - ✅ Updates JourneyDecisions, ShipperRequest, DriverRequest atomically
 * - ✅ 15 second timeout for multi-table updates
 * - ✅ Automatic rollback on any failure
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(acceptShipperRequestSchema),
  acceptShipperRequest,
);
/**
 * Start Journey Endpoint
 *
 * Purpose: Allows a driver to officially start a journey after the shipper has accepted their bid.
 * This is the final step before the actual transportation begins. The journey is only considered
 * "active" and counted after this endpoint is called successfully.
 *
 * Context & Workflow:
 * 1. Driver registers availability → status: waiting (1)
 * 2. Auto-matching finds nearby shipper → status: requested (2)
 * 3. Driver provides bid price → status: acceptedByDriver (3)
 * 4. Shipper accepts driver's bid → status: acceptedByShipper (4)
 * 5. Driver starts journey (THIS ENDPOINT) → status: journeyStarted (5)
 * 6. Journey completion → status: journeyCompleted (6)
 *
 * How it works:
 * - Driver provides their current GPS location (latitude, longitude) when starting the journey
 * - System validates the journey decision exists and belongs to the authenticated driver
 * - System validates the journey status is acceptedByShipper (4) - cannot start unaccepted journeys
 * - If no Journey record exists, creates one with startTime and initial JourneyRoutePoint
 * - Updates all related tables: JourneyDecisions, ShipperRequest, DriverRequest, Journey
 * - All tables updated to status = 5 (journeyStarted) atomically
 * - Sends WebSocket and FCM notifications to shipper that journey has started
 * - Returns complete journey data with updated status
 *
 * Database Operations:
 * 1. Validates journey decision exists via JOIN query:
 *    - Joins JourneyDecisions → DriverRequest → Users
 *    - Verifies journeyDecisionUniqueId exists and matches authenticated userUniqueId
 * 2. Validates journey status:
 *    - Ensures journeyStatusId is acceptedByShipper (4) - cannot start if not accepted
 *    - Ensures driver owns the journey decision (userUniqueId matches)
 * 3. ✅ Wrapped in TRANSACTION (all operations atomic):
 *    - Checks if Journey record exists (within transaction for consistency)
 *    - IF Journey DOES NOT EXIST (within transaction):
 *      * Creates Journey record with journeyUniqueId, journeyDecisionUniqueId, journeyStatusId, startTime
 *      * Creates JourneyRoutePoint with current GPS location (latitude, longitude)
 *      * Uses journeyDecisionUniqueId (not journeyUniqueId) for JourneyRoutePoint
 *    - IF Journey EXISTS (within transaction):
 *      * Uses existing journeyUniqueId for status update
 *    - Updates JourneyDecisions: journeyStatusId 4 (acceptedByShipper) → 5 (journeyStarted)
 *    - Updates ShipperRequest: journeyStatusId 4 → 5
 *    - Updates DriverRequest: journeyStatusId 4 → 5
 *    - Updates Journey: journeyStatusId 4 → 5 (always updated if Journey exists)
 *    - All operations atomic (15 second timeout) - either all succeed or all fail
 * 6. Fetches complete journey notification data
 * 7. Sends notifications to shipper:
 *    - WebSocket notification via sendShipperNotification()
 *    - FCM push notification to shipper's device
 *    - Notification includes journey started message
 *
 * Request Body:
 * - journeyDecisionUniqueId: Unique ID of the journey decision to start (required)
 * - latitude: Driver's current GPS latitude when starting journey (required)
 * - longitude: Driver's current GPS longitude when starting journey (required)
 * - userUniqueId: Automatically set from authentication token (set by controller)
 * - journeyStatusId: Automatically set to 5 (journeyStarted) by controller
 * - previousStatusId: Automatically set to 4 (acceptedByShipper) by controller
 *
 * Response:
 * - message: "success"
 * - status: 5 (journeyStarted)
 * - uniqueIds: {
 *     driverRequestUniqueId: UUID,
 *     shipperRequestUniqueId: UUID,
 *     journeyDecisionUniqueId: UUID,
 *     journeyUniqueId: UUID
 *   }
 * - driver: {
 *     driver: Driver request data with updated status,
 *     vehicle: Vehicle details with tariff rates
 *   }
 * - shipper: Shipper request data with updated status
 * - journey: Journey data with startTime and status
 * - decision: JourneyDecision data with updated status
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates journey decision exists and belongs to authenticated driver
 * - Validates journey status is acceptedByShipper (4) - cannot start unaccepted journeys
 * - Prevents drivers from starting journeys not assigned to them
 *
 * Authorization:
 * - Only drivers can start journeys
 * - Driver must own the journeyDecisionUniqueId being started
 * - Journey must be in acceptedByShipper (4) status
 * - Driver must be authenticated and verified
 *
 * Validation:
 * - Validates journeyDecisionUniqueId is provided
 * - Validates latitude and longitude are provided
 * - Validates journey decision exists in database
 * - Validates journey decision belongs to authenticated user
 * - Validates journey status is acceptedByShipper (4)
 * - Validates driver owns the journey decision
 *
 * Error Cases:
 * - "User authentication required": userUniqueId missing from token
 * - "Journey decision not found": journeyDecisionUniqueId doesn't exist
 * - "This journey is not accepted by shipper": Journey status is not acceptedByShipper (4)
 * - "Driver user does not match journey decision": Driver doesn't own the journey decision
 * - "Unable to start journey": General error during journey start
 *
 * Use Case:
 * Driver arrives at pickup location → Opens app → Reviews accepted shipper request
 * → Confirms they're ready to start → Provides current GPS location → Clicks "Start Journey"
 * → This endpoint called → Shipper notified → Journey officially begins
 *
 * Difference from other endpoints:
 * - acceptShipperRequest: Driver accepts and provides bid → status: acceptedByDriver (3)
 * - createAndAcceptNewRequest: Driver manually accepts from job board → status: acceptedByDriver (3)
 * - startJourney: Driver officially begins transportation → status: journeyStarted (5) [THIS ENDPOINT]
 *
 * Status Flow:
 * 1. Shipper accepts driver → status: acceptedByShipper (4)
 * 2. Driver arrives at pickup → Calls this endpoint → status: journeyStarted (5)
 * 3. Journey in progress...
 * 4. Driver completes journey → status: journeyCompleted (6)
 *
 * Performance Notes:
 * - Validates journey decision in single JOIN query (efficient)
 * - Creates Journey and JourneyRoutePoint only if Journey doesn't exist (idempotent)
 * - Status updates handled by updateJourneyStatus (automatic transaction if multiple tables)
 * - Notifications sent after successful database updates (prevents notifications for failed starts)
 * - Returns data using already-fetched notification data (optimized)
 *
 * Transaction Coverage:
 * - ✅ Fully wrapped in transaction (all operations atomic):
 *   - Journey existence check (within transaction for consistency)
 *   - Journey creation if needed (within transaction)
 *   - JourneyRoutePoint creation if needed (within transaction)
 *   - Status updates: JourneyDecisions, ShipperRequest, DriverRequest, Journey (within transaction)
 *   - All operations execute atomically (15 second timeout)
 *   - Automatic rollback on any failure - prevents partial updates
 *   - If any operation fails, all changes are rolled back (no orphaned Journey or JourneyRoutePoint)
 *
 * Important Note:
 * "Journey is not counted unless it says start journey" - This endpoint officially marks the
 * journey as started. Only after successful completion of this endpoint is the journey
 * considered active and tracked in the system. Prior to this, the journey is in "accepted"
 * state but not yet started.
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.START_JOURNEY,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(startJourneySchema),
  startJourney,
);
/**
 * Shipper "No Answer From Driver" Endpoint
 *
 * Purpose: Allows a shipper to receive a report that a driver did not respond to their request.
 * When a driver is matched but fails to respond within the expected time, the system automatically
 * detects the timeout and processes it. This endpoint allows shippers to manually trigger the same
 * process if needed, or receive confirmation of the automatic system detection. The system updates
 * the status to noAnswerFromDriver and automatically creates a new shipper request to find another
 * available driver.
 *
 * Context & Workflow:
 * 1. Driver registers availability → status: waiting (1)
 * 2. Auto-matching finds nearby shipper → status: requested (2)
 * 3. Driver receives notification but doesn't respond within expected time
 * 4. System automatically detects timeout (background job) OR shipper receives report via this endpoint
 * 5. System processes no answer → status: noAnswerFromDriver (13)
 * 6. System creates new shipper request to find another driver
 * 7. Original driver request marked as noAnswerFromDriver
 * 8. Shipper receives notification about driver not responding and new request creation
 *
 * How it works:
 * - System automatically detects when driver doesn't respond (via background job checking timeouts)
 * - Shipper can also manually trigger this endpoint to receive/process the no-answer report
 * - System validates the shipper request and driver request exist
 * - System checks if shipper status is already > 2 and < 5 (acceptedByDriver or acceptedByShipper)
 *   - If yes, returns success with "driver answered calls" message (driver already responded)
 * - If driver hasn't responded:
 *   - Updates JourneyDecisions, DriverRequest, and Journey (if exists) to status = 13 (noAnswerFromDriver)
 *   - Creates a new shipper request with same origin, destination, and vehicle type
 *   - Sends notification to driver about not answering
 *   - Sends notification to shipper about finding another driver (shipper receives the report)
 *   - Returns new shipper request status
 *
 * Database Operations:
 * 1. Fetches ShipperRequest by shipperRequestUniqueId to validate it exists
 * 2. Fetches DriverRequest by driverRequestUniqueId to get driver information
 * 3. Validates shipper request status:
 *    - IF status > 2 AND < 5 (acceptedByDriver or acceptedByShipper):
 *      * Returns early with "driver answered calls" message
 *      * No status updates performed
 *    - ELSE (status is waiting (1) or requested (2)):
 *      * Proceeds with no answer processing
 * 4. ✅ Wrapped in TRANSACTION (all operations atomic):
 *    - Batch check: Validates existing requests by batch ID (within transaction for consistency)
 *    - Updates JourneyDecisions: journeyStatusId 2 (requested) → 13 (noAnswerFromDriver)
 *    - Updates DriverRequest: journeyStatusId 2 → 13
 *    - Updates Journey: journeyStatusId 2 → 13 (if Journey record exists)
 *    - Creates new ShipperRequest with same origin, destination, vehicle type
 *    - New request created with status = waiting (1) to find another driver
 *    - All operations wrapped in single transaction (15 second timeout)
 *    - Either all operations succeed or all fail (atomic)
 * 5. Sends notifications (after successful transaction commit):
 *    - WebSocket notification to driver: "driver_not_answered" message
 *    - WebSocket notification to shipper: "request_other_driver" message with new request details
 *      (Shipper receives the report that driver didn't respond)
 *
 * Request Body:
 * - shipperRequestUniqueId: Unique ID of the shipper request (required)
 * - driverRequestUniqueId: Unique ID of the driver request that didn't respond (required)
 * - vehicle: {vehicleTypeUniqueId} - Vehicle type for new request (required)
 * - userUniqueId: Automatically set from authentication token (set by controller)
 * - journeyStatusId: Automatically set to 13 (noAnswerFromDriver) by controller
 * - previousStatusId: Automatically set to 2 (requested) by controller
 *
 * Response (if driver already answered):
 * - message: "success"
 * - data: "driver_answered_calls" message type
 *
 * Response (if driver didn't answer):
 * - message: "success"
 * - status: New shipper request journeyStatusId (typically 1 = waiting)
 * - data: "driver_not_answered" message type
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires shipper identity verification (verifyShippersIdentity)
 * - Validates shipper request exists
 * - Validates driver request exists
 * - Only shipper who owns the request can receive/trigger the no-answer report
 *
 * Authorization:
 * - Only shippers can receive/trigger the no-answer report
 * - Shipper must own the shipperRequestUniqueId to receive the report
 * - Shipper must be authenticated and verified
 * - Request must be in waiting (1) or requested (2) status (not already accepted)
 *
 * Validation:
 * - Validates shipperRequestUniqueId is provided
 * - Validates driverRequestUniqueId is provided
 * - Validates vehicle information is provided
 * - Validates shipper request exists in database
 * - Validates driver request exists in database
 * - Checks if shipper status indicates driver already responded
 *
 * Error Cases:
 * - "User authentication required": userUniqueId missing from token
 * - "Shipper request not found": shipperRequestUniqueId doesn't exist
 * - "Driver request not found": driverRequestUniqueId doesn't exist
 * - General errors if status update or new request creation fails
 *
 * Use Case:
 * Shipper creates request → System matches with nearby driver → Driver receives notification
 * → Driver doesn't respond within timeout period → System automatically detects timeout
 * → System processes no answer and sends report to shipper → Shipper receives notification
 * → System marks driver as non-responsive → Creates new request → Finds another driver
 *
 * Status Flow:
 * 1. Auto-matching finds driver → status: requested (2)
 * 2. Driver doesn't respond within timeout → System automatically detects → status: noAnswerFromDriver (13)
 *    OR Shipper manually triggers endpoint to receive report → status: noAnswerFromDriver (13)
 * 3. New shipper request created → status: waiting (1)
 * 4. System finds another driver → status: requested (2)
 *
 * Performance Notes:
 * - Fetches shipper request and driver request separately (could be optimized)
 * - Status updates and new request creation wrapped in single transaction (atomic)
 * - Notifications sent after successful transaction commit (prevents notifications for failed operations)
 * - Returns new shipper request status for immediate feedback
 *
 * Transaction Coverage:
 * - ✅ Fully wrapped in transaction (all operations atomic):
 *   - Batch check: Validates existing requests by batch ID (within transaction for consistency)
 *   - Status updates: Updates JourneyDecisions, DriverRequest, Journey (if exists) within transaction
 *   - New ShipperRequest creation: Creates new request within same transaction
 *   - All operations execute atomically (15 second timeout)
 *   - Automatic rollback on any failure - prevents partial updates
 *   - If any operation fails, all changes are rolled back (no orphaned status updates or requests)
 *   - Notifications only sent after successful transaction commit
 *
 * Important Notes:
 * - JourneyStatusId 13 is used for "noAnswerFromDriver" (according to seed data:
 *   journeyStatusId 13 = "noAnswerFromDriver", journeyStatusId 11 = "completedByAdmin")
 * - System automatically detects timeouts via background job (see automaticTimeout.service.js)
 * - This endpoint allows shippers to manually trigger/receive the no-answer report if needed
 * - When system automatically detects timeout, shipper receives notification automatically
 * - This endpoint creates a new shipper request automatically to continue finding drivers
 * - Original driver is marked as non-responsive but can still receive future requests
 * - Shipper can only receive/trigger no-answer report if request is in waiting (1) or requested (2) status
 * - Shipper is the RECEIVER of the report, not the reporter - system detects and reports automatically
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.NO_ANSWER_FROM_DRIVER,
  verifyTokenOfAxios,
  verifyShippersIdentity,
  noAnswerFromDriver,
);
/**
 * Driver Cancel Request Endpoint
 *
 * Purpose: Allows a driver to cancel their participation in the bidding process for a shipper request.
 * When a driver cancels their request, the system updates the driver's status, potentially updates the
 * shipper's status based on the number of active drivers, sends notifications, and registers the
 * cancellation for audit purposes.
 *
 * Context & Workflow:
 * 1. Driver has an active request (status: waiting (1), requested (2), acceptedByDriver (3), etc.)
 * 2. Driver decides to cancel their participation (THIS ENDPOINT)
 * 3. System determines appropriate status based on cancellation timing:
 *    - rejectedByDriver (15): Driver cancels BEFORE accepting (status < 3) - no commitment made
 *    - cancelledByDriver (9): Driver cancels AFTER accepting (status >= 3) - commitment broken
 * 4. System updates DriverRequest status
 * 5. System updates JourneyDecisions status (if JourneyDecision exists)
 * 6. System updates Journey status (if Journey exists and was started)
 * 7. System checks number of active drivers for the shipper request:
 *    - IF only 1 driver (only 1 JourneyDecision): Update shipper status to waiting (1)
 *    - IF multiple drivers (multiple JourneyDecisions): Leave shipper status unchanged
 * 8. System sends notification to shipper (only for cancelledByDriver, NOT rejectedByDriver)
 * 9. System registers cancellation in CanceledJourneys table
 * 10. System sends admin notification (if appropriate)
 *
 * How it works:
 * - Driver cancels their request by their own reason
 * - System validates driver has an active request
 * - System determines cancellation type based on current status:
 *   - rejectedByDriver (15): Status < 3 (waiting or requested) - driver never committed
 *   - cancelledByDriver (9): Status >= 3 (acceptedByDriver or higher) - driver committed then withdrew
 * - Updates DriverRequest, JourneyDecisions (if exists), Journey (if exists)
 * - Checks number of JourneyDecisions for the shipper request:
 *   - Single driver scenario: Shipper status → waiting (1) (request is now unassigned)
 *   - Multiple drivers scenario: Shipper status unchanged (other drivers still active)
 * - Sends notification to shipper only for cancelledByDriver (9) - NOT for rejectedByDriver (15)
 *   - rejectedByDriver doesn't notify shipper since no expectation was set
 *   - cancelledByDriver notifies shipper since commitment was broken
 * - Registers cancellation in CanceledJourneys table for audit
 * - Sends admin notification if journey hadn't started yet
 *
 * Database Operations:
 * 1. READ: Validates driver has active request (checks activeDriverRequest - outside transaction)
 * 2. READ: Fetches active driver request data (outside transaction)
 * 3. Determines cancellation status:
 *    - IF currentJourneyStatusId >= 3 (acceptedByDriver): cancelledByDriver (9)
 *    - ELSE: rejectedByDriver (15)
 * 4. READ: Fetches JourneyDecisions by driverRequestId (if exists - outside transaction)
 * 5. READ: Fetches Journey data (if JourneyDecisionUniqueId exists - outside transaction)
 * 6. READ: Fetches ShipperRequest and associated data (outside transaction)
 * 7. ✅ WRAP IN TRANSACTION (all write operations atomic):
 *    a. Count JourneyDecisions: Counts journey decisions for shipper request WITHIN transaction
 *       - This ensures consistent snapshot even if other transactions are modifying data
 *       - Count performed BEFORE status updates to determine shipper status change
 *       - IF count === 1: This is only driver, shipper will go back to waiting
 *       - IF count > 1: Multiple drivers, shipper status stays unchanged
 *    b. Update DriverRequest: Sets journeyStatusId to determined status (9 or 15)
 *    c. Update JourneyDecisions (if exists):
 *       - Sets journeyStatusId to determined status (9 or 15, or 10 if admin)
 *       - Sets isCancellationByDriverSeenByShipper:
 *         * "no need to see it" for rejectedByDriver (15)
 *         * "not seen by shipper yet" for cancelledByDriver (9)
 *    d. Update ShipperRequest (conditional - only if count === 1):
 *       - Sets journeyStatusId to waiting (1) if this is the only driver
 *       - No update if multiple drivers exist (shipper status unchanged)
 *    e. Update Journey (conditional - only if journey started):
 *       - Sets journeyStatusId to cancelledByDriver (9)
 *    - All operations wrapped in single transaction (20 second timeout)
 *    - Either all succeed or all fail (atomic)
 * 8. After successful transaction commit:
 *    a. Registers cancellation in CanceledJourneys table (audit/analytics - non-critical):
 *       - Context: JOURNEY (if journey started) or JOURNEY_DECISIONS (if decision exists but journey not started)
 *       - Includes cancellation reason, user info, timestamps
 *    b. Sends notifications (only after successful commit):
 *       - Shipper WebSocket notification (only for cancelledByDriver (9), NOT rejectedByDriver (15))
 *       - Shipper FCM notification (only for cancelledByDriver (9))
 *       - Admin WebSocket notification (if journey hadn't started yet)
 *
 * Request Query Parameters:
 * - userUniqueId: User unique ID of the driver to cancel (optional, defaults to authenticated user)
 *   - Can be "self" to use authenticated user's ID
 * - roleId: Role ID of the user (optional, from query)
 * - cancellationReasonsTypeId: ID of the cancellation reason type (optional, defaults to 1)
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 * - Content-Type: application/json
 *
 * Response (Success):
 * - message: "success"
 * - status: journeyStatusId (9 for cancelledByDriver, 15 for rejectedByDriver, or 10 for cancelledByAdmin)
 * - uniqueIds: {
 *     driverRequestUniqueId: "...",
 *     shipperRequestUniqueId: "...",
 *     journeyDecisionUniqueId: "...",
 *     journeyUniqueId: "..." (or null)
 *   }
 * - driver: { driver: {...}, vehicle: {...} } (driver and vehicle info)
 * - shipper: {...} (shipper request info)
 * - journey: {...} (journey info, or null)
 * - decision: {...} (journey decision info, or null)
 *
 * Response (Simple - for rejectedByDriver or when notification data unavailable):
 * - status: journeyStatusId (15 for rejectedByDriver, or null)
 * - message: "success"
 * - data: "You have successfully cancelled your request."
 *
 * Response (Error):
 * - message: "error"
 * - error: "No active driver requests found for this user" (if no active request)
 * - error: "Unable to fetch shipper details or phone number" (if shipper data unavailable)
 * - error: "Unable to cancel driver request" (general error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver has an active request
 * - Validates user can cancel the request (ownership validation)
 *
 * Authorization:
 * - Only drivers can cancel their requests
 * - Driver must own the request being cancelled (or be admin)
 * - Driver must be authenticated and verified
 * - Request must be in an active status
 *
 * Validation:
 * - Validates driver has active request
 * - Validates shipper request exists (if JourneyDecision exists)
 * - Validates shipper has phone number (for notifications)
 * - Validates JourneyDecision exists (for certain operations)
 *
 * Error Cases:
 * - "No active driver requests found for this user": Driver has no active requests
 * - "Unable to fetch shipper details or phone number": Shipper data not found
 * - "Unable to cancel driver request": General processing error
 *
 * Use Case:
 * Driver creates request → System matches with shipper → Driver accepts request (status: acceptedByDriver)
 * → Driver decides to cancel → Driver calls this endpoint → System determines cancellation type
 * → System updates driver status to cancelledByDriver (9) → System checks if shipper has other drivers
 * → IF only 1 driver: Shipper status → waiting (1) → Shipper receives notification
 * → IF multiple drivers: Shipper status unchanged → Shipper receives notification about this specific driver
 *
 * Status Flow - Single Driver Scenario:
 * 1. Driver accepts request → DriverRequest: acceptedByDriver (3), ShipperRequest: acceptedByDriver (3)
 * 2. Driver cancels → DriverRequest: cancelledByDriver (9), JourneyDecisions: cancelledByDriver (9)
 * 3. System checks: Only 1 JourneyDecision for shipper → ShipperRequest: waiting (1)
 * 4. Shipper receives notification: "Driver cancelled your request"
 * 5. Shipper status returns to waiting (1) to find another driver
 *
 * Status Flow - Multiple Drivers Scenario:
 * 1. Multiple drivers accept request → Each DriverRequest: acceptedByDriver (3), ShipperRequest: acceptedByDriver (3)
 * 2. One driver cancels → That DriverRequest: cancelledByDriver (9), That JourneyDecisions: cancelledByDriver (9)
 * 3. System checks: Multiple JourneyDecisions for shipper → ShipperRequest: unchanged (still acceptedByDriver (3))
 * 4. Shipper receives notification: "Driver cancelled your request" (about specific driver)
 * 5. Shipper status remains acceptedByDriver (3) because other drivers are still active
 *
 * Status Types:
 * - rejectedByDriver (15): Driver cancels BEFORE accepting (status < 3) - no commitment made
 *   - No shipper notification (shipper never expected this driver)
 *   - isCancellationByDriverSeenByShipper = "no need to see it"
 *   - Shipper status logic still applies (waiting if only driver, unchanged if multiple)
 *
 * - cancelledByDriver (9): Driver cancels AFTER accepting (status >= 3) - commitment broken
 *   - Shipper notification sent (expectation was set and then broken)
 *   - isCancellationByDriverSeenByShipper = "not seen by shipper yet"
 *   - Shipper can see this in cancellation notifications
 *   - Shipper status logic applies (waiting if only driver, unchanged if multiple)
 *
 * - cancelledByAdmin (10): Admin cancels on behalf of driver
 *   - Same behavior as cancelledByDriver but with admin context
 *
 * Important Logic - Shipper Status Update:
 * - The system checks the number of JourneyDecisions for the shipper request
 * - If only 1 JourneyDecision exists: Shipper status → waiting (1)
 *   - This means the shipper has no other drivers, so request returns to waiting state
 *   - Shipper can be matched with other drivers again
 *
 * - If multiple JourneyDecisions exist: Shipper status unchanged
 *   - This means the shipper still has other active drivers
 *   - Only this specific driver is cancelled, others remain active
 *   - Shipper can still select from remaining drivers
 *
 * Important Notes:
 * - This endpoint does NOT create a new shipper request (unlike noAnswerFromDriver)
 * - Shipper status is only updated to waiting (1) if this was the only driver
 * - If shipper has multiple drivers, status remains unchanged
 * - Notifications are only sent for cancelledByDriver (9), NOT for rejectedByDriver (15)
 * - Cancellation is registered in CanceledJourneys table for audit purposes
 * - Admin notifications are sent only if journey hadn't started yet
 * - Journey status is updated if journey had already started
 * - Driver request status is always updated (9 or 15)
 * - JourneyDecisions status is updated if record exists
 *
 * Transaction Coverage:
 * - ✅ Fully wrapped in transaction (all operations atomic):
 *   - Journey decision count: Counts journey decisions for shipper request WITHIN transaction for consistency
 *   - DriverRequest update: Updates driver status to cancelledByDriver (9) or rejectedByDriver (15)
 *   - JourneyDecisions update: Updates decision status and seen flag (if decision exists)
 *   - ShipperRequest update: Updates shipper status to waiting (1) if only 1 driver (conditional, within transaction)
 *   - Journey update: Updates journey status to cancelledByDriver (9) if journey started (conditional)
 *   - All operations wrapped in single transaction (20 second timeout)
 *   - Either all operations succeed or all fail (atomic)
 *   - Automatic rollback on any failure - prevents partial updates
 *   - If any operation fails, all changes are rolled back (no orphaned status updates)
 *   - Count check performed within transaction to ensure accurate snapshot (consistent isolation level)
 *   - Notifications and audit logging executed after successful transaction commit (prevents notifications for failed operations)
 *
 * Performance Notes:
 * - Read operations (fetches) executed before transaction to minimize transaction duration
 * - Multiple database queries to fetch driver, shipper, journey decision, journey data (outside transaction)
 * - Journey decision count check performed WITHIN transaction for consistency (ensures accurate snapshot)
 * - Status updates wrapped in transaction for atomicity (all succeed or all fail)
 * - Notification logic executed after successful transaction commit (prevents notifications for failed operations)
 * - Audit logging (createCanceledJourney) executed after successful transaction commit (non-critical for consistency)
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  cancelDriverRequest,
);
/**
 * Driver Complete Journey Endpoint
 *
 * Purpose: Allows a driver to mark a journey as completed when they arrive at the destination.
 * This is the final step of the journey lifecycle. When a driver completes a journey, the system
 * updates all related statuses to journeyCompleted (6), sets the journey endTime, and notifies
 * the shipper that the journey has been successfully completed. This is when the driver can
 * collect payment for their services.
 *
 * Context & Workflow:
 * 1. Driver accepts shipper request → status: acceptedByDriver (3)
 * 2. Shipper selects driver → status: acceptedByShipper (4)
 * 3. Driver starts journey → status: journeyStarted (5)
 * 4. Driver drives to destination → journey in progress
 * 5. Driver arrives at destination and completes journey (THIS ENDPOINT) → status: journeyCompleted (6)
 * 6. System updates all related tables to journeyCompleted (6)
 * 7. System sets journey endTime to current timestamp
 * 8. System sends notification to shipper about journey completion
 * 9. Driver can now collect payment for their services
 *
 * How it works:
 * - Driver arrives at destination and marks journey as complete
 * - System validates journey decision exists and matches driver
 * - System validates shipper request exists and matches journey decision
 * - System validates journey exists (if journeyUniqueId provided)
 * - System validates userUniqueId matches driver in journey decision
 * - System updates all related statuses to journeyCompleted (6) atomically:
 *   - Journey: journeyStatusId → journeyCompleted (6), endTime → current timestamp
 *   - ShipperRequest: journeyStatusId → journeyCompleted (6)
 *   - JourneyDecisions: journeyStatusId → journeyCompleted (6)
 *   - DriverRequest: journeyStatusId → journeyCompleted (6)
 * - System sends notification to shipper about journey completion
 * - Returns updated journey data with completion status
 *
 * Database Operations:
 * 1. READ: Fetches journey decision with driver and journey data (outside transaction)
 *    - Validates journey decision exists
 *    - Validates driver userUniqueId matches
 *    - Validates journey exists and matches (if journeyUniqueId provided)
 * 2. READ: Fetches shipper request data (outside transaction)
 *    - Validates shipper request exists
 *    - Validates shipperRequestId matches journey decision
 * 3. ✅ WRAP IN TRANSACTION (all status updates atomic):
 *    - Updates Journey: journeyStatusId → journeyCompleted (6), endTime → current timestamp
 *    - Updates ShipperRequest: journeyStatusId → journeyCompleted (6)
 *    - Updates JourneyDecisions: journeyStatusId → journeyCompleted (6)
 *    - Updates DriverRequest: journeyStatusId → journeyCompleted (6)
 *    - All operations wrapped in single transaction (20 second timeout)
 *    - Either all operations succeed or all fail (atomic)
 *    - Automatic rollback on any failure - prevents partial updates
 *    - If any operation fails, all changes are rolled back (no orphaned status updates)
 * 4. After successful transaction commit:
 *    - Fetches updated journey notification data (read operation)
 *    - Sends WebSocket notification to shipper: "driver_completed_journey" message
 *    - Sends FCM notification to shipper about journey completion
 *    - Returns complete journey data with all related information
 *
 * Request Body:
 * - journeyDecisionUniqueId: Unique ID of the journey decision (required)
 * - shipperRequestUniqueId: Unique ID of the shipper request (required)
 * - journeyUniqueId: Unique ID of the journey (optional, if journey exists)
 * - userUniqueId: Automatically set from authentication token (set by controller)
 * - journeyStatusId: Automatically set to 6 (journeyCompleted) by controller
 * - previousStatusId: Automatically set to 5 (journeyStarted) by controller
 * - driverRequestUniqueId: Automatically extracted from journey decision data (included in update)
 *
 * Response (Success):
 * - message: "success"
 * - status: journeyStatusId (6 = journeyCompleted)
 * - uniqueIds: {
 *     driverRequestUniqueId: "...",
 *     shipperRequestUniqueId: "...",
 *     journeyDecisionUniqueId: "...",
 *     journeyUniqueId: "..." (or null)
 *   }
 * - driver: { driver: {...}, vehicle: {...} } (driver and vehicle info)
 * - shipper: {...} (shipper request info)
 * - journey: {...} (journey info with endTime set)
 * - decision: {...} (journey decision info)
 *
 * Response (Error):
 * - message: "error"
 * - error: "Journey decision not found or data mismatch" (if journey decision not found)
 * - error: "Driver user does not match journey decision" (if userUniqueId mismatch)
 * - error: "Journey does not match journey decision" (if journeyUniqueId mismatch)
 * - error: "Shipper request not found" (if shipper request not found)
 * - error: "Shipper request data not found" (if shipper data unavailable)
 * - error: "Shipper request does not match journey decision" (if shipperRequestId mismatch)
 * - error: "Unable to complete journey" (general processing error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates journey decision exists
 * - Validates driver owns the journey (userUniqueId matches)
 * - Validates shipper request matches journey decision
 * - Validates journey matches journey decision (if provided)
 *
 * Authorization:
 * - Only drivers can complete journeys
 * - Driver must own the journey being completed (userUniqueId must match)
 * - Driver must be authenticated and verified
 * - Journey must exist and be in journeyStarted (5) status
 *
 * Validation:
 * - Validates journeyDecisionUniqueId is provided
 * - Validates shipperRequestUniqueId is provided
 * - Validates journey decision exists in database
 * - Validates shipper request exists in database
 * - Validates driver userUniqueId matches journey decision driver
 * - Validates journey exists and matches (if journeyUniqueId provided)
 * - Validates shipperRequestId matches journey decision
 *
 * Error Cases:
 * - "Journey decision not found or data mismatch": Journey decision doesn't exist or IDs don't match
 * - "Driver user does not match journey decision": Driver trying to complete someone else's journey
 * - "Journey does not match journey decision": journeyUniqueId doesn't match journey decision
 * - "Shipper request not found": Shipper request doesn't exist
 * - "Shipper request data not found": Shipper data structure invalid
 * - "Shipper request does not match journey decision": shipperRequestId doesn't match
 * - "Unable to complete journey": General processing error
 *
 * Use Case:
 * Driver accepts request → Shipper selects driver → Driver starts journey → Driver drives to destination
 * → Driver arrives at destination → Driver calls this endpoint → System updates all statuses to completed
 * → Shipper receives notification → Driver can collect payment → Journey lifecycle complete
 *
 * Status Flow:
 * 1. Journey in progress → status: journeyStarted (5)
 * 2. Driver arrives at destination and completes journey → status: journeyCompleted (6)
 *    - Journey: journeyStatusId 5 → 6, endTime set
 *    - ShipperRequest: journeyStatusId 5 → 6
 *    - JourneyDecisions: journeyStatusId 5 → 6
 *    - DriverRequest: journeyStatusId 5 → 6
 * 3. All related tables updated atomically to journeyCompleted (6)
 * 4. Shipper receives notification about journey completion
 *
 * Important Logic:
 * - Journey endTime is automatically set to current timestamp when status changes to journeyCompleted (6)
 * - All related tables (Journey, ShipperRequest, JourneyDecisions, DriverRequest) are updated atomically
 * - Shipper receives notification only after successful transaction commit
 * - This is the final step - journey cannot be reversed after completion
 * - Driver can collect payment after journey is marked as completed
 *
 * Important Notes:
 * - This is the final step of the journey lifecycle - cannot be undone
 * - Journey endTime is automatically set to current timestamp
 * - All status updates are atomic (all succeed or all fail)
 * - Shipper notification sent only after successful transaction commit
 * - Driver can collect payment for their services after journey completion
 * - Journey status updates: Journey, ShipperRequest, JourneyDecisions, DriverRequest all updated to journeyCompleted (6)
 *
 * Transaction Coverage:
 * - ✅ Fully wrapped in transaction (all operations atomic):
 *   - Journey update: Updates journeyStatusId to journeyCompleted (6) and sets endTime
 *   - ShipperRequest update: Updates status to journeyCompleted (6)
 *   - JourneyDecisions update: Updates status to journeyCompleted (6)
 *   - DriverRequest update: Updates status to journeyCompleted (6)
 *   - All operations wrapped in single transaction (20 second timeout)
 *   - Either all operations succeed or all fail (atomic)
 *   - Automatic rollback on any failure - prevents partial updates
 *   - If any operation fails, all changes are rolled back (no orphaned status updates)
 *   - Notifications executed after successful transaction commit (prevents notifications for failed operations)
 *
 * Performance Notes:
 * - Read operations (fetches) executed before transaction to minimize transaction duration
 * - Multiple database queries to fetch journey decision, driver, journey, shipper data (outside transaction)
 * - Status updates wrapped in transaction for atomicity (all succeed or all fail)
 * - Notification data fetched after successful transaction commit
 * - Notification logic executed after successful transaction commit (prevents notifications for failed operations)
 * - Uses helper function fetchJourneyNotificationData to get comprehensive data for notifications
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.COMPLETE_JOURNEY,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(completeJourneySchema),
  completeJourney,
);
/**
 * Driver Delete Request Endpoint (Safe Delete)
 *
 * Purpose: Allows a driver to safely delete (soft delete) their driver request using the unique UUID.
 * This endpoint performs a safe delete operation by setting a deletedAt timestamp and deletedBy
 * field instead of permanently removing the record from the database. This preserves data integrity,
 * maintains audit trails, and allows for potential recovery if needed.
 *
 * Context & Workflow:
 * 1. Driver has created a driver request (status: waiting (1), requested (2), etc.)
 * 2. Driver decides to delete the request (THIS ENDPOINT)
 * 3. System validates driver owns the request (security check)
 * 4. System checks if request is already deleted (prevents duplicate deletion)
 * 5. System validates request is not in an active journey status (prevents data inconsistency)
 * 6. System performs safe delete: Updates deletedAt and deletedBy instead of hard delete
 * 7. Returns success response
 *
 * How it works:
 * - Driver provides driverRequestUniqueId (UUID) in URL path parameter
 * - System validates authentication token and driver identity
 * - System fetches driver request using driverRequestUniqueId
 * - System validates driver owns the request (userUniqueId matches authenticated user)
 * - System checks if request is already deleted (deletedAt IS NOT NULL)
 * - System validates request is not in active status (acceptedByDriver, acceptedByShipper, journeyStarted, journeyCompleted)
 * - If all validations pass, system performs safe delete:
 *   - Updates deletedAt = current timestamp
 *   - Updates deletedBy = authenticated user's userUniqueId
 * - Record remains in database but marked as deleted
 * - All queries should filter out deleted records (WHERE deletedAt IS NULL)
 *
 * Database Operations:
 * 1. READ: Fetches driver request by driverRequestUniqueId and userUniqueId
 *    - Validates request exists
 *    - Validates driver owns the request (security check)
 *    - Checks if request is already deleted (deletedAt IS NOT NULL)
 *    - Validates request is not in active journey status
 * 2. UPDATE: Safe delete operation
 *    - Updates deletedAt = current timestamp
 *    - Updates deletedBy = authenticated user's userUniqueId
 *    - Conditions: driverRequestUniqueId AND userUniqueId (double-check ownership)
 *    - Only updates if deletedAt IS NULL (not already deleted)
 * 3. Response: Returns success message with deletion timestamp
 *
 * Request Path Parameters:
 * - driverRequestUniqueId: Unique ID (UUID) of the driver request to delete (required)
 *   - Must be a valid UUID format
 *   - Must belong to the authenticated driver
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a driver role
 *   - Driver must own the request being deleted
 *
 * Response (Success):
 * - message: "success"
 * - data: "Driver request deleted successfully"
 * - deletedAt: ISO timestamp of deletion
 *
 * Response (Error):
 * - message: "error"
 * - error: "Driver request unique ID is required" (if driverRequestUniqueId missing - 400)
 * - error: "User not authenticated" (if userUniqueId missing - 401)
 * - error: "Driver request not found or you don't have permission to delete it" (if request not found or not owned - 404)
 * - error: "Driver request is already deleted" (if deletedAt IS NOT NULL - 404)
 * - error: "Cannot delete driver request with active journey status. Please cancel the request first." (if status is active - 400)
 * - error: "Unable to delete driver request" (general processing error - 500)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver owns the request (userUniqueId must match authenticated user)
 * - Uses UUID instead of integer ID to prevent enumeration attacks
 * - Double-checks ownership in both read and update operations
 *
 * Authorization:
 * - Only drivers can delete their own requests
 * - Driver must own the request being deleted (userUniqueId must match)
 * - Driver must be authenticated and verified
 * - Request must not be in an active journey status
 *
 * Validation:
 * - Validates driverRequestUniqueId is provided
 * - Validates userUniqueId is available from authentication token
 * - Validates driver request exists in database
 * - Validates driver owns the request (ownership check)
 * - Validates request is not already deleted
 * - Validates request is not in active journey status
 *
 * Error Cases:
 * - "Driver request unique ID is required": driverRequestUniqueId not provided in URL path
 * - "User not authenticated": Authentication token missing or invalid
 * - "Driver request not found or you don't have permission to delete it": Request doesn't exist or driver doesn't own it
 * - "Driver request is already deleted": Request was previously deleted (deletedAt IS NOT NULL)
 * - "Cannot delete driver request with active journey status. Please cancel the request first.": Request is part of active journey
 * - "Unable to delete driver request": General processing error
 *
 * Use Case:
 * Driver creates request → Driver changes mind or request is no longer needed → Driver calls this endpoint
 * → System validates ownership and status → System performs safe delete → Request marked as deleted
 * → Request remains in database but filtered out of queries → Audit trail maintained
 *
 * Safe Delete vs Hard Delete:
 * - Safe Delete (this endpoint): Sets deletedAt timestamp and deletedBy user
 *   - Record remains in database
 *   - Can be recovered if needed
 *   - Maintains referential integrity
 *   - Preserves audit trail
 *   - All queries should filter: WHERE deletedAt IS NULL
 *
 * - Hard Delete (not used): Permanently removes record from database
 *   - Record is permanently deleted
 *   - Cannot be recovered
 *   - May break referential integrity
 *   - Loses audit trail
 *   - Not recommended for production systems
 *
 * Important Logic:
 * - Only allows deletion of requests that driver owns (userUniqueId must match)
 * - Prevents deletion of requests with active journey status:
 *   - acceptedByDriver (3)
 *   - acceptedByShipper (4)
 *   - journeyStarted (5)
 *   - journeyCompleted (6)
 * - If request is in active status, driver must cancel it first using /api/driver/cancelDriverRequest
 * - Prevents duplicate deletion (checks if deletedAt IS NOT NULL)
 * - Uses UUID (driverRequestUniqueId) instead of integer ID (driverRequestId) for security:
 *   - UUIDs are not sequential (harder to guess/enumerate)
 *   - UUIDs are globally unique (no collision risk)
 *   - UUIDs don't reveal information about database structure
 *
 * Important Notes:
 * - This endpoint performs SAFE DELETE (soft delete), not hard delete
 * - Record remains in database but is marked as deleted
 * - All queries should filter out deleted records: WHERE deletedAt IS NULL
 * - deletedAt timestamp is set to current time when deletion occurs
 * - deletedBy stores the userUniqueId of the user who performed the deletion
 * - Cannot delete requests with active journey status - must cancel first
 * - Uses driverRequestUniqueId (UUID) instead of driverRequestId (integer) for security
 * - Ownership is validated twice: once in read, once in update
 * - Migration required: Add deletedAt DATETIME NULL and deletedBy VARCHAR(36) NULL columns to DriverRequest table
 *
 * Migration Required:
 * To enable safe delete, the following columns must be added to the DriverRequest table:
 * - deletedAt DATETIME NULL DEFAULT NULL COMMENT 'Timestamp when request was deleted (NULL = not deleted)'
 * - deletedBy VARCHAR(36) NULL DEFAULT NULL COMMENT 'User unique ID who deleted the request'
 * - Index: CREATE INDEX idx_driverRequest_deletedAt ON DriverRequest(deletedAt) WHERE deletedAt IS NOT NULL
 * - Update all SELECT queries to filter: WHERE deletedAt IS NULL
 *
 * Example Migration SQL:
 * ```sql
 * ALTER TABLE DriverRequest
 * ADD COLUMN deletedAt DATETIME NULL DEFAULT NULL COMMENT 'Timestamp when request was deleted',
 * ADD COLUMN deletedBy VARCHAR(36) NULL DEFAULT NULL COMMENT 'User unique ID who deleted the request';
 *
 * CREATE INDEX idx_driverRequest_deletedAt ON DriverRequest(deletedAt);
 * ```
 *
 * Query Filtering:
 * All queries that fetch DriverRequest records should include:
 * WHERE deletedAt IS NULL
 * This ensures deleted records are not returned in normal operations.
 *
 * Performance Notes:
 * - Single database read to validate request and ownership
 * - Single database update to set deletedAt and deletedBy
 * - Index on deletedAt improves query performance when filtering deleted records
 * - UUID lookup is indexed for fast retrieval
 * - Ownership check prevents unauthorized deletions
 *
 * Differences from Hard Delete:
 * - Hard delete: DELETE FROM DriverRequest WHERE driverRequestId = ?
 *   - Permanently removes record
 *   - Cannot be recovered
 *   - May break referential integrity
 *
 * - Safe delete (this endpoint): UPDATE DriverRequest SET deletedAt = ?, deletedBy = ? WHERE driverRequestUniqueId = ?
 *   - Marks record as deleted
 *   - Can be recovered
 *   - Maintains referential integrity
 *   - Preserves audit trail
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.UPDATE_DRIVER_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(requestIdParamsSchema, "params"),
  validator(updateDriverRequestSchema),
  updateDriverRequestController,
);
router.delete(
  DRIVER_REQUEST_ENDPOINTS.DELETE_DRIVER_REQUEST,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  deleteRequestController,
);

/**
 * Driver Verify Status Endpoint
 *
 * Purpose: Core endpoint that informs the driver about their current journey status and stage.
 * This is the central point for drivers to understand their current state in the journey lifecycle
 * and make decisions based on it. The driver can determine whether to:
 * - Continue waiting for a shipper match
 * - Move/start journey to pick up shipper
 * - Close the app
 * - Receive payment (if journey completed)
 * - Ask questions to shipper/shipper
 * - Handle cancellation/rejection notifications
 *
 * Context & Journey Lifecycle:
 * This endpoint returns the driver's current status in the journey lifecycle, which can be:
 * 1. No Request: Driver has no active request (status: null)
 * 2. Waiting (1): Driver request created, waiting for nearby shippers
 * 3. Requested (2): Driver matched with shipper, both parties notified
 * 4. Accepted by Driver (3): Driver accepted shipper's request
 * 5. Accepted by Shipper (4): Shipper selected this driver from multiple options
 * 6. Journey Started (5): Driver has started the journey to pick up shipper
 * 7. Journey Completed (6): Driver completed the journey, can receive payment
 * 8. Cancelled by Shipper (7): Shipper cancelled the request
 * 9. Rejected by Shipper (8): Shipper rejected this driver's offer
 * 10. Cancelled by Driver (9): Driver cancelled their participation
 * 11. Cancelled by Admin (10): Admin cancelled the request
 * 12. Cancelled by System (12): System automatically cancelled
 * 13. Not Selected in Bid (14): Driver not selected by shipper in bidding process
 *
 * How it works:
 * 1. Validates driver has an active vehicle assigned (VehicleDriver relation)
 * 2. Checks for active driver requests for this driver
 * 3. If no active request found: Returns success with status: null and vehicle info
 * 4. If active request found: Validates journey status
 * 5. Routes to appropriate handler based on status:
 *    a. Status = waiting (1): Routes to handleJourneyStatusOne
 *       - Searches for nearby shippers matching driver's vehicle type
 *       - Finds first non-rejected shipper
 *       - Auto-matches driver with shipper (creates JourneyDecision)
 *       - Updates DriverRequest and ShipperRequest statuses to "requested" (2)
 *       - Sends notification to shipper about driver match
 *       - Returns driver, shipper, decision data with status: requested (2)
 *    b. Status = any other status: Routes to handleExistingJourney
 *       - Fetches JourneyDecision data
 *       - Fetches comprehensive journey data (shipper, journey, decision)
 *       - Handles notifications for negative statuses (cancellation, rejection, not selected)
 *       - Returns complete journey data with current status
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ verifyDriverJourneyStatus (Entry Point)                           │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Check Vehicle
 *                  │   └─→ If no vehicle: Return error
 *                  │
 *                  ├─→ Step 2: Check Active Request
 *                  │   └─→ If no request: Return {status: null, vehicle}
 *                  │
 *                  ├─→ Step 3: Validate Status
 *                  │   └─→ If terminal status (> 6) and not notification status:
 *                  │       Return {status: null, "request not active"}
 *                  │
 *                  ├─→ Step 4: Route by Status
 *                  │   ├─→ Status = waiting (1)
 *                  │   │   └─→ handleJourneyStatusOne()
 *                  │   │       ├─→ Find nearby shippers
 *                  │   │       ├─→ Find first non-rejected shipper
 *                  │   │       ├─→ [TRANSACTION] Create JourneyDecision
 *                  │   │       ├─→ [TRANSACTION] Update DriverRequest → requested (2)
 *                  │   │       ├─→ [TRANSACTION] Update ShipperRequest → requested (2)
 *                  │   │       ├─→ Send notification to shipper
 *                  │   │       └─→ Return {status: 2, driver, shipper, decision}
 *                  │   │
 *                  │   └─→ Status = any other (2-14)
 *                  │       └─→ handleExistingJourney()
 *                  │           ├─→ Fetch JourneyDecision
 *                  │           ├─→ Fetch comprehensive journey data
 *                  │           ├─→ Handle cancellation/rejection notifications
 *                  │           └─→ Return {status, driver, shipper, journey, decision}
 *                  │
 *                  └─→ Response: Complete journey status data
 *
 * Database Operations:
 * 1. READ: Fetches active vehicle for driver (VehicleDriver relation)
 *    - Validates driver has active vehicle assignment
 *    - Gets vehicleTypeUniqueId for shipper matching
 * 2. READ: Fetches active driver request (DriverRequest table)
 *    - Gets driver's current request with journeyStatusId
 *    - Includes request location, status, timestamps
 * 3. READ: (Status = waiting only) Finds nearby shippers (ShipperRequest table)
 *    - Searches within radius based on driver's location
 *    - Filters by vehicle type compatibility
 *    - Excludes already rejected shippers
 * 4. READ: (Status = waiting only) Validates shipper not previously rejected
 *    - Checks RejectedRequests table to ensure shipper hasn't rejected this driver
 * 5. ✅ WRITE (Status = waiting only - within transaction):
 *    - Creates JourneyDecision record (links driver and shipper)
 *    - Updates DriverRequest status: waiting (1) → requested (2)
 *    - Updates ShipperRequest status: waiting (1) → requested (2)
 *    - All wrapped in single transaction (15 second timeout) for atomicity
 * 6. READ: (Status = other) Fetches JourneyDecision by driverRequestId
 * 7. READ: (Status = other) Fetches comprehensive journey data:
 *    - ShipperRequest data with User details
 *    - JourneyDecision data
 *    - Journey data (if journey started)
 *    - DriverRequest data with Vehicle details
 * 8. WRITE (Status = other, data inconsistency fix): Updates DriverRequest status to cancelledByDriver (9)
 *    - Single table update (no transaction needed)
 *    - Only occurs when JourneyDecision is missing but status > 1 (data inconsistency)
 * 9. WRITE (Status = other, data inconsistency fix): Calls updateJourneyStatus to fix data inconsistency
 *    - May update multiple tables: JourneyDecisions, ShipperRequest, DriverRequest, Journey (if applicable)
 *    - updateJourneyStatus automatically wraps in transaction if multiple tables are updated
 *    - Fix: Added await (was missing, causing potential race condition)
 *    - All operations atomic (15 second timeout) when multiple tables updated
 *
 * Transaction Coverage:
 * - ✅ Auto-matching (Status = waiting): Fully wrapped in transaction (lines 2629-2658)
 *   - Creates JourneyDecision record
 *   - Updates DriverRequest status: waiting (1) → requested (2)
 *   - Updates ShipperRequest status: waiting (1) → requested (2)
 *   - All three operations wrapped in single transaction (15 second timeout)
 *   - Either all succeed or all fail (atomic)
 *   - Prevents partial matches (driver matched but shipper not, or vice versa)
 *   - Automatic rollback on any failure
 *   - Prevents data inconsistency where driver thinks they're matched but shipper doesn't
 *
 * - ✅ Data consistency fixes (Status = other): Transaction coverage via updateJourneyStatus
 *   - Single table update (DriverRequest only): No transaction needed (line 2694)
 *     - Only updates DriverRequest when JourneyDecision missing but status > 1
 *     - Single table operation, atomic by default
 *   - Multi-table update (via updateJourneyStatus): Automatically wrapped in transaction (line 2737)
 *     - updateJourneyStatus function has built-in transaction logic
 *     - Automatically wraps in transaction if tableCount > 1 (JourneyDecisions, ShipperRequest, DriverRequest, Journey)
 *     - All operations atomic (15 second timeout) when multiple tables updated
 *     - Either all succeed or all fail (atomic)
 *     - Fix: Added await - was missing, causing potential race condition
 *     - Prevents partial updates when fixing data inconsistency
 *
 * - ✅ All write operations have transaction coverage where needed:
 *   - Auto-matching: Explicit transaction (executeInTransaction)
 *   - Data consistency fixes: Single table (no transaction) or multi-table via updateJourneyStatus (automatic transaction)
 *   - All critical multi-table operations are atomic
 *
 * Request Query Parameters:
 * - None required (uses authenticated user's userUniqueId from token)
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a driver role
 *   - userUniqueId extracted from token automatically
 *
 * Response (Success - No Active Request):
 * - message: "success"
 * - data: "No active requests found for this driver"
 * - status: null
 * - vehicle: { ...vehicle data... }
 *
 * Response (Success - Waiting Status, No Nearby Shippers):
 * - message: "success"
 * - status: 1 (waiting)
 * - uniqueIds: {
 *     driverRequestUniqueId: "...",
 *     shipperRequestUniqueId: null,
 *     journeyDecisionUniqueId: null
 *   }
 * - driver: { driver: {...}, vehicle: {...} }
 * - shipper: null
 * - journey: null
 * - decision: null
 *
 * Response (Success - Auto-matched with Shipper):
 * - message: "success"
 * - status: 2 (requested)
 * - uniqueIds: {
 *     driverRequestUniqueId: "...",
 *     shipperRequestUniqueId: "...",
 *     journeyDecisionUniqueId: "..."
 *   }
 * - driver: { driver: {...}, vehicle: {...} }
 * - shipper: { ...shipper request data... }
 * - journey: null (journey not started yet)
 * - decision: { ...journey decision data... }
 *
 * Response (Success - Existing Journey):
 * - message: "success"
 * - status: journeyStatusId (2-14 depending on current state)
 * - uniqueIds: {
 *     driverRequestUniqueId: "...",
 *     shipperRequestUniqueId: "...",
 *     journeyDecisionUniqueId: "...",
 *     journeyUniqueId: "..." (if journey started, otherwise null)
 *   }
 * - driver: { driver: {...}, vehicle: {...} }
 * - shipper: { ...shipper request data with user details... }
 * - journey: { ...journey data... } (if journey started) or null
 * - decision: { ...journey decision data... }
 *
 * Response (Success - Terminal Status):
 * - message: "success"
 * - data: "This request is not active at the moment"
 * - status: null
 * - vehicle: { ...vehicle data... }
 * - driver: null
 * - shipper: null
 *
 * Response (Error):
 * - message: "error"
 * - error: "No vehicle found for this driver" (if driver has no active vehicle)
 * - error: "Unable to verify driver status" (general processing error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - User identity verified from token (userUniqueId extracted automatically)
 * - Driver must have active vehicle assignment to use this endpoint
 * - Only returns data for the authenticated driver's requests
 *
 * Authorization:
 * - Only authenticated drivers can access this endpoint
 * - Driver must have active vehicle assignment (VehicleDriver relation)
 * - Returns only driver's own request data (no cross-driver data access)
 *
 * Validation:
 * - Validates userUniqueId is available from authentication token
 * - Validates driver has active vehicle assignment
 * - Validates driver request exists (if applicable)
 * - Validates journey status is valid
 * - Validates shipper data exists (for existing journeys)
 *
 * Error Cases:
 * - "No vehicle found for this driver": Driver has no active vehicle in VehicleDriver table
 * - "Driver request not found": Request ID exists but record not found (data inconsistency)
 * - "Unable to verify driver status": General processing error
 *
 * Use Cases:
 * 1. Driver opens app → Calls this endpoint → Gets current status
 * 2. Driver waiting for match → Endpoint auto-matches with nearby shipper → Returns status: requested
 * 3. Driver in journey → Endpoint returns current journey data with status: journeyStarted
 * 4. Driver completed journey → Endpoint returns completed journey data → Driver can receive payment
 * 5. Shipper cancelled → Endpoint returns cancellation status → Driver can see notification
 * 6. Driver rejected by shipper → Endpoint returns rejection status → Driver can mark as seen
 *
 * Status Flow Examples:
 *
 * Example 1: New Driver Request (Auto-match)
 * 1. Driver creates request → status: waiting (1)
 * 2. Driver calls verifyDriverJourneyStatus → Finds nearby shipper
 * 3. System auto-matches → Creates JourneyDecision → Updates statuses
 * 4. Response: status: requested (2), includes shipper and decision data
 * 5. Shipper receives notification about driver match
 *
 * Example 2: Driver Accepted by Shipper
 * 1. Shipper selects driver → status: acceptedByShipper (4)
 * 2. Driver calls verifyDriverJourneyStatus → Returns status: 4 with shipper data
 * 3. Driver can see shipper details and prepare to pick up
 *
 * Example 3: Journey In Progress
 * 1. Driver starts journey → status: journeyStarted (5)
 * 2. Driver calls verifyDriverJourneyStatus → Returns status: 5 with journey data
 * 3. Driver can see journey route, shipper location, etc.
 *
 * Example 4: Journey Completed
 * 1. Driver completes journey → status: journeyCompleted (6)
 * 2. Driver calls verifyDriverJourneyStatus → Returns status: 6 with completed journey data
 * 3. Driver can see payment information and close request
 *
 * Example 5: Shipper Cancelled
 * 1. Shipper cancels request → status: cancelledByShipper (7)
 * 2. Driver calls verifyDriverJourneyStatus → Returns status: 7 with cancellation notification
 * 3. Driver can see cancellation reason and mark as seen
 *
 * Important Logic - Auto-matching (Status = waiting):
 * - Only runs when driver's status is waiting (1)
 * - Searches for nearby shippers within radius
 * - Filters by vehicle type compatibility
 * - Finds first shipper who hasn't rejected this driver
 * - Creates JourneyDecision to link driver and shipper
 * - Updates both DriverRequest and ShipperRequest statuses atomically
 * - Sends notification to shipper about driver match
 * - All database operations wrapped in transaction for data consistency
 *
 * Important Logic - Notification Handling:
 * - Negative statuses (7, 8, 10, 12, 14) trigger notifications:
 *   - cancelledByShipper (7): Shipper cancelled request
 *   - rejectedByShipper (8): Shipper rejected driver's offer
 *   - cancelledByAdmin (10): Admin cancelled request
 *   - cancelledBySystem (12): System automatically cancelled
 *   - notSelectedInBid (14): Driver not selected in bidding
 * - Notifications only sent if driver hasn't seen them yet
 * - Driver must explicitly mark notifications as seen via separate endpoint
 *
 * Important Notes:
 * - This is a READ-HEAVY endpoint (mostly queries, minimal writes)
 * - Auto-matching only happens when status is waiting (1)
 * - Auto-matching is fully transactional to ensure data consistency
 * - Data consistency fixes use updateJourneyStatus which has built-in transaction logic
 * - Terminal statuses (> 6) return null status unless notification is pending
 * - Driver must have active vehicle to use this endpoint
 * - Endpoint is called frequently by driver app to check status
 * - Caching may be beneficial for high-frequency calls
 * - Vehicle assignment check ensures driver is ready to accept requests
 * - All critical write operations have transaction coverage
 *
 * Performance Notes:
 * - Multiple database queries for comprehensive data fetching (read-heavy)
 * - Nearby shipper search can be expensive (geographic calculations)
 * - JourneyDecision and related data fetched via joins for efficiency
 * - Auto-matching wrapped in transaction but kept short (15 second timeout)
 * - Data consistency fixes use updateJourneyStatus which has optimized transaction logic
 * - Single table updates don't use transactions (unnecessary overhead)
 * - Multi-table updates automatically wrapped in transaction (atomic operations)
 * - Consider caching for frequently accessed status data
 * - Vehicle check is lightweight (single indexed query)
 * - Active request check uses indexed query on userUniqueId + journeyStatusId
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/request: This endpoint actively searches for shippers and auto-matches
 * - Unlike /api/driver/acceptShipperRequest: This endpoint handles auto-matching, not manual acceptance
 * - Unlike /api/driver/startJourney: This endpoint doesn't create/start journey, only verifies status
 * - Unlike /api/driver/completeJourney: This endpoint doesn't complete journey, only returns status
 * - This endpoint is called frequently to check current state (polling pattern)
 * - Other endpoints are called for specific actions (accept, start, complete)
 */
router.get(
  DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
  verifyTokenOfAxios,
  validator(verifyDriverJourneyStatusSchema, "query"), // Validates query parameters (empty object - no params needed)
  // verifyDriversIdentity, // Commented out - uses token userUniqueId directly
  verifyDriverJourneyStatusController,
);
// api/user/getDriverRequest?driverUniqueId=uuidv4&target=allOrSingleDriverRequests
router.get(
  DRIVER_REQUEST_ENDPOINTS.GET_DRIVER_REQUEST,
  verifyTokenOfAxios,
  getDriverRequestController,
);
/**
 * Driver Send Updated Location Endpoint
 *
 * Purpose: Allows a driver to send their current location to the shipper/shipper in real-time.
 * This endpoint stores the location in the database for historical tracking and sends a WebSocket
 * notification to the shipper. This enables real-time location tracking of goods delivery,
 * allowing shippers to view where their goods are, where they are going, and estimate delivery time.
 * This builds trust between customers and shippers by providing transparency in the delivery process.
 *
 * Context & Use Case:
 * - Driver is actively transporting goods for a shipper/shipper
 * - Driver's location changes as they move from origin to destination
 * - Location updates are sent periodically to keep shipper informed
 * - Location is stored in JourneyRoutePoints table for historical tracking and audit
 * - Shipper can view real-time location updates via WebSocket connection
 * - Historical location data can be used for route analysis, delivery time estimation, and trust building
 *
 * When to Use:
 * - Journey status: acceptedByDriver (3), acceptedByShipper (4), or journeyStarted (5)
 * - Driver is actively moving with goods
 * - Driver wants to update shipper about current location
 * - For GPS tracking during active journey
 *
 * How it works:
 * 1. Driver sends current location (latitude, longitude) with journeyDecisionUniqueId
 * 2. System validates driver owns the journey (security check)
 * 3. System validates journey is in active status (can only send location for active journeys)
 * 4. System validates location coordinates are within valid ranges
 * 5. System fetches shipper phone number from journey data (if not provided)
 * 6. System stores location in JourneyRoutePoints table (for historical tracking)
 * 7. System sends WebSocket notification to shipper with updated location
 * 8. Returns success response with location data and timestamp
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ sendUpdatedLocation (Entry Point)                           │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Validate Required Fields
 *                  │   └─→ journeyDecisionUniqueId, latitude, longitude, userUniqueId
 *                  │
 *                  ├─→ Step 2: Validate Coordinate Ranges
 *                  │   └─→ latitude: -90 to 90, longitude: -180 to 180
 *                  │
 *                  ├─→ Step 3: Validate Driver Ownership
 *                  │   ├─→ Fetch JourneyDecision by journeyDecisionUniqueId
 *                  │   ├─→ Fetch DriverRequest by driverRequestId + userUniqueId
 *                  │   └─→ If not owned: Return error
 *                  │
 *                  ├─→ Step 4: Validate Journey Status
 *                  │   └─→ Must be active status: acceptedByDriver (3), acceptedByShipper (4), or journeyStarted (5)
 *                  │
 *                  ├─→ Step 5: Fetch Shipper Phone Number
 *                  │   └─→ If not provided: Fetch from journey data via fetchJourneyNotificationData
 *                  │
 *                  ├─→ Step 6: Store Location (Single Table Insert)
 *                  │   └─→ Create JourneyRoutePoint record
 *                  │       ├─→ journeyRoutePointsUniqueId: UUID
 *                  │       ├─→ journeyDecisionUniqueId: Links to journey
 *                  │       ├─→ latitude: Driver's latitude
 *                  │       ├─→ longitude: Driver's longitude
 *                  │       └─→ timestamp: Current timestamp (auto-set)
 *                  │
 *                  ├─→ Step 7: Send Notification
 *                  │   └─→ WebSocket notification to shipper (via createJourneyRoutePoint)
 *                  │       └─→ Message type: update_drivers_location_to_shipper
 *                  │
 *                  └─→ Response: Success with location data
 *
 * Database Operations:
 * 1. READ: Fetches JourneyDecision by journeyDecisionUniqueId
 *    - Validates journey decision exists
 *    - Gets driverRequestId for ownership validation
 * 2. READ: Fetches DriverRequest by driverRequestId and userUniqueId
 *    - Validates driver owns this journey request (security check)
 *    - Gets journeyStatusId for status validation
 * 3. READ (if shipperPhone not provided): Fetches shipper phone number
 *    - Uses fetchJourneyNotificationData to get shipper data
 *    - Extracts phoneNumber from shipper request data
 * 4. ✅ WRITE: Stores location in JourneyRoutePoints table
 *    - Single table insert (no transaction needed - atomic operation)
 *    - Creates JourneyRoutePoint record with:
 *      - journeyRoutePointsUniqueId (UUID)
 *      - journeyDecisionUniqueId (links to journey)
 *      - latitude (driver's current latitude)
 *      - longitude (driver's current longitude)
 *      - timestamp (current timestamp, auto-set by database)
 *    - Foreign key constraint: journeyDecisionUniqueId references JourneyDecisions
 *    - ON DELETE CASCADE: Route points deleted if journey decision is deleted
 * 5. NOTIFICATION: Sends WebSocket notification to shipper
 *    - Executed by createJourneyRoutePoint function
 *    - Message type: update_drivers_location_to_shipper
 *    - Includes location data and timestamp
 *    - Non-blocking (notification failure doesn't fail location storage)
 *
 * Transaction Coverage:
 * - ⚠️ Location storage: Single table insert (JourneyRoutePoints)
 *   - No transaction needed (atomic operation)
 *   - INSERT operation is inherently atomic
 *   - If insert fails, no partial data is created
 *   - No related tables updated, so no consistency concerns
 *
 * - ⚠️ Notifications: Sent outside transaction (non-blocking)
 *   - WebSocket notification sent after successful location storage
 *   - Notification failure doesn't prevent location from being stored
 *   - Ensures location data is preserved even if shipper is offline
 *
 * Request Body:
 * - journeyDecisionUniqueId: Unique ID of the journey decision (required, UUID format)
 *   - Links location update to specific journey
 *   - Used to fetch journey data and validate ownership
 * - latitude: Driver's current latitude (required, number between -90 and 90)
 *   - Must be valid geographic coordinate
 * - longitude: Driver's current longitude (required, number between -180 and 180)
 *   - Must be valid geographic coordinate
 * - userUniqueId: Automatically set from authentication token (set by controller)
 *   - Used for ownership validation
 * - shipperPhone: Shipper's phone number (optional)
 *   - If not provided, fetched from journey data
 *   - Used for WebSocket notification delivery
 * - additionalData: Any additional data to include in notification (optional, object)
 *   - Can include speed, heading, estimated arrival time, etc.
 *   - Passed through to notification payload
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a driver role
 *   - userUniqueId extracted from token automatically
 *
 * Response (Success):
 * - message: "success"
 * - data: "Location updated and sent to shipper successfully"
 * - journeyRoutePointsUniqueId: UUID of the stored route point record
 * - latitude: Stored latitude value
 * - longitude: Stored longitude value
 * - timestamp: Timestamp when location was stored (ISO format)
 * - journeyDecisionUniqueId: Journey decision ID linked to this location point
 *
 * Response (Error):
 * - message: "error"
 * - error: "journeyDecisionUniqueId is required" (if journeyDecisionUniqueId missing)
 * - error: "latitude is required" (if latitude missing)
 * - error: "longitude is required" (if longitude missing)
 * - error: "userUniqueId is required" (if userUniqueId missing - should not happen)
 * - error: "Invalid latitude. Must be between -90 and 90" (if latitude out of range)
 * - error: "Invalid longitude. Must be between -180 and 180" (if longitude out of range)
 * - error: "Journey decision not found" (if journeyDecisionUniqueId invalid)
 * - error: "Driver request not found or you don't have permission to update location for this journey" (if driver doesn't own journey)
 * - error: "Location updates can only be sent for active journeys (accepted or started)" (if journey status invalid)
 * - error: "Unable to fetch shipper information for location update" (if shipper data unavailable)
 * - error: "Shipper phone number not found" (if shipper phone number unavailable)
 * - error: "Failed to store location" (if database insert fails)
 * - error: "Unable to send updated location" (general processing error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver owns the journey (userUniqueId matches DriverRequest)
 * - Validates journey exists and is active
 * - Validates location coordinates are valid
 * - Prevents unauthorized location updates for other drivers' journeys
 *
 * Authorization:
 * - Only drivers can send location updates
 * - Driver must own the journey being updated (userUniqueId must match)
 * - Driver must be authenticated and verified
 * - Journey must be in active status (acceptedByDriver, acceptedByShipper, or journeyStarted)
 *
 * Validation:
 * - Validates journeyDecisionUniqueId is provided and valid UUID
 * - Validates latitude is provided and within range (-90 to 90)
 * - Validates longitude is provided and within range (-180 to 180)
 * - Validates userUniqueId is available from authentication token
 * - Validates journey decision exists in database
 * - Validates driver owns the journey request
 * - Validates journey is in active status
 * - Validates shipper phone number is available (fetched if not provided)
 * - Validates location coordinates are valid geographic coordinates
 *
 * Error Cases:
 * - "journeyDecisionUniqueId is required": Missing required field
 * - "latitude is required": Missing latitude coordinate
 * - "longitude is required": Missing longitude coordinate
 * - "Invalid latitude. Must be between -90 and 90": Latitude out of valid range
 * - "Invalid longitude. Must be between -180 and 180": Longitude out of valid range
 * - "Journey decision not found": journeyDecisionUniqueId doesn't exist in database
 * - "Driver request not found or you don't have permission": Driver doesn't own this journey
 * - "Location updates can only be sent for active journeys": Journey is not in active status
 * - "Unable to fetch shipper information": Shipper data fetch failed
 * - "Shipper phone number not found": Shipper phone number unavailable
 * - "Failed to store location": Database insert failed
 * - "Unable to send updated location": General processing error
 *
 * Use Case:
 * Driver starts journey → Driver drives with goods → Driver periodically sends location updates
 * → System stores location in database → System sends WebSocket notification to shipper
 * → Shipper receives real-time location updates → Shipper can track goods delivery
 * → Historical location data available for route analysis and trust building
 *
 * Real-World Example:
 * 1. Driver picks up goods from shipper (journeyStarted status)
 * 2. Driver drives to destination, GPS updates location every 30 seconds
 * 3. Driver app calls this endpoint with current coordinates
 * 4. System stores location in JourneyRoutePoints table
 * 5. System sends WebSocket notification to shipper's app
 * 6. Shipper sees driver's location on map in real-time
 * 7. Shipper can estimate delivery time based on current location and route
 * 8. Historical route data stored for future analysis and trust verification
 *
 * Important Logic:
 * - Location is stored BEFORE notification is sent (data preservation)
 * - Notification is non-blocking (location stored even if shipper is offline)
 * - Location updates can only be sent for active journeys (prevents updates for completed/cancelled journeys)
 * - Driver ownership is validated twice (in JourneyDecision and DriverRequest)
 * - Shipper phone number is fetched from journey data if not provided (ensures correct recipient)
 * - Coordinate validation prevents invalid GPS data from being stored
 *
 * Important Notes:
 * - Location is stored in JourneyRoutePoints table for historical tracking
 * - Each location update creates a new route point record
 * - Route points are linked to journey via journeyDecisionUniqueId
 * - Historical route data can be queried for route analysis
 * - Location data builds trust by providing delivery transparency
 * - WebSocket notifications enable real-time tracking
 * - Location storage is atomic (single table insert, no transaction needed)
 * - Notification failure doesn't prevent location from being stored
 * - This endpoint is called frequently during active journey (GPS tracking)
 * - Consider rate limiting to prevent excessive database writes
 *
 * Performance Notes:
 * - Single database insert (JourneyRoutePoints table)
 * - Multiple read queries for validation (JourneyDecision, DriverRequest, Shipper data)
 * - Geographic coordinate validation is lightweight (number comparison)
 * - WebSocket notification is non-blocking (doesn't delay response)
 * - Location storage is optimized with indexed journeyDecisionUniqueId
 * - Consider batch insertion for high-frequency updates if needed
 * - Route points table may grow large over time (consider archiving old data)
 *
 * Transaction Coverage:
 * - ⚠️ Location storage: Single table insert (no transaction needed)
 *   - INSERT INTO JourneyRoutePoints is atomic by default
 *   - No related tables updated, so no consistency concerns
 *   - If insert fails, no partial data is created
 *   - Transaction overhead is unnecessary for single table operations
 *
 * - ⚠️ Notifications: Sent after successful storage (non-blocking)
 *   - WebSocket notification sent by createJourneyRoutePoint
 *   - Notification failure doesn't affect location storage
 *   - Location data is preserved even if shipper is offline
 *   - Ensures data integrity over notification delivery
 *
 * Historical Tracking:
 * - Location points stored in JourneyRoutePoints table
 * - Each point linked to journey via journeyDecisionUniqueId
 * - Timestamps automatically recorded for each location point
 * - Historical data can be queried to:
 *   - Reconstruct delivery route
 *   - Calculate actual travel time
 *   - Analyze route efficiency
 *   - Build trust through delivery transparency
 *   - Provide evidence for delivery disputes
 *
 * Trust Building Features:
 * - Real-time location visibility for shippers
 * - Historical route data for verification
 * - Delivery time estimation based on current location
 * - Transparency in goods movement
 * - Evidence of driver's actual route taken
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/startJourney: This endpoint sends location updates, doesn't start journey
 * - Unlike /api/driver/completeJourney: This endpoint tracks location, doesn't complete journey
 * - Unlike /api/driver/verifyDriverJourneyStatus: This endpoint stores location, not just verifies status
 * - This endpoint is called frequently during journey (GPS tracking pattern)
 * - Other endpoints are called for specific journey actions (start, complete, accept)
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.SEND_UPDATED_LOCATION,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(sendUpdatedLocationSchema), // Validates request body: journeyDecisionUniqueId, latitude, longitude
  sendUpdatedLocationController,
);

/**
 * Driver Get Cancellation Notifications Endpoint
 *
 * Purpose: Retrieves cancellation notifications for a driver. This endpoint fetches all journey requests
 * that were cancelled by shippers or admins, allowing drivers to view which requests were cancelled,
 * when they were cancelled, and whether they have been seen by the driver. This helps drivers track
 * cancellations and manage their notification visibility.
 *
 * Context & Use Case:
 * - Driver has received cancellation notifications for their journey requests
 * - Cancellations can occur from two sources:
 *   - cancelledByShipper (7): Shipper cancelled the request after driver was matched
 *   - cancelledByAdmin (10): Admin cancelled the request (typically for policy violations or disputes)
 * - Driver wants to view these cancellations and filter by seen status
 * - Driver can mark cancellations as seen using separate endpoint (/api/driver/markNegativeStatusAsSeen)
 *
 * When to Use:
 * - Driver wants to see all cancellations for their requests
 * - Driver wants to filter cancellations by seen status
 * - Driver needs to check which cancellations they haven't seen yet
 * - Driver wants to review cancellation history for their journey requests
 *
 * How it works:
 * 1. Driver calls endpoint with optional seenStatus filter
 * 2. System extracts userUniqueId from authentication token
 * 3. System queries DriverRequest table for driver's requests
 * 4. System filters by journeyStatusId IN (cancelledByShipper, cancelledByAdmin)
 * 5. System optionally filters by isCancellationByShipperSeenByDriver if seenStatus provided
 * 6. System joins JourneyDecisions to get journey decision data
 * 7. System joins ShipperRequest to get shipper request details
 * 8. System joins Users (driver and shipper) to get user information
 * 9. System enriches data with Journey information if journey exists
 * 10. System formats and returns structured cancellation data
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ getCancellationNotifications (Entry Point)                    │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Extract userUniqueId from Token
 *                  │   └─→ Validates authentication token
 *                  │
 *                  ├─→ Step 2: Extract Query Parameters
 *                  │   └─→ seenStatus (optional): Filter by seen status
 *                  │
 *                  ├─→ Step 3: Build WHERE Conditions
 *                  │   ├─→ DriverRequest.userUniqueId = ? (driver's requests only)
 *                  │   ├─→ DriverRequest.journeyStatusId IN (cancelledByShipper, cancelledByAdmin)
 *                  │   └─→ [Optional] DriverRequest.isCancellationByShipperSeenByDriver = ?
 *                  │
 *                  ├─→ Step 4: Execute SQL Query with JOINs
 *                  │   ├─→ INNER JOIN Users (DriverUser) - Driver user data
 *                  │   ├─→ INNER JOIN JourneyDecisions - Journey decision data
 *                  │   ├─→ INNER JOIN ShipperRequest - Shipper request data
 *                  │   └─→ INNER JOIN Users (ShipperUser) - Shipper user data
 *                  │
 *                  ├─→ Step 5: Enrich Data with Journey Information
 *                  │   └─→ For each result, fetch Journey data if journeyDecisionUniqueId exists
 *                  │       └─→ LEFT JOIN Journey table (optional - journey may not exist)
 *                  │
 *                  ├─→ Step 6: Format Response Data
 *                  │   └─→ Structure data into driverRequest, driver, shipper, shipperRequest, journeyDecision, journey
 *                  │
 *                  └─→ Response: Formatted cancellation notifications array
 *
 * Database Operations:
 * 1. READ: Main query - Complex SELECT with multiple JOINs
 *    - FROM DriverRequest
 *    - INNER JOIN Users (DriverUser) - Get driver user information
 *    - INNER JOIN JourneyDecisions - Link to journey decisions
 *    - INNER JOIN JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
 *    - INNER JOIN ShipperRequest - Get shipper request details
 *    - INNER JOIN JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
 *    - INNER JOIN Users (ShipperUser) - Get shipper user information
 *    - WHERE conditions:
 *      - DriverRequest.userUniqueId = ? (driver's requests only)
 *      - DriverRequest.journeyStatusId IN (cancelledByShipper (7), cancelledByAdmin (10))
 *      - [Optional] DriverRequest.isCancellationByShipperSeenByDriver = ? (filter by seen status)
 *    - ORDER BY DriverRequest.driverRequestCreatedAt DESC (most recent first)
 *    - No LIMIT/OFFSET - Returns all matching records (consider pagination for performance)
 *
 * 2. READ: Enrichment queries - Fetch Journey data for each result
 *    - For each cancellation notification, check if journey exists
 *    - Uses performJoinSelect with Journey table
 *    - JOIN JourneyDecisions on journeyDecisionUniqueId
 *    - Conditions: Journey.journeyDecisionUniqueId = journeyDecisionUniqueId
 *    - This is a N+1 query pattern (consider optimizing with LEFT JOIN in main query)
 *
 * Transaction Coverage:
 * - ⚠️ READ-ONLY Operation: No transactions needed
 *   - All operations are SELECT queries (read-only)
 *   - Read operations are atomic by default in MySQL
 *   - No data consistency concerns (no writes)
 *   - No related tables being updated
 *   - Transaction overhead is unnecessary for read-only operations
 *
 * - Performance Considerations:
 *   - Multiple JOINs can be expensive (4 INNER JOINs + optional Journey queries)
 *   - No pagination implemented (returns all matching records)
 *   - N+1 query pattern for Journey enrichment (consider LEFT JOIN optimization)
 *   - Consider adding pagination (page, limit) for large result sets
 *   - Consider adding indexes on:
 *     - DriverRequest.userUniqueId
 *     - DriverRequest.journeyStatusId
 *     - DriverRequest.isCancellationByShipperSeenByDriver
 *     - JourneyDecisions.driverRequestId
 *     - JourneyDecisions.shipperRequestId
 *
 * Request Query Parameters:
 * - seenStatus (optional): Filter cancellation notifications by seen status
 *   - Valid values:
 *     - "not seen by driver yet": Only returns cancellations driver hasn't seen
 *     - "seen by driver": Only returns cancellations driver has already seen
 *     - "no need to see it": Only returns cancellations marked as "no need to see"
 *   - If not provided: Returns all cancellations regardless of seen status
 *   - Used to filter: DriverRequest.isCancellationByShipperSeenByDriver = ?
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a driver role
 *   - userUniqueId extracted from token automatically
 *
 * Response (Success - No Cancellations):
 * - message: "success"
 * - data: []
 * - count: 0
 *
 * Response (Success - With Cancellations):
 * - message: "success"
 * - data: [
 *     {
 *       driverRequest: {
 *         driverRequestId: number,
 *         driverRequestUniqueId: string (UUID),
 *         userUniqueId: string (UUID),
 *         journeyStatusId: number (7 or 10),
 *         originLatitude: number,
 *         originLongitude: number,
 *         originPlace: string,
 *         driverRequestCreatedAt: datetime,
 *         isCancellationByShipperSeenByDriver: string ("not seen by driver yet" | "seen by driver" | "no need to see it")
 *       },
 *       driver: {
 *         userUniqueId: string (UUID),
 *         fullName: string,
 *         phoneNumber: string,
 *         email: string
 *       },
 *       shipper: {
 *         userUniqueId: string (UUID),
 *         fullName: string,
 *         phoneNumber: string,
 *         email: string
 *       },
 *       shipperRequest: {
 *         shipperRequestId: number,
 *         shipperRequestUniqueId: string (UUID),
 *         vehicleTypeUniqueId: string (UUID),
 *         originLatitude: number,
 *         originLongitude: number,
 *         originPlace: string,
 *         destinationLatitude: number,
 *         destinationLongitude: number,
 *         destinationPlace: string,
 *         shipperRequestCreatedAt: datetime,
 *         shippableItemName: string,
 *         shippableItemQtyInQuintal: number,
 *         shippingDate: date,
 *         deliveryDate: date,
 *         shippingCost: number
 *       },
 *       journeyDecision: {
 *         journeyDecisionId: number,
 *         journeyDecisionUniqueId: string (UUID),
 *         decisionTime: datetime,
 *         decisionBy: string
 *       },
 *       journey: {
 *         journeyUniqueId: string (UUID),
 *         journeyDecisionUniqueId: string (UUID),
 *         startTime: datetime,
 *         endTime: datetime,
 *         journeyStatusId: number,
 *         ... (other journey fields)
 *       } | null (if journey doesn't exist)
 *     },
 *     ... (more cancellation notifications)
 *   ]
 * - count: number (total count of cancellation notifications returned)
 *
 * Response (Error):
 * - message: "error"
 * - error: "Missing user information" (if userUniqueId not found in token)
 * - error: "Unable to get cancellation notifications" (general processing error)
 * - details: string (error message details, in development mode)
 * - data: []
 * - count: 0
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Only returns cancellation notifications for authenticated driver's requests
 * - userUniqueId extracted from token (cannot be spoofed)
 * - No cross-driver data access (filters by DriverRequest.userUniqueId)
 *
 * Authorization:
 * - Only authenticated drivers can access this endpoint
 * - Driver can only see their own cancellation notifications
 * - No access to other drivers' cancellation data
 * - Driver identity verified via verifyDriversIdentity middleware
 *
 * Validation:
 * - Validates userUniqueId is available from authentication token (required)
 * - Validates seenStatus query parameter format (if provided):
 *   - Must be one of: "no need to see it", "not seen by driver yet", "seen by driver"
 *   - Uses Joi schema: getCancellationNotificationsQuerySchema
 *   - Applied via validator middleware on query parameters
 *
 * Error Cases:
 * - "Missing user information": userUniqueId not found in authentication token
 *   - Status: 400 Bad Request
 *   - Cause: Token doesn't contain userUniqueId or token is invalid
 * - "Unable to get cancellation notifications": General processing error
 *   - Status: 500 Internal Server Error
 *   - Cause: Database query failure, network error, or other system error
 *   - Includes error details in development mode
 *
 * Use Cases:
 * 1. Driver wants to see all cancellations: Call endpoint without seenStatus filter
 * 2. Driver wants to see only unseen cancellations: Call endpoint with seenStatus="not seen by driver yet"
 * 3. Driver wants to review cancellation history: Call endpoint and review all cancellations
 * 4. Driver wants to check specific cancellation: Filter and find specific cancellation in results
 * 5. Driver app displays notification badge: Filter by "not seen by driver yet" to count unseen notifications
 *
 * Status Flow Examples:
 *
 * Example 1: Shipper Cancelled Request
 * 1. Driver matched with shipper → JourneyDecision created, status: requested (2)
 * 2. Shipper cancels request → Status updated to cancelledByShipper (7)
 * 3. isCancellationByShipperSeenByDriver set to "not seen by driver yet"
 * 4. Driver calls getCancellationNotifications → Returns cancellation notification
 * 5. Driver marks as seen → isCancellationByShipperSeenByDriver updated to "seen by driver"
 * 6. Driver calls getCancellationNotifications with seenStatus="seen by driver" → Returns cancellation
 *
 * Example 2: Admin Cancelled Request
 * 1. Driver matched with shipper → JourneyDecision created, status: requested (2)
 * 2. Admin cancels request (policy violation) → Status updated to cancelledByAdmin (10)
 * 3. isCancellationByShipperSeenByDriver set to "not seen by driver yet"
 * 4. Driver calls getCancellationNotifications → Returns cancellation notification
 * 5. Driver can see admin cancellation in results
 *
 * Important Logic - Filtering:
 * - Filters by journeyStatusId IN (cancelledByShipper (7), cancelledByAdmin (10))
 *   - cancelledByShipper: Shipper cancelled the request after driver was matched
 *   - cancelledByAdmin: Admin cancelled the request (typically for policy violations)
 * - Filters by isCancellationByShipperSeenByDriver if seenStatus provided
 *   - "not seen by driver yet": Driver hasn't seen this cancellation yet
 *   - "seen by driver": Driver has already seen this cancellation
 *   - "no need to see it": Cancellation marked as "no need to see" (edge case)
 * - Orders by DriverRequest.driverRequestCreatedAt DESC (most recent cancellations first)
 * - Only returns cancellations for authenticated driver (filtered by userUniqueId)
 *
 * Important Logic - Data Enrichment:
 * - For each cancellation notification, enriches with Journey data if journey exists
 * - Journey may not exist if cancellation happened before journey started
 * - Uses N+1 query pattern (consider optimizing with LEFT JOIN in main query)
 * - Filters out null results if Journey enrichment fails
 * - All enrichment queries are non-blocking (Promise.all for parallel execution)
 *
 * Important Notes:
 * - This is a READ-ONLY endpoint (no database writes)
 * - No transactions needed (read operations are atomic by default)
 * - No pagination implemented (returns all matching records)
 * - Consider adding pagination for performance if driver has many cancellations
 * - N+1 query pattern for Journey enrichment (consider LEFT JOIN optimization)
 * - Results ordered by most recent first (DriverRequest.driverRequestCreatedAt DESC)
 * - Only returns cancellations where JourneyDecision exists (INNER JOIN)
 * - Journey data may be null if journey was never started
 * - Filters by driver's userUniqueId to ensure data isolation
 *
 * Performance Notes:
 * - Multiple INNER JOINs (4 tables): DriverRequest, Users (DriverUser), JourneyDecisions, ShipperRequest, Users (ShipperUser)
 * - No pagination: Returns all matching records (could be many if driver has many cancellations)
 * - N+1 query pattern: For each result, additional query to fetch Journey data
 *   - Consider optimizing with LEFT JOIN Journey in main query
 *   - Current implementation: N additional queries (one per cancellation)
 *   - Optimized: Single query with LEFT JOIN (1 query total)
 * - Query performance depends on indexes:
 *   - DriverRequest.userUniqueId (for filtering driver's requests)
 *   - DriverRequest.journeyStatusId (for filtering by cancellation status)
 *   - DriverRequest.isCancellationByShipperSeenByDriver (for filtering by seen status)
 *   - JourneyDecisions.driverRequestId (for JOIN)
 *   - JourneyDecisions.shipperRequestId (for JOIN)
 * - Consider adding composite index: (userUniqueId, journeyStatusId, isCancellationByShipperSeenByDriver)
 * - Response size: Could be large if driver has many cancellations (consider pagination)
 * - Query execution time: Depends on number of cancellations and indexes
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/verifyDriverJourneyStatus: This endpoint focuses on cancellations only, not all statuses
 * - Unlike /api/shipper/getCancellationNotifications: This endpoint is for drivers, filters by cancelledByShipper/cancelledByAdmin
 * - Unlike /api/driver/markNegativeStatusAsSeen: This endpoint only reads data, doesn't update seen status
 * - This endpoint is specifically for cancellation notifications
 * - Other endpoints handle different notification types (rejection, not selected, etc.)
 *
 * Optimization Recommendations:
 * 1. Add pagination (page, limit) to reduce response size and improve performance
 * 2. Optimize N+1 query pattern: Use LEFT JOIN Journey in main query instead of separate queries
 * 3. Add database indexes on frequently filtered columns
 * 4. Consider caching for frequently accessed cancellation lists
 * 5. Consider limiting results by date range (e.g., last 30 days) if pagination is not implemented
 *
 * Transaction Coverage:
 * - ⚠️ READ-ONLY Operation: No transactions needed
 *   - All operations are SELECT queries (read-only)
 *   - Read operations are atomic by default in MySQL
 *   - No data consistency concerns (no writes)
 *   - No related tables being updated
 *   - Transaction overhead is unnecessary and would degrade performance
 *   - Read operations don't require transaction isolation levels
 */
router.get(
  DRIVER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(getCancellationNotificationsQuerySchema, "query"), // Validates seenStatus query parameter
  getCancellationNotificationsController,
);

/**
 * Driver Mark Negative Status As Seen Endpoint
 *
 * Purpose: Unified endpoint that allows a driver to mark any negative status notification as seen.
 * This endpoint automatically detects the current negative status and updates the appropriate "seen by"
 * field, providing a single endpoint for all negative status types instead of separate endpoints for each.
 * This simplifies the API and ensures consistent behavior across all negative status types.
 *
 * Context & Use Case:
 * - Driver receives negative status notifications (cancellation, rejection, not selected, etc.)
 * - Driver wants to mark these notifications as seen to clear notification badges
 * - Different negative statuses store "seen" status in different tables and fields
 * - This endpoint unifies the logic for all negative status types
 * - After marking as seen, the notification will no longer appear in "unseen" filters
 *
 * Supported Negative Statuses:
 * 1. notSelectedInBid (14): Driver was not selected by shipper in bidding process
 *    - Updates: JourneyDecisions.isNotSelectedSeenByDriver → "seen by driver"
 * 2. rejectedByShipper (8): Shipper rejected driver's offer
 *    - Updates: JourneyDecisions.isRejectionByShipperSeenByDriver → "seen by driver"
 * 3. cancelledByShipper (7): Shipper cancelled the request after driver was matched
 *    - Updates: DriverRequest.isCancellationByShipperSeenByDriver → "seen by driver"
 * 4. cancelledByAdmin (10): Admin cancelled the request (policy violation, dispute, etc.)
 *    - Updates: DriverRequest.isCancellationByShipperSeenByDriver → "seen by driver"
 * 5. cancelledBySystem (12): System automatically cancelled the request
 *    - Updates: DriverRequest.isCancellationByShipperSeenByDriver → "seen by driver"
 *
 * When to Use:
 * - Driver wants to clear notification badge for a negative status
 * - Driver has viewed a cancellation/rejection/not selected notification
 * - Driver wants to mark multiple negative statuses as seen
 * - Driver app needs to update seen status after user views notification
 *
 * How it works:
 * 1. Driver sends driverRequestUniqueId in request body
 * 2. System extracts userUniqueId from authentication token
 * 3. System validates driver request exists
 * 4. System validates driver owns the request (security check)
 * 5. System reads current journeyStatusId from DriverRequest
 * 6. System validates current status is a negative status (one of: 7, 8, 10, 12, 14)
 * 7. System determines which table and field to update based on status:
 *    - Status 14 (notSelectedInBid): JourneyDecisions.isNotSelectedSeenByDriver
 *    - Status 8 (rejectedByShipper): JourneyDecisions.isRejectionByShipperSeenByDriver
 *    - Status 7, 10, 12 (cancellations): DriverRequest.isCancellationByShipperSeenByDriver
 * 8. For JourneyDecisions updates:
 *    - Fetches JourneyDecisions record by driverRequestId
 *    - Validates JourneyDecision exists
 *    - Validates JourneyDecision status matches DriverRequest status (consistency check)
 *    - Calls updateJourneyDecision to update seen field
 * 9. For DriverRequest updates:
 *    - Directly updates DriverRequest table with seen status
 *    - Includes userUniqueId in conditions for additional security
 * 10. Returns success message indicating which status was marked as seen
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ markNegativeStatusAsSeen (Entry Point)                        │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Extract userUniqueId from Token
 *                  │   └─→ Validates authentication token
 *                  │
 *                  ├─→ Step 2: Extract driverRequestUniqueId from Body
 *                  │   └─→ Validates via Joi schema (UUID format)
 *                  │
 *                  ├─→ Step 3: Validate Driver Request
 *                  │   ├─→ Fetches DriverRequest by driverRequestUniqueId
 *                  │   ├─→ If not found: Return error
 *                  │   └─→ Validates driver owns request (userUniqueId match)
 *                  │
 *                  ├─→ Step 4: Validate Negative Status
 *                  │   ├─→ Reads currentStatusId from DriverRequest
 *                  │   └─→ Validates status is negative (7, 8, 10, 12, 14)
 *                  │       └─→ If not negative: Return error
 *                  │
 *                  ├─→ Step 5: Determine Update Target
 *                  │   ├─→ Status 14 (notSelectedInBid) → JourneyDecisions.isNotSelectedSeenByDriver
 *                  │   ├─→ Status 8 (rejectedByShipper) → JourneyDecisions.isRejectionByShipperSeenByDriver
 *                  │   └─→ Status 7, 10, 12 (cancellations) → DriverRequest.isCancellationByShipperSeenByDriver
 *                  │
 *                  ├─→ Step 6: Route to Update Path
 *                  │   ├─→ If JourneyDecisions update:
 *                  │   │   ├─→ Fetch JourneyDecisions by driverRequestId
 *                  │   │   ├─→ Validate JourneyDecision exists
 *                  │   │   ├─→ Validate JourneyDecision status matches DriverRequest status
 *                  │   │   └─→ [TRANSACTION?] Update JourneyDecisions via updateJourneyDecision
 *                  │   │
 *                  │   └─→ If DriverRequest update:
 *                  │       └─→ [TRANSACTION?] Update DriverRequest directly
 *                  │           └─→ Conditions: driverRequestUniqueId + userUniqueId (double safeguard)
 *                  │
 *                  └─→ Response: Success message with status name
 *
 * Database Operations:
 * 1. READ: Fetches DriverRequest by driverRequestUniqueId
 *    - Validates driver request exists
 *    - Gets journeyStatusId and userUniqueId
 *    - Used for ownership validation and status detection
 *
 * 2. READ (JourneyDecisions updates only): Fetches JourneyDecisions by driverRequestId
 *    - Validates JourneyDecision exists for this driver request
 *    - Gets journeyDecisionUniqueId for update operation
 *    - Validates JourneyDecision status matches DriverRequest status (consistency check)
 *    - Prevents updating seen status if status mismatch (data integrity)
 *
 * 3. ✅ WRITE (Status 14 - notSelectedInBid): Updates JourneyDecisions table
 *    - Table: JourneyDecisions
 *    - Field: isNotSelectedSeenByDriver
 *    - New Value: "seen by driver"
 *    - Conditions: journeyDecisionUniqueId (from JourneyDecisions record)
 *    - Uses: updateJourneyDecision service function
 *    - Note: updateJourneyDecision validates status is notSelectedInBid before updating
 *
 * 4. ✅ WRITE (Status 8 - rejectedByShipper): Updates JourneyDecisions table
 *    - Table: JourneyDecisions
 *    - Field: isRejectionByShipperSeenByDriver
 *    - New Value: "seen by driver"
 *    - Conditions: journeyDecisionUniqueId (from JourneyDecisions record)
 *    - Uses: updateJourneyDecision service function
 *    - Note: Status validation performed in markNegativeStatusAsSeenByDriver (line 2580)
 *    - Note: updateJourneyDecision doesn't validate rejectedByShipper status (only validates notSelectedInBid)
 *    - This is acceptable because status validation is done before calling updateJourneyDecision
 *
 * 5. ✅ WRITE (Status 7, 10, 12 - cancellations): Updates DriverRequest table
 *    - Table: DriverRequest
 *    - Field: isCancellationByShipperSeenByDriver
 *    - New Value: "seen by driver"
 *    - Conditions: driverRequestUniqueId AND userUniqueId (double safeguard)
 *    - Uses: updateData directly
 *    - Note: No status re-validation in update conditions (relies on initial validation)
 *    - Note: This is acceptable because status is validated at start and update is idempotent
 *
 * Transaction Coverage:
 * - ⚠️ Single Table Updates: No transactions needed
 *   - Each update path updates only ONE table (either JourneyDecisions OR DriverRequest)
 *   - Single table UPDATE operations are atomic by default in MySQL
 *   - No related tables being updated simultaneously
 *   - No data consistency concerns (only updating a single "seen" flag)
 *   - Transaction overhead is unnecessary for single table operations
 *
 * - ⚠️ Read-Then-Update Pattern: Potential race condition (mitigated)
 *   - Reads status from DriverRequest, then updates seen field
 *   - If status changes between read and update, behavior is undefined
 *   - Mitigation: Status is validated at start, update is idempotent (marking as seen multiple times is safe)
 *   - Negative statuses rarely change (they're terminal states)
 *   - For JourneyDecisions updates: Additional validation checks JourneyDecision status matches
 *   - For DriverRequest updates: userUniqueId in conditions provides additional safeguard
 *
 * - Status Validation:
 *   - Initial validation ensures status is negative before proceeding
 *   - For JourneyDecisions: Status match validation before update (line 2580)
 *   - For DriverRequest: No status re-validation (relies on initial check)
 *   - Recommended improvement: Add journeyStatusId to DriverRequest update conditions for atomic status check
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request (required, UUID format)
 *   - Must belong to authenticated driver (validated via userUniqueId)
 *   - Used to fetch DriverRequest and determine current status
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a driver role
 *   - userUniqueId extracted from token automatically
 *
 * Response (Success):
 * - message: "success"
 * - data: "{statusName} notification marked as seen"
 *   - Examples:
 *     - "not selected in bid notification marked as seen"
 *     - "rejected by shipper notification marked as seen"
 *     - "cancelled by shipper notification marked as seen"
 *     - "cancelled by admin notification marked as seen"
 *     - "cancelled by system notification marked as seen"
 *
 * Response (Error):
 * - message: "error"
 * - error: "Driver request not found" (if driverRequestUniqueId doesn't exist)
 * - error: "Unauthorized: Driver request does not belong to this user" (if driver doesn't own request)
 * - error: "This request is not in a negative status that requires marking as seen" (if status is not negative)
 * - error: "Journey decision not found for this driver request" (if JourneyDecision missing for JourneyDecisions updates)
 * - error: "Journey decision status does not match driver request status" (if status mismatch detected)
 * - error: "Failed to update seen status" (if DriverRequest update fails - no rows affected)
 * - error: "Unable to mark negative status as seen" (general processing error)
 * - details: string (error message details, in development mode)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Requires driver identity verification (verifyDriversIdentity)
 * - Validates driver owns the request (userUniqueId must match DriverRequest.userUniqueId)
 * - Double safeguard for DriverRequest updates: includes userUniqueId in update conditions
 * - Prevents cross-driver updates (cannot mark other drivers' notifications as seen)
 *
 * Authorization:
 * - Only authenticated drivers can mark notifications as seen
 * - Driver can only mark their own notifications as seen
 * - Ownership validated via userUniqueId comparison
 * - Additional safeguard: userUniqueId included in DriverRequest update conditions
 *
 * Validation:
 * - Validates driverRequestUniqueId is provided and valid UUID (Joi schema)
 * - Validates userUniqueId is available from authentication token (required)
 * - Validates driver request exists in database
 * - Validates driver owns the request (userUniqueId match)
 * - Validates current status is a negative status (7, 8, 10, 12, 14)
 * - Validates JourneyDecision exists (for JourneyDecisions updates)
 * - Validates JourneyDecision status matches DriverRequest status (for JourneyDecisions updates)
 *
 * Error Cases:
 * - "Missing required fields": driverRequestUniqueId or userUniqueId missing
 *   - Status: 400 Bad Request
 * - "Driver request not found": driverRequestUniqueId doesn't exist in database
 *   - Status: 400 Bad Request
 * - "Unauthorized: Driver request does not belong to this user": Driver doesn't own the request
 *   - Status: 400 Bad Request
 *   - Security check: Prevents unauthorized access
 * - "This request is not in a negative status that requires marking as seen": Status is not negative (1-6, 9, 11, 13)
 *   - Status: 400 Bad Request
 *   - Only negative statuses (7, 8, 10, 12, 14) can be marked as seen
 * - "Journey decision not found for this driver request": JourneyDecision missing for JourneyDecisions updates
 *   - Status: 400 Bad Request
 *   - Can occur if JourneyDecision was deleted or never created
 * - "Journey decision status does not match driver request status": Status mismatch detected
 *   - Status: 400 Bad Request
 *   - Data integrity check: Prevents inconsistent state
 *   - Indicates potential data corruption or race condition
 * - "Failed to update seen status": DriverRequest update failed (no rows affected)
 *   - Status: 400 Bad Request
 *   - Can occur if status changed between read and update (race condition)
 * - "Unable to mark negative status as seen": General processing error
 *   - Status: 500 Internal Server Error
 *   - Includes error details in development mode
 *
 * Use Cases:
 * 1. Driver views cancellation notification → Marks as seen → Badge count decreases
 * 2. Driver reviews rejection history → Marks multiple rejections as seen
 * 3. Driver app syncs seen status → Calls endpoint for all unseen notifications
 * 4. Driver wants to clear notification center → Marks all negative statuses as seen
 * 5. Driver wants to filter by seen status → Marks notifications as seen → Filtered out of "unseen" results
 *
 * Status Flow Examples:
 *
 * Example 1: Mark Cancellation as Seen
 * 1. Shipper cancels request → Status: cancelledByShipper (7)
 * 2. isCancellationByShipperSeenByDriver set to "not seen by driver yet"
 * 3. Driver receives notification → Badge shows "1 new cancellation"
 * 4. Driver views cancellation → Calls markNegativeStatusAsSeen
 * 5. System validates driver owns request and status is 7
 * 6. System updates DriverRequest.isCancellationByShipperSeenByDriver → "seen by driver"
 * 7. Response: "cancelled by shipper notification marked as seen"
 * 8. Badge count decreases → Notification no longer appears in "unseen" filter
 *
 * Example 2: Mark Not Selected as Seen
 * 1. Shipper selects different driver → Status: notSelectedInBid (14)
 * 2. JourneyDecisions.isNotSelectedSeenByDriver set to "not seen by driver yet"
 * 3. Driver receives notification → Badge shows "1 new notification"
 * 4. Driver views notification → Calls markNegativeStatusAsSeen
 * 5. System validates driver owns request and status is 14
 * 6. System fetches JourneyDecisions → Validates status matches
 * 7. System updates JourneyDecisions.isNotSelectedSeenByDriver → "seen by driver"
 * 8. Response: "not selected in bid notification marked as seen"
 * 9. Notification no longer appears in "unseen" filter
 *
 * Example 3: Mark Rejection as Seen
 * 1. Shipper rejects driver's offer → Status: rejectedByShipper (8)
 * 2. JourneyDecisions.isRejectionByShipperSeenByDriver set to "not seen by driver yet"
 * 3. Driver receives notification → Badge shows "1 new rejection"
 * 4. Driver views rejection → Calls markNegativeStatusAsSeen
 * 5. System validates driver owns request and status is 8
 * 6. System fetches JourneyDecisions → Validates status matches
 * 7. System updates JourneyDecisions.isRejectionByShipperSeenByDriver → "seen by driver"
 * 8. Response: "rejected by shipper notification marked as seen"
 *
 * Important Logic - Status Detection:
 * - Automatically detects current negative status from DriverRequest.journeyStatusId
 * - No need to specify which status to mark (simplifies API)
 * - Status must be one of the supported negative statuses (7, 8, 10, 12, 14)
 * - Validates status is negative before proceeding (prevents marking non-negative statuses)
 *
 * Important Logic - Table Selection:
 * - notSelectedInBid (14) and rejectedByShipper (8) → JourneyDecisions table
 *   - These statuses are stored at the JourneyDecision level (multiple drivers per shipper request)
 *   - Each driver has their own JourneyDecision record
 * - cancelledByShipper (7), cancelledByAdmin (10), cancelledBySystem (12) → DriverRequest table
 *   - These statuses are stored at the DriverRequest level (affects all drivers for that shipper request)
 *   - Single cancellation affects all drivers for that shipper request
 *
 * Important Logic - Status Validation:
 * - For JourneyDecisions updates: Validates JourneyDecision status matches DriverRequest status
 *   - Prevents inconsistent state where JourneyDecision and DriverRequest have different statuses
 *   - Line 2580: if (journeyDecision.journeyStatusId!== currentStatusId) → error
 * - For DriverRequest updates: No status re-validation in update conditions
 *   - Relies on initial status validation (line 2522)
 *   - Recommended improvement: Add journeyStatusId to update conditions for atomic status check
 *   - Current implementation is acceptable because:
 *     - Status validated at start
 *     - Update is idempotent (safe to mark as seen multiple times)
 *     - Negative statuses rarely change (they're terminal states)
 *
 * Important Logic - Ownership Validation:
 * - Validates driver owns the request twice:
 *   1. Initial check: requestData.userUniqueId!== userUniqueId (line 2504)
 *   2. DriverRequest update safeguard: userUniqueId included in update conditions (line 2611)
 * - Prevents unauthorized access to other drivers' notifications
 * - For JourneyDecisions: updateJourneyDecision performs additional ownership validation
 *
 * Important Notes:
 * - This is a unified endpoint for all negative status types (simplifies API)
 * - Single table updates (no transactions needed)
 * - Idempotent operation (marking as seen multiple times has same effect)
 * - Read-then-update pattern (potential race condition mitigated by validation)
 * - Different negative statuses update different tables/fields (JourneyDecisions vs DriverRequest)
 * - Status detection is automatic (no need to specify which status)
 * - Ownership validation performed multiple times (security layers)
 *
 * Performance Notes:
 * - Single database read (DriverRequest) + optional read (JourneyDecisions)
 * - Single database write (either JourneyDecisions OR DriverRequest)
 * - Minimal query overhead (indexed lookups by driverRequestUniqueId and driverRequestId)
 * - No complex JOINs or aggregations
 * - Fast response time (typically < 100ms)
 * - Consider caching seen status if frequently accessed
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/getCancellationNotifications: This endpoint UPDATES seen status, doesn't just read
 * - Unlike /api/driver/markCancellationAsSeen (if exists): This endpoint handles ALL negative statuses, not just cancellations
 * - Unlike /api/driver/verifyDriverJourneyStatus: This endpoint marks notifications as seen, doesn't verify current status
 * - This endpoint is specifically for updating seen status
 * - Other endpoints handle different aspects (reading, verifying, etc.)
 *
 * Potential Issues & Improvements:
 * 1. ⚠️ Race Condition (Low Risk): Status could change between read and update
 *    - Current mitigation: Initial validation + idempotent operation
 *    - Recommended: Add journeyStatusId to DriverRequest update conditions for atomic status check
 *    - Impact: Low (negative statuses rarely change, update is idempotent)
 *
 * 2. ⚠️ Status Validation Gap: DriverRequest updates don't re-validate status in conditions
 *    - Current: Relies on initial validation (line 2522)
 *    - Recommended: Add journeyStatusId to update conditions (e.g., journeyStatusId IN (7, 10, 12))
 *    - Impact: Low (initial validation + idempotent operation mitigate risk)
 *
 * 3. ⚠️ updateJourneyDecision Validation: Only validates notSelectedInBid, not rejectedByShipper
 *    - Current: updateJourneyDecision validates isNotSelectedSeenByDriver → checks notSelectedInBid status
 *    - Current: updateJourneyDecision doesn't validate isRejectionByShipperSeenByDriver
 *    - Mitigation: Status validation performed before calling updateJourneyDecision (line 2580)
 *    - Impact: Low (status validation in calling function is sufficient)
 *
 * Transaction Coverage:
 * - ⚠️ Single Table Updates: No transactions needed
 *   - Each update path updates only ONE table (either JourneyDecisions OR DriverRequest)
 *   - Single table UPDATE operations are atomic by default in MySQL
 *   - No related tables being updated simultaneously
 *   - No data consistency concerns (only updating a single "seen" flag)
 *   - Transaction overhead is unnecessary and would degrade performance
 *   - Recommended: Add journeyStatusId to DriverRequest update conditions for atomic status check (alternative to transaction)
 */
router.put(
  DRIVER_REQUEST_ENDPOINTS.MARK_NEGATIVE_STATUS_AS_SEEN,
  verifyTokenOfAxios,
  verifyDriversIdentity,
  validator(markNegativeStatusAsSeenSchema), // Validates driverRequestUniqueId (UUID format, required)
  markNegativeStatusAsSeenController,
);

module.exports = router;
