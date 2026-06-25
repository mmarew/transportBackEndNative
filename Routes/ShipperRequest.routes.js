// routes/Shipper.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../Controllers/ShipperRequest.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyShippersIdentity,
  verifyCancelShipperRequestAuthorization,
} = require("../Middleware/VerifyUsersIdentity");

// Create Shipper Request
const { validator } = require("../Middleware/Validator");
const {
  createShipperRequest,
  requestParams,
  cancelRequestParams,
  cancelShipperRequestBody,
  getCancellationNotificationsQuery,
  markCancellationAsSeen,
  markJourneyCompletionAsSeen,
  verifyShipperStatusQuery,
  getShipperRequestQuery,
  acceptDriverRequestBody,
  rejectDriverOfferBody,
  getAllActiveRequestsQuery,
} = require("../Validations/ShipperRequest.schema");
const { SHIPPER_REQUEST_ENDPOINTS } = require("./EndPoints/shipperRequest.endpoints");

/**
 * Shipper Create Request Endpoint
 *
 * Purpose: Creates a new journey/shipping request for a shipper/shipper. This endpoint enables
 * shippers to request transportation services for their goods, allowing drivers to find and
 * bid on available journeys. The endpoint supports batch requests (multiple   Vehicle for one batch)
 * and prevents duplicate requests using shipperRequestBatchId grouping.
 *
 * Context & Use Case:
 * - Shipper/shipper wants to transport goods from origin to destination
 * - Shipper may need multiple   Vehicle for a single batch of requests (e.g., large shipment)
 * - Request is grouped by shipperRequestBatchId to prevent duplicate creation
 * - After creation, request is available for drivers to find and bid on
 * - System automatically finds nearby drivers and sends notifications
 * - Admin can create requests on behalf of shippers (requires phone number)
 * - Driver can create request when picking up goods from street (takes from street scenario)
 *
 * When to Use:
 * - Shipper wants to request transportation for goods
 * - Shipper needs multiple   Vehicle (numberOfVehicles > 1)
 * - Admin wants to create request for shipper (requires shipperPhoneNumber)
 * - Driver picks up goods from street and needs to create request (driver "take from street" scenario)
 * - Request is for shipping cargo/goods (not shipper transport)
 *
 * How it works:
 * 1. Validates required fields (shipperRequestBatchId, destination, vehicle, originLocation, etc.)
 * 2. Extracts userUniqueId from authentication token (for shippers) or creates user (for admin)
 * 3. If admin: Creates shipper user account within same transaction as request creation (atomic)
 * 4. Wraps admin user creation (if needed) + batch check + request creation in transaction (atomic operation)
 * 5. Checks existing requests by shipperRequestBatchId + userUniqueId
 * 6. Validates not all requests already created (existingRequestsCount < numberOfVehicles)
 * 7. Creates remaining requests sequentially (numberOfVehicles - existingRequestsCount)
 * 8. Each request is created with journeyStatusId = waiting (1)
 * 9. Returns all newly created requests with success message
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ createShipperRequest (Entry Point)                         │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Validate Required Fields
 *                  │   └─→ shipperRequestBatchId, destination, vehicle, originLocation, etc.
 *                  │
 *                  ├─→ Step 2: Extract User Info from Token
 *                  │   ├─→ If roleId ===1 (shipper): userUniqueId from token
 *                  │   └─→ shipperRequestCreatedBy and shipperRequestCreatedByRoleId from token
 *                  │
 *                  ├─→ Step 3: Handle Admin User Creation (if admin) - INSIDE TRANSACTION
 *                  │   ├─→ ✅ [SAME TRANSACTION] createUser (uses provided connection)
 *                  │   │   └─→ Creates shipper user with phone number (atomic with request creation)
 *                  │   │       └─→ Returns existing user if phone already exists
 *                  │   └─→ Sets userUniqueId to newly created/existing user
 *                  │
 *                  ├─→ Step 4: Wrap in Transaction (batch check + request creation)
 *                  │   └─→ [TRANSACTION START]
 *                  │       ├─→ Step 4a: Batch Check (within transaction)
 *                  │       │   └─→ SELECT * FROM ShipperRequest
 *                  │       │       WHERE shipperRequestBatchId = ? AND userUniqueId = ?
 *                  │       │   └─→ Gets existing requests count for this batch
 *                  │       │
 *                  │       ├─→ Step 4b: Validate Batch Limit
 *                  │       │   └─→ If existingRequestsCount >= numberOfVehicles: Return error
 *                  │       │
 *                  │       ├─→ Step 4c: Calculate Remaining Requests
 *                  │       │   └─→ noOfRecords = numberOfVehicles - existingRequestsCount
 *                  │       │
 *                  │       └─→ Step 4d: Create Remaining Requests (within transaction)
 *                  │           └─→ For each remaining request (loop):
 *                  │               ├─→ Validate vehicle type exists
 *                  │               ├─→ [TRANSACTION] INSERT INTO ShipperRequest
 *                  │               │   ├─→ shipperRequestUniqueId (UUID)
 *                  │               │   ├─→ userUniqueId
 *                  │               │   ├─→ vehicleTypeUniqueId
 *                  │               │   ├─→ originLatitude, originLongitude, originPlace
 *                  │               │   ├─→ destinationLatitude, destinationLongitude, destinationPlace
 *                  │               │   ├─→ journeyStatusId = waiting (1)
 *                  │               │   ├─→ shippableItemName, shippableItemQtyInQuintal
 *                  │               │   ├─→ shippingDate, deliveryDate, shippingCost
 *                  │               │   └─→ shipperRequestBatchId (groups related requests)
 *                  │               └─→ Collect new request data
 *                  │
 *                  └─→ [TRANSACTION COMMIT] or [TRANSACTION ROLLBACK] on error
 *                      └─→ Response: Success with all newly created requests
 *
 * Database Operations:
 * 1. ✅ WRITE (Admin only - SAME TRANSACTION): Creates shipper user account
 *    - If shipperRequestCreatedByRoleId ===adminRoleId: Creates Users record
 *    - ✅ FIXED: Uses createUser function with connection parameter (same transaction)
 *    - Creates Users record with:
 *      - userUniqueId (UUID)
 *      - phoneNumber (from shipperPhoneNumber)
 *      - email (fake email with random number)
 *      - roleId = shipperRoleId (1)
 *      - statusId = ACTIVE (1)
 *      - fullName = null
 *    - Also creates usersCredential record (within same transaction)
 *    - ✅ FIXED: Uses same connection/transaction as request creation (full transaction support)
 *    - If user already exists (same phone), returns existing user
 *
 * 2. ✅ READ (within transaction): Checks existing requests by batchId
 *    - Uses connection query if provided (transaction support)
 *    - SELECT * FROM ShipperRequest WHERE shipperRequestBatchId = ? AND userUniqueId = ?
 *    - Counts existing requests for this batch
 *    - Used to prevent exceeding numberOfVehicles limit
 *
 * 3. ✅ READ (outside transaction, before request creation): Validates vehicle type
 *    - For each request creation: SELECT * FROM VehicleTypes WHERE vehicleTypeUniqueId = ?
 *    - Validates vehicle type exists before creating request
 *    - Returns error if vehicle type not found
 *
 * 4. ✅ WRITE (within transaction): Creates ShipperRequest records
 *    - For each remaining request: INSERT INTO ShipperRequest
 *    - Creates records sequentially (loop: 0 to noOfRecords)
 *    - Each record includes:
 *      - shipperRequestUniqueId (UUID, auto-generated)
 *      - userUniqueId (from token or newly created admin user)
 *      - vehicleTypeUniqueId (from request body)
 *      - originLatitude, originLongitude, originPlace (from originLocation)
 *      - destinationLatitude, destinationLongitude, destinationPlace (from destination.description || null)
 *      - journeyStatusId = waiting (1) - initial status
 *      - shippableItemName, shippableItemQtyInQuintal
 *      - shippingDate, deliveryDate, shippingCost
 *      - shipperRequestBatchId (groups related requests)
 *      - shipperRequestCreatedBy, shipperRequestCreatedByRoleId (audit fields)
 *      - shipperRequestCreatedAt (current timestamp)
 *    - All inserts use same connection (within transaction)
 *    - All succeed or all fail (atomic)
 *
 * Transaction Coverage:
 * - ✅ Admin user creation: Fully wrapped in transaction (FIXED)
 *   - createUser function now accepts connection parameter for transaction support
 *   - Admin user creation happens INSIDE the same transaction as request creation
 *   - All operations (user creation, batch check, request creation) are atomic
 *   - ✅ FIXED: No more orphaned users - if request creation fails, user creation is rolled back
 *   - ✅ FIXED: Full transaction support - all succeed or all fail
 *   - Impact: High (prevents data inconsistency - was a critical issue)
 *
 * - ✅ Batch check + request creation: Fully wrapped in transaction
 *   - Batch check (SELECT) uses transaction connection
 *   - All request creations (INSERT) use transaction connection
 *   - All operations atomic (30 second timeout - includes admin user creation if needed)
 *   - Either all requests created or none created (prevents partial creation)
 *   - Automatic rollback on any failure
 *   - Prevents race condition where multiple concurrent requests create more than numberOfVehicles
 *
 * - ✅ Vehicle type validation: Inside transaction (read-only, but uses transaction connection)
 *   - Happens within request creation (before each insert)
 *   - Uses transaction connection for consistent snapshot
 *   - If validation fails, transaction is rolled back (atomic)
 *   - Prevents race condition: Vehicle type deleted between validation and insert
 *
 * Race Condition Prevention:
 * - ✅ Batch check and request creation are atomic (same transaction)
 *   - Prevents time-of-check-time-of-use (TOCTOU) race condition
 *   - Multiple concurrent requests with same batchId are serialized by transaction
 *   - First request to acquire lock passes batch check and creates requests
 *   - Subsequent requests see updated count and are rejected or create remaining requests
 *   - Database isolation level ensures consistent snapshot during transaction
 *
 * Request Body:
 * - shipperRequestBatchId: Unique ID for batch grouping (required, UUID format)
 *   - Groups related requests (e.g., same shipment needing multiple vehicles)
 *   - Prevents duplicate requests by checking existing requests with same batchId
 * - numberOfVehicles: Number of   Vehicle needed for this batch (optional, default: 1, min: 1)
 *   - Used to determine how many requests to create
 *   - If existingRequestsCount >= numberOfVehicles, returns error
 * - originLocation: Origin location object (required)
 *   - latitude: Origin latitude (required, number between -90 and 90)
 *   - longitude: Origin longitude (required, number between -180 and 180)
 *   - description: Origin place name/address (required, string)
 * - destination: Destination location object (required)
 *   - latitude: Destination latitude (optional, number between -90 and 90, can be null)
 *   - longitude: Destination longitude (optional, number between -180 and 180, can be null)
 *   - description: Destination place name/address (optional, string, can be null)
 *   - Note: destinationPlace is extracted from destination.description || null
 * - vehicle: Vehicle type object (required)
 *   - vehicleTypeUniqueId: Vehicle type unique ID (required, UUID format)
 *   - Validated against VehicleTypes table before request creation
 * - shippingDate: Date when goods should be shipped (required, ISO date format)
 * - deliveryDate: Expected delivery date (required, ISO date format)
 * - shippingCost: Estimated shipping cost (required, number)
 * - shippableItemQtyInQuintal: Quantity of goods in quintals (required, number)
 * - shippableItemName: Name/description of goods being shipped (required, string)
 * - shipperPhoneNumber: Shipper's phone number (optional, required only when admin creates on behalf)
 *   - Used to create user account when admin creates request
 *   - Must be provided if shipperRequestCreatedByRoleId ===adminRoleId
 * - requestType: Type of request (optional, "PASSENGER" | "CARGO")
 *   - Currently not enforced in database, kept for future use
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a shipper role (roleId ===1) or admin role
 *   - userUniqueId extracted from token automatically (for shippers)
 *   - roleId extracted from token for authorization
 *
 * Response (Success - Shipper Creates Request):
 * - message: "success"
 * - newRequests: [
 *     {
 *       shipperRequestId: number (auto-increment ID),
 *       shipperRequestUniqueId: string (UUID),
 *       userUniqueId: string (UUID),
 *       vehicleTypeUniqueId: string (UUID),
 *       originLatitude: number,
 *       originLongitude: number,
 *       originPlace: string,
 *       destinationLatitude: number | null,
 *       destinationLongitude: number | null,
 *       destinationPlace: string | null,
 *       journeyStatusId: number (1 - waiting),
 *       shippableItemName: string,
 *       shippableItemQtyInQuintal: number,
 *       shippingDate: date,
 *       deliveryDate: date,
 *       shippingCost: number,
 *       shipperRequestBatchId: string (UUID),
 *       shipperRequestCreatedBy: string (UUID),
 *       shipperRequestCreatedByRoleId: number,
 *       shipperRequestCreatedAt: datetime
 *     },
 *     ... (more requests if numberOfVehicles > 1)
 *   ]
 *
 * Response (Success - Driver Creates Request - internal use):
 * - Returns array of request objects directly (no wrapper)
 *   - Used when driver creates request internally (e.g., takeFromStreet)
 *
 * Response (Error):
 * - message: "error"
 * - error: "Missing required fields to create shipper request" (if validation fails in controller)
 * - error: "Batch uniqueId Can't be null" (if shipperRequestBatchId missing)
 * - error: "shipperPhoneNumber is required when admin creates request for shipper" (if admin but no phone)
 * - error: "Failed to create user for shipper" (if user creation fails for admin)
 * - error: "Failed to get userUniqueId from created user" (if user creation returns invalid data)
 * - error: "userUniqueId is required" (if userUniqueId not available after admin user creation)
 * - error: "All required requests have already been created for this batch." (if existingRequestsCount >= numberOfVehicles)
 *   - existingRequestsCount: number (current count of requests for this batch)
 *   - requestedVehicles: number (number of   Vehicle requested)
 *   - shipperRequestBatchId: string (UUID of the batch)
 * - error: "Invalid vehicle type" (if vehicleTypeUniqueId not found in VehicleTypes table)
 * - error: "Vehicle type not found" (if vehicleTypeUniqueId validation fails)
 * - error: "Unable to create request" (general processing error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Validates user has shipper role (roleId ===1) or admin role
 * - For shippers: userUniqueId extracted from token (cannot be spoofed)
 * - For admin: Creates shipper user account within same transaction as request creation (atomic)
 * - Only allows shippers to create requests for themselves (or admin for others)
 *
 * Authorization:
 * - Shippers (roleId ===1) can create requests for themselves
 * - Admin can create requests on behalf of shippers (requires shipperPhoneNumber)
 * - Admin must provide shipperPhoneNumber to create user account
 * - Driver role (roleId ===2) can create requests internally (special use case - takeFromStreet)
 *
 * Validation:
 * - Validates required fields in controller (before service call):
 *   - shipperRequestBatchId, destination, vehicle, originLocation, numberOfVehicles,
 *     shippingDate, shippingCost, shippableItemQtyInQuintal, shippableItemName, deliveryDate
 * - Validates request body format via Joi schema (createShipperRequest)
 *   - shipperRequestBatchId: UUID format, required
 *   - numberOfVehicles: integer, min: 1, default: 1
 *   - shippingDate, deliveryDate: ISO date format, required
 *   - shippingCost: number, required
 *   - shippableItemQtyInQuintal: number, required
 *   - shippableItemName: string, required
 *   - originLocation: object with latitude, longitude, description (all required)
 *   - destination: object with latitude, longitude, description (latitude/longitude optional, description optional)
 *   - vehicle: object with vehicleTypeUniqueId (UUID, required)
 *   - shipperPhoneNumber: string, optional (required only for admin)
 *   - requestType: "PASSENGER" | "CARGO", optional
 * - Validates shipperRequestBatchId is not null (service level)
 * - Validates userUniqueId is available (after admin user creation if applicable)
 * - Validates vehicle type exists in VehicleTypes table (for each request creation)
 * - Validates existing requests count < numberOfVehicles (batch limit check)
 *
 * Error Cases:
 * - "Missing required fields to create shipper request": Controller validation failed
 *   - Status: 400 Bad Request
 *   - Cause: One or more required fields missing from request body
 * - "Batch uniqueId Can't be null": shipperRequestBatchId missing
 *   - Status: 400 Bad Request
 *   - Cause: shipperRequestBatchId not provided or null
 * - "shipperPhoneNumber is required when admin creates request for shipper": Admin creating but no phone
 *   - Status: 400 Bad Request
 *   - Cause: Admin role but shipperPhoneNumber not provided
 * - "Failed to create user for shipper": User creation failed for admin
 *   - Status: 500 Internal Server Error
 *   - Cause: createUser returned error (phone already exists with different user, database error, etc.)
 * - "Failed to get userUniqueId from created user": User creation succeeded but no userUniqueId returned
 *   - Status: 500 Internal Server Error
 *   - Cause: createUser returned success but dataOfShipper.userUniqueId is missing
 * - "All required requests have already been created for this batch": Batch limit exceeded
 *   - Status: 409 Conflict (should be, but currently returns error message)
 *   - Cause: Existing requests count >= numberOfVehicles
 *   - Includes: existingRequestsCount, requestedVehicles, shipperRequestBatchId for debugging
 * - "Invalid vehicle type" or "Vehicle type not found": VehicleTypeUniqueId doesn't exist
 *   - Status: 500 Internal Server Error
 *   - Cause: VehicleTypeUniqueId not found in VehicleTypes table
 * - "Unable to create request": General processing error
 *   - Status: 500 Internal Server Error
 *   - Cause: Database error, network error, or other system error
 *
 * Use Cases:
 * 1. Shipper creates single request: numberOfVehicles = 1 → Creates 1 request → Returns 1 request
 * 2. Shipper creates batch request: numberOfVehicles = 3 → Creates 3 requests → Returns 3 requests
 * 3. Shipper creates partial batch: Existing 1 request, numberOfVehicles = 3 → Creates 2 more → Returns 2 requests
 * 4. Shipper attempts duplicate: numberOfVehicles = 2, existing = 2 → Returns error "already created"
 * 5. Admin creates for shipper: Admin provides phone → Creates user → Creates request → Returns request
 * 6. Driver takes from street: Driver picks up goods → Creates shipper user → Creates request (status = journeyStarted) → Returns array → Creates journey
 *
 * Audit Trail - Who Created the Request:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of creator (1=shipper, 2=driver, 3=admin)
 * - These fields are stored in ShipperRequest table for tracking and reporting
 * - Service uses shipperRequestCreatedByRoleId to determine return behavior:
 *   - Role 1 (Shipper) or 3 (Admin): Returns verifyShipperStatus result (status counts)
 *   - Role 2 (Driver): Returns array of requests directly (no status counts needed)
 *
 * Status Flow:
 * 1. Request created → journeyStatusId: waiting (1)
 * 2. System finds nearby drivers → Status: requested (2)
 * 3. Driver accepts → Status: acceptedByDriver (3)
 * 4. Shipper accepts driver → Status: acceptedByShipper (4)
 * 5. Driver starts journey → Status: journeyStarted (5)
 * 6. Driver completes journey → Status: journeyCompleted (6)
 *
 * Important Logic - Batch Grouping:
 * - All requests with same shipperRequestBatchId are treated as related (same shipment)
 * - Prevents creating more requests than numberOfVehicles for a batch
 * - Useful when shipper needs multiple   Vehicle for large shipment
 * - Each request in batch has unique shipperRequestUniqueId but same shipperRequestBatchId
 * - Batch check counts existing requests: WHERE shipperRequestBatchId = ? AND userUniqueId = ?
 * - If existingRequestsCount >= numberOfVehicles: All requests already created, return error
 * - Otherwise: Create remaining requests (numberOfVehicles - existingRequestsCount)
 *
 * Important Logic - Admin User Creation:
 * - Admin can create requests on behalf of shippers who don't have accounts
 * - Creates shipper user account using shipperPhoneNumber
 * - ✅ FIXED: User creation now uses same transaction as request creation (full transaction support)
 * - If user already exists (same phone), returns existing user (no duplicate)
 * - Generated email: fakeEmail_{randomNumber}@shipper.com
 * - Generated userRoleStatusDescription: "this is shipper "
 * - ✅ FIXED: User creation wrapped in same transaction as request creation
 * - ✅ FIXED: If request creation fails, user creation is rolled back (no orphaned users)
 * - ✅ FIXED: All operations atomic - all succeed or all fail together
 *
 * Important Logic - Driver "Take From Street" Scenario:
 * - Driver picks up goods from street while moving (not pre-booked)
 * - ✅ FIXED: Creates shipper user account INSIDE transaction (in DriverRequest.service.js)
 * - ✅ FIXED: User creation uses same transaction as request creation (full transaction support)
 * - Sets audit fields: shipperRequestCreatedBy = driver.userUniqueId, shipperRequestCreatedByRoleId = driver.roleId (2)
 * - Sets journeyStatusId = journeyStarted (5) - driver already picked up goods, not waiting
 * - Returns array of created requests directly (not wrapped in verifyShipperStatus)
 * - Used immediately to create journey decision and journey record
 * - Audit trail stored in database to track that driver created this request
 * - Note: This is handled in DriverRequest.service.js
 * - ✅ FIXED: All operations atomic - user creation + shipper request + driver request + journey decision + journey + route points
 * - ✅ FIXED: No more orphaned users - if any operation fails, all are rolled back
 *
 * Important Logic - Sequential Creation:
 * - Requests are created sequentially in a loop (not in parallel)
 * - Reason: Each creation depends on previous one (order matters for batch)
 * - Loop: for (let i = 0; i < noOfRecords; i++)
 * - Each iteration: Creates one ShipperRequest record
 * - All creations use same connection (within transaction)
 * - If any creation fails, all are rolled back (atomic)
 * - Alternative: Could use Promise.all for parallel creation, but sequential is safer for batch ordering
 *
 * Important Logic - Vehicle Type Validation:
 * - Vehicle type is validated for EACH request creation (in loop)
 * - Validation happens BEFORE insert (efficient - fails early)
 * - Uses getData to check VehicleTypes table
 * - Returns error if vehicleTypeUniqueId not found
 * - Note: Could be optimized to validate once before loop (minor optimization)
 *
 * Important Logic - Transaction Scope:
 * - ✅ Admin user creation: INSIDE transaction (FIXED - full transaction support)
 *   - Happens within same transaction as request creation
 *   - Uses transaction connection for atomicity
 *   - ✅ FIXED: If request creation fails, user creation is rolled back (no orphaned users)
 * - Batch check: INSIDE transaction
 *   - Uses transaction connection for consistent snapshot
 *   - Prevents race conditions with concurrent requests
 * - ✅ Vehicle type validation: INSIDE transaction (FIXED - uses transaction connection)
 *   - Happens within request creation (before each insert)
 *   - Uses transaction connection for consistent snapshot
 *   - ✅ FIXED: Prevents race condition - vehicle type deleted between validation and insert
 *   - If validation fails, transaction is rolled back (atomic)
 * - Request creation: INSIDE transaction
 *   - All inserts use transaction connection
 *   - All succeed or all fail (atomic)
 *
 * Important Notes:
 * - This endpoint supports batch requests (multiple   Vehicle for one shipment)
 * - Batch grouping prevents duplicate requests using shipperRequestBatchId
 * - Admin can create requests on behalf of shippers (requires phone number)
 * - ✅ FIXED: Admin user creation now uses same transaction as request creation (full transaction support)
 * - Admin user creation + batch check + request creation are all atomic (wrapped in transaction)
 * - Race condition prevented by transaction isolation
 * - Sequential creation ensures batch ordering
 * - Vehicle type validation happens before request creation
 *
 * Performance Notes:
 * - Admin user creation adds one database transaction (if admin)
 * - Batch check uses indexed query (shipperRequestBatchId + userUniqueId)
 * - Vehicle type validation happens before loop (efficient - fails early)
 * - Request creation is sequential (could be parallelized, but safer sequential)
 * - Transaction timeout: 20 seconds (enough for multiple request creations)
 * - Consider adding composite index: (shipperRequestBatchId, userUniqueId) for faster batch checks
 * - Consider caching vehicle type validation (validate once, reuse result)
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/request: This endpoint creates shipper requests, not driver requests
 * - Unlike /api/shipper/acceptDriverRequest: This endpoint creates new requests, doesn't accept drivers
 * - Unlike /api/shipper/cancelShipperRequest: This endpoint creates requests, doesn't cancel them
 * - This endpoint is specifically for request creation (batch support)
 * - Other endpoints handle request actions (accept, cancel, verify status)
 *
 * Transaction Coverage:
 * - ✅ Admin user creation: Fully wrapped in transaction (FIXED)
 *   - createUser function now accepts connection parameter for transaction support
 *   - Admin user creation happens INSIDE the same transaction as request creation
 *   - All operations (user creation, batch check, request creation) are atomic
 *   - ✅ FIXED: No more orphaned users - if request creation fails, user creation is rolled back
 *   - ✅ FIXED: Full transaction support - all succeed or all fail together
 *   - Impact: High (prevents data inconsistency - was a critical issue)
 *
 * - ✅ Batch check + request creation: Fully wrapped in transaction
 *   - Batch check (SELECT) uses transaction connection (consistent snapshot)
 *   - All request creations (INSERT) use transaction connection
 *   - All operations atomic (30 second timeout - includes admin user creation if needed)
 *   - Either all requests created or none created (prevents partial creation)
 *   - Automatic rollback on any failure
 *   - Prevents race condition: Multiple concurrent requests are serialized
 *   - Database isolation ensures consistent snapshot during transaction
 *
 * - ✅ Vehicle type validation: INSIDE transaction (FIXED - uses transaction connection)
 *   - Happens within request creation (before each insert)
 *   - Uses transaction connection for consistent snapshot
 *   - ✅ FIXED: Prevents race condition - vehicle type deleted between validation and insert
 *   - If validation fails, transaction is rolled back (atomic)
 *
 * Race Condition Prevention:
 * - ✅ Batch check and request creation are atomic (same transaction)
 *   - Multiple concurrent requests with same batchId are serialized
 *   - First request acquires lock, passes batch check, creates requests
 *   - Subsequent requests see updated count (due to transaction isolation)
 *   - Prevents exceeding numberOfVehicles limit even with concurrent requests
 *   - Database isolation level ensures consistent snapshot during transaction
 *
 * Known Limitations & Logical Issues:
 * 1. ✅ FIXED: Admin user creation now uses same transaction (createUser now accepts connection parameter)
 *    - ✅ FIXED: User creation and request creation are atomic (all succeed or all fail)
 *    - ✅ FIXED: No more orphaned users - if request creation fails, user creation is rolled back
 *    - Impact: High (was a critical issue - now resolved)
 *    - Status: Fixed - full transaction support implemented
 *
 * 2. ✅ FIXED: Vehicle type validation now happens inside transaction
 *    - ✅ FIXED: Validation uses transaction connection for consistent snapshot
 *    - ✅ FIXED: Prevents race condition - if vehicle type is deleted, validation sees consistent state
 *    - ✅ FIXED: If validation fails, transaction is rolled back (atomic)
 *    - Impact: Low (was a minor issue - now resolved)
 *    - Status: Fixed - vehicle type validation now uses transaction connection
 *
 * 3. ✅ Batch check uses transaction connection (race condition prevented)
 *    - Status: Fixed - batch check uses connection for consistent snapshot
 *    - Prevents time-of-check-time-of-use (TOCTOU) race condition
 *
 * 4. ✅ Sequential creation ensures batch ordering
 *    - Status: Correct - sequential creation is safer than parallel for batch ordering
 *    - Could be optimized to parallel creation with proper error handling
 *
 * Potential Improvements:
 * 1. ✅ COMPLETED: Modified createUser to accept connection parameter for full transaction support
 *    - ✅ Admin user creation is now part of request creation transaction
 *    - ✅ Eliminated orphaned user edge case (all operations atomic)
 *    - ✅ createUser function now supports connection parameter
 *
 * 2. Move vehicle type validation inside transaction
 *    - Would ensure vehicle type exists at time of insert
 *    - Prevents edge case where validation passes but type deleted before insert
 *    - Minor performance impact (validation inside transaction)
 *
 * 3. Optimize sequential creation to parallel creation
 *    - Could use Promise.all for parallel creation
 *    - Would improve performance for multiple requests
 *    - Requires proper error handling for partial failures
 *    - Current sequential approach is safer
 *
 * 4. Add composite index on (shipperRequestBatchId, userUniqueId)
 *    - Would improve batch check query performance
 *    - Recommended for high-frequency batch checks
 *
 * 5. Cache vehicle type validation
 *    - Validate once before loop, reuse result
 *    - Would eliminate redundant database queries
 *    - Minor optimization for multiple request creation
 */
router.post(
  SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
  verifyTokenOfAxios,
  validator(createShipperRequest), // Validates request body: shipperRequestBatchId, destination, vehicle, originLocation, numberOfVehicles, shippingDate, deliveryDate, shippingCost, shippableItemQtyInQuintal, shippableItemName, shipperPhoneNumber (optional), requestType (optional)
  controller.createShipperRequest,
);
/**
 * Get Shipper Request Data Endpoint
 *
 * Purpose: Provides data to the frontend to display journey request details.
 *
 * Usage Examples:
 * - Get recent completed journeys: ?journeyStatusId=6&limit=7&page=1
 * - Get all requests: ?target=all&limit=10&page=1
 * - Get single request: ?shipperRequestUniqueId=xxx
 * - Filter by status: ?journeyStatusId=1,2,3
 *
 * Query Parameters:
 * - target: "all" | "single" (optional)
 * - journeyStatusId: single ID or comma-separated IDs (optional)
 * - limit: number of results (optional)
 * - page: page number (optional)
 * - shipperRequestUniqueId: filter by unique ID (optional)
 * - shipperUserUniqueId: filter by user ID, use "self" for current user (optional)
 * - Other filters: vehicleTypeUniqueId, shipperRequestBatchId, etc.
 */
router.get(
  SHIPPER_REQUEST_ENDPOINTS.GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER,
  verifyTokenOfAxios,
  validator(getShipperRequestQuery, "query"),
  controller.getShipperRequest4allOrSingleUser,
);
/**
 * Accept Driver Request Endpoint
 *
 * Purpose: Allows a shipper to accept a driver's offer/request for a journey based on bid principles.
 *
 * How it works:
 * - Shipper selects one driver from multiple driver offers
 * - Updates the selected driver's status to "accepted by shipper"
 * - Updates all other drivers' status to "not selected in bid"
 * - Sends notifications to all affected drivers (accepted/rejected)
 * - Returns updated shipper status with unique IDs and status counts
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request to accept
 * - journeyDecisionUniqueId: Unique ID of the journey decision
 * - shipperRequestUniqueId: Unique ID of the shipper request
 *
 * Response:
 * - Returns success with status, unique IDs, and updated totalRecords (status counts)
 * - Frontend can use this to update UI without additional API calls
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_REQUEST,
  verifyTokenOfAxios,
  validator(acceptDriverRequestBody),
  controller.acceptDriverRequest,
);

/**
 * Reject Driver Offer Endpoint
 *
 * Purpose: Allows a shipper to reject a driver's offer/request.
 *
 * How it works:
 * - Shipper rejects a specific driver's offer
 * - Updates driver request status to "rejected by shipper"
 * - Updates journey decision status accordingly
 * - If this was the only active request (accepted by driver), shipper request status returns to "waiting"
 * - Sends notification to the rejected driver
 * - Updates are executed in parallel for better performance
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request to reject (required)
 * - journeyDecisionUniqueId: Unique ID of the journey decision (required)
 * - shipperRequestUniqueId: Unique ID of the shipper request (required)
 * - shipperRequestId: Integer ID of the shipper request (required)
 * - journeyStatusId: Current journey status ID (required)
 *
 * Response:
 * - Returns success message: "Driver offer rejected successfully"
 * - Returns error with details if validation or update fails
 * - Frontend should call verifyShipperStatus to get updated counts
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.REJECT_DRIVER_OFFER,
  verifyTokenOfAxios,
  validator(rejectDriverOfferBody),
  controller.rejectDriverOffer,
);

/**
 * Update Shipper Request Endpoint
 *
 * Purpose: Updates an existing shipper request by its ID.
 *
 * How it works:
 * - Updates shipper request fields in the ShipperRequest table
 * - Uses shipperRequestId (integer) to identify the request
 * - Validates that the request exists (returns error if not found)
 * - Returns success message on successful update
 *
 * URL Parameters:
 * - id: shipperRequestId (integer) - Note: Despite route name, this uses integer ID, not UUID
 *
 * Request Body:
 * - Any fields from ShipperRequest table that need to be updated
 * - Common fields: originLocation, destination, shippingDate, deliveryDate,
 *   shippingCost, shippableItemName, shippableItemQtyInQuintal, etc.
 *
 * Response:
 * - Returns success message: "Request updated successfully"
 * - Returns error if request not found or no changes made
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.GET_BY_ID_PUBLIC,
  verifyTokenOfAxios,
  validator(requestParams, "params"),
  controller.updateRequestById,
);

/**
 * Delete Shipper Request Endpoint
 *
 * Purpose: Deletes a shipper request by its ID.
 *
 * How it works:
 * - Permanently deletes the shipper request from ShipperRequest table
 * - Uses shipperRequestId (integer) to identify the request
 * - Validates that the request exists (returns error if not found)
 * - Note: This is a hard delete - related records may need separate handling
 *
 * URL Parameters:
 * - id: shipperRequestId (integer) - Note: Despite route name, this uses integer ID, not UUID
 *
 * Response:
 * - Returns success message: "Request deleted successfully"
 * - Returns error if request not found
 * - Frontend should refresh request list after deletion
 */
router.delete(
  SHIPPER_REQUEST_ENDPOINTS.GET_BY_ID_PRIVATE,
  verifyTokenOfAxios,
  validator(requestParams, "params"),
  controller.deleteRequest,
);

/**
 * Cancel Shipper Request Endpoint
 *
 * Purpose: Cancels an active shipper request (by shipper or admin).
 *
 * How it works:
 * - Updates shipper request status to "cancelled by shipper" or "cancelled by admin"
 * - Updates all related driver requests and journey decisions to cancelled status
 * - Updates journey status if journey was started
 * - Sends notifications to all affected drivers
 * - Creates cancellation record in CanceledJourneys table
 * - Returns updated status counts for frontend
 *
 * URL Parameters:
 * - userUniqueId: User unique ID or "self" for current user
 *
 * Request Body:
 * - shipperRequestUniqueId: Unique ID of the request to cancel
 * - cancellationReasonsTypeId: Reason for cancellation (optional)
 *
 * Authorization:
 * - Shipper can only cancel their own requests
 * - Admin/Super Admin can cancel any request
 *
 * Response:
 * - Returns success with cancellation status, unique IDs, and updated totalRecords
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.CANCEL_SHIPPER_REQUEST,
  verifyTokenOfAxios,
  validator(cancelRequestParams, "params"),
  validator(cancelShipperRequestBody),
  verifyCancelShipperRequestAuthorization,
  controller.cancelShipperRequest,
);

/**
 * Cancel Shipper Request Batch Endpoint
 *
 * Purpose: Cancels ALL ShipperRequest rows that share a shipperRequestBatchId
 *          in a single atomic database operation.
 *
 * How it works:
 * - One UPDATE sets journeyStatusId = cancelledByShipper/Admin for every row in the batch
 * - All pending CompanyBidRequest offers on the batch are marked 'expired'
 * - One CanceledJourney record is written for audit purposes
 *
 * Why batch-level? For company-targeted freight, the batch IS the order.
 * Cancelling N individual requests separately would require N round-trips and risks
 * partial failure. This endpoint is atomic via executeInTransaction.
 *
 * Params:
 * - shipperRequestBatchId: UUID of the batch to cancel
 *
 * Body (optional):
 * - cancellationReasonsTypeId: Reason for cancellation
 *
 * Auth:
 * - Shipper can cancel their own batch
 * - Admin/Super Admin can cancel any batch
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.CANCEL_BATCH,
  verifyTokenOfAxios,
  controller.cancelShipperRequestBatch,
);

/**
 * Mark Journey Completion as Seen Endpoint
 *
 * Purpose: Marks a completed journey as seen by the shipper and creates a rating.
 *
 * How it works:
 * - Updates shipper request's isCompletionSeen flag to true
 * - Creates a rating record for the journey
 * - Used to track which completed journeys the shipper has viewed
 * - Typically called when shipper views journey completion details
 *
 * Request Body:
 * - shipperRequestUniqueId: Unique ID of the shipper request
 * - journeyDecisionUniqueId: Unique ID of the journey decision
 * - rating: Rating value (1-5 or similar scale)
 *
 * Response:
 * - Returns success message
 * - Frontend can use this to hide "new completion" badges
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.MARK_JOURNEY_COMPLETION_AS_SEEN,
  verifyTokenOfAxios,
  validator(markJourneyCompletionAsSeen),
  controller.markJourneyCompletionAsSeenController,
);

/**
 * Get Cancellation Notifications Endpoint
 *
 * Purpose: Retrieves cancellation notifications for a shipper.
 *
 * How it works:
 * - Fetches cancellation notifications where shipper hasn't seen them yet
 * - Filters by seenStatus (seen/not seen)
 * - Supports pagination for large notification lists
 * - Returns detailed cancellation information including reason and who cancelled
 *
 * Query Parameters:
 * - seenStatus: "seen" | "not seen" (optional, filters by seen status)
 * - page: Page number for pagination (optional, default: 1)
 * - limit: Number of results per page (optional, default: 10)
 *
 * Authorization:
 * - Only shippers can access their own cancellation notifications
 *
 * Response:
 * - Returns array of cancellation notifications with pagination info
 * - Each notification includes cancellation reason, who cancelled, and timestamps
 */
router.get(
  SHIPPER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS,
  verifyTokenOfAxios,
  verifyShippersIdentity,
  validator(getCancellationNotificationsQuery, "query"),
  controller.getCancellationNotificationsController,
);

/**
 * Mark Cancellation as Seen Endpoint
 *
 * Purpose: Marks a cancellation notification as seen by the shipper.
 *
 * How it works:
 * - Updates JourneyDecisions.isCancellationByDriverSeenByShipper to "seen by shipper"
 * - Verifies that the journey decision belongs to the shipper's request
 * - Prevents duplicate notifications from appearing
 * - Used to track which cancellations the shipper has viewed
 * - Typically called when shipper views cancellation details
 *
 * Request Body:
 * - journeyDecisionUniqueId: Unique ID of the journey decision to mark as seen (required)
 *
 * Authorization:
 * - Only shippers can mark their own cancellation notifications as seen
 * - System verifies ownership by checking shipperRequestId matches userUniqueId
 *
 * Response:
 * - Returns success message: "Cancellation notification marked as seen"
 * - Returns error if journey decision not found or unauthorized
 * - Frontend can use this to hide "new cancellation" badges
 */
router.put(
  SHIPPER_REQUEST_ENDPOINTS.MARK_CANCELLATION_AS_SEEN,
  verifyTokenOfAxios,
  // verifyShippersIdentity,
  validator(markCancellationAsSeen),
  controller.markCancellationAsSeenController,
);

/**
 * Verify Shipper Status Endpoint
 *
 * Purpose: Counts active journey requests grouped by status ID.
 * This is NOT for account status verification, but for ongoing journey status notifications.
 *
 * How it works:
 * - Counts requests with statuses listed in ListOfSeedData.activeJourneyStatuses array
 * - Returns totalRecords object with counts for each status:
 *   • waiting
 *   • requested
 *   • accepted by driver
 *   • accepted by shipper
 *   • journey started
 *   • journey completed
 *   • journey cancelled by shipper
 *   • journey cancelled by driver
 *   • journey cancelled by admin
 *   • journey cancelled by system
 *   • journey cancelled by no answer from driver
 *   • journey cancelled by not selected in bid
 *   • journey cancelled by rejected by driver
 *   • journey cancelled by rejected by shipper
 *
 * Frontend Usage:
 * 1. Call this endpoint to get status counts (totalRecords)
 * 2. Use /api/user/getShipperRequest4allOrSingleUser with statusId to fetch detailed data
 * 3. Take actions using related endpoints:
 *    - PUT /api/shipperRequest/markJourneyCompletionAsSeen
 *    - PUT /api/shipperRequest/markCancellationAsSeen
 *    - PUT /api/shipperRequest/cancelShipperRequest/:userUniqueId
 *    - PUT /api/shipper/acceptDriverRequest
 *    - PUT /api/user/rejectDriverOffer
 */
router.get(
  SHIPPER_REQUEST_ENDPOINTS.VERIFY_SHIPPER_STATUS,
  verifyTokenOfAxios,
  validator(verifyShipperStatusQuery, "query"),
  controller.verifyShipperStatus,
);

/**
 * Get All Active Requests Endpoint
 *
 * Purpose: Retrieves all active shipper requests for drivers to view available journeys.
 *
 * How it works:
 * - Fetches requests with active statuses: waiting, requested, acceptedByDriver
 * - Supports comprehensive filtering by user, request, location, and date criteria
 * - Includes pagination and sorting capabilities
 * - Returns detailed request information with user and vehicle type data
 *
 * Query Parameters:
 * - userUniqueId: Filter by shipper user ID (optional)
 * - email: Filter by shipper email (partial match, optional)
 * - phoneNumber: Filter by shipper phone (partial match, optional)
 * - fullName: Filter by shipper name (partial match, optional)
 * - vehicleTypeUniqueId: Filter by vehicle type (optional)
 * - journeyStatusId: Filter by specific journey status (optional)
 * - shippableItemName: Filter by item name (partial match, optional)
 * - originPlace: Filter by origin location (partial match, optional)
 * - destinationPlace: Filter by destination location (partial match, optional)
 * - startDate: Filter requests from this date (optional)
 * - endDate: Filter requests until this date (optional)
 * - shippingDate: Filter by shipping date (optional)
 * - deliveryDate: Filter by delivery date (optional)
 * - page: Page number for pagination (optional, default: 1)
 * - limit: Number of results per page (optional, default: 10)
 * - sortBy: Field to sort by (optional, default: "shipperRequestCreatedAt")
 * - sortOrder: Sort direction "ASC" or "DESC" (optional, default: "DESC")
 *
 * Authorization:
 * - Requires valid authentication token
 * - Typically used by drivers to find available journeys
 *
 * Response:
 * - Returns array of active requests with pagination info
 * - Each request includes shipper details, vehicle type, and journey status
 * - Includes pagination metadata (currentPage, totalPages, totalCount, etc.)
 */
router.get(
  SHIPPER_REQUEST_ENDPOINTS.GET_ALL_ACTIVE_REQUESTS,
  verifyTokenOfAxios,
  validator(getAllActiveRequestsQuery, "query"),
  controller.getAllActiveRequestsController,
);

module.exports = router;
