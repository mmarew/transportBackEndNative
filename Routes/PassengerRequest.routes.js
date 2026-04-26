// routes/Passenger.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../Controllers/PassengerRequest.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyPassengersIdentity,
  verifyCancelPassengerRequestAuthorization,
} = require("../Middleware/VerifyUsersIdentity");

// Create Passenger Request
const { validator } = require("../Middleware/Validator");
const {
  createPassengerRequest,
  requestParams,
  cancelRequestParams,
  cancelPassengerRequestBody,
  getCancellationNotificationsQuery,
  markCancellationAsSeen,
  markJourneyCompletionAsSeen,
  verifyPassengerStatusQuery,
  getPassengerRequestQuery,
  acceptDriverRequestBody,
  rejectDriverOfferBody,
  getAllActiveRequestsQuery,
} = require("../Validations/PassengerRequest.schema");

/**
 * Passenger Create Request Endpoint
 *
 * Purpose: Creates a new journey/shipping request for a passenger/shipper. This endpoint enables
 * passengers to request transportation services for their goods, allowing drivers to find and
 * bid on available journeys. The endpoint supports batch requests (multiple   Vehicle for one batch)
 * and prevents duplicate requests using passengerRequestBatchId grouping.
 *
 * Context & Use Case:
 * - Passenger/shipper wants to transport goods from origin to destination
 * - Passenger may need multiple   Vehicle for a single batch of requests (e.g., large shipment)
 * - Request is grouped by passengerRequestBatchId to prevent duplicate creation
 * - After creation, request is available for drivers to find and bid on
 * - System automatically finds nearby drivers and sends notifications
 * - Admin can create requests on behalf of shippers (requires phone number)
 * - Driver can create request when picking up goods from street (takes from street scenario)
 *
 * When to Use:
 * - Passenger wants to request transportation for goods
 * - Passenger needs multiple   Vehicle (numberOfVehicles > 1)
 * - Admin wants to create request for shipper (requires shipperPhoneNumber)
 * - Driver picks up goods from street and needs to create request (driver "take from street" scenario)
 * - Request is for shipping cargo/goods (not passenger transport)
 *
 * How it works:
 * 1. Validates required fields (passengerRequestBatchId, destination, vehicle, originLocation, etc.)
 * 2. Extracts userUniqueId from authentication token (for passengers) or creates user (for admin)
 * 3. If admin: Creates passenger user account within same transaction as request creation (atomic)
 * 4. Wraps admin user creation (if needed) + batch check + request creation in transaction (atomic operation)
 * 5. Checks existing requests by passengerRequestBatchId + userUniqueId
 * 6. Validates not all requests already created (existingRequestsCount < numberOfVehicles)
 * 7. Creates remaining requests sequentially (numberOfVehicles - existingRequestsCount)
 * 8. Each request is created with journeyStatusId = waiting (1)
 * 9. Returns all newly created requests with success message
 *
 * Flow Diagram:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ createPassengerRequest (Entry Point)                         │
 * └────────────────┬────────────────────────────────────────────┘
 *                  │
 *                  ├─→ Step 1: Validate Required Fields
 *                  │   └─→ passengerRequestBatchId, destination, vehicle, originLocation, etc.
 *                  │
 *                  ├─→ Step 2: Extract User Info from Token
 *                  │   ├─→ If roleId ===1 (passenger): userUniqueId from token
 *                  │   └─→ shipperRequestCreatedBy and shipperRequestCreatedByRoleId from token
 *                  │
 *                  ├─→ Step 3: Handle Admin User Creation (if admin) - INSIDE TRANSACTION
 *                  │   ├─→ ✅ [SAME TRANSACTION] createUser (uses provided connection)
 *                  │   │   └─→ Creates passenger user with phone number (atomic with request creation)
 *                  │   │       └─→ Returns existing user if phone already exists
 *                  │   └─→ Sets userUniqueId to newly created/existing user
 *                  │
 *                  ├─→ Step 4: Wrap in Transaction (batch check + request creation)
 *                  │   └─→ [TRANSACTION START]
 *                  │       ├─→ Step 4a: Batch Check (within transaction)
 *                  │       │   └─→ SELECT * FROM PassengerRequest
 *                  │       │       WHERE passengerRequestBatchId = ? AND userUniqueId = ?
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
 *                  │               ├─→ [TRANSACTION] INSERT INTO PassengerRequest
 *                  │               │   ├─→ passengerRequestUniqueId (UUID)
 *                  │               │   ├─→ userUniqueId
 *                  │               │   ├─→ vehicleTypeUniqueId
 *                  │               │   ├─→ originLatitude, originLongitude, originPlace
 *                  │               │   ├─→ destinationLatitude, destinationLongitude, destinationPlace
 *                  │               │   ├─→ journeyStatusId = waiting (1)
 *                  │               │   ├─→ shippableItemName, shippableItemQtyInQuintal
 *                  │               │   ├─→ shippingDate, deliveryDate, shippingCost
 *                  │               │   └─→ passengerRequestBatchId (groups related requests)
 *                  │               └─→ Collect new request data
 *                  │
 *                  └─→ [TRANSACTION COMMIT] or [TRANSACTION ROLLBACK] on error
 *                      └─→ Response: Success with all newly created requests
 *
 * Database Operations:
 * 1. ✅ WRITE (Admin only - SAME TRANSACTION): Creates passenger user account
 *    - If shipperRequestCreatedByRoleId ===adminRoleId: Creates Users record
 *    - ✅ FIXED: Uses createUser function with connection parameter (same transaction)
 *    - Creates Users record with:
 *      - userUniqueId (UUID)
 *      - phoneNumber (from shipperPhoneNumber)
 *      - email (fake email with random number)
 *      - roleId = passengerRoleId (1)
 *      - statusId = ACTIVE (1)
 *      - fullName = null
 *    - Also creates usersCredential record (within same transaction)
 *    - ✅ FIXED: Uses same connection/transaction as request creation (full transaction support)
 *    - If user already exists (same phone), returns existing user
 *
 * 2. ✅ READ (within transaction): Checks existing requests by batchId
 *    - Uses connection query if provided (transaction support)
 *    - SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ? AND userUniqueId = ?
 *    - Counts existing requests for this batch
 *    - Used to prevent exceeding numberOfVehicles limit
 *
 * 3. ✅ READ (outside transaction, before request creation): Validates vehicle type
 *    - For each request creation: SELECT * FROM VehicleTypes WHERE vehicleTypeUniqueId = ?
 *    - Validates vehicle type exists before creating request
 *    - Returns error if vehicle type not found
 *
 * 4. ✅ WRITE (within transaction): Creates PassengerRequest records
 *    - For each remaining request: INSERT INTO PassengerRequest
 *    - Creates records sequentially (loop: 0 to noOfRecords)
 *    - Each record includes:
 *      - passengerRequestUniqueId (UUID, auto-generated)
 *      - userUniqueId (from token or newly created admin user)
 *      - vehicleTypeUniqueId (from request body)
 *      - originLatitude, originLongitude, originPlace (from originLocation)
 *      - destinationLatitude, destinationLongitude, destinationPlace (from destination.description || null)
 *      - journeyStatusId = waiting (1) - initial status
 *      - shippableItemName, shippableItemQtyInQuintal
 *      - shippingDate, deliveryDate, shippingCost
 *      - passengerRequestBatchId (groups related requests)
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
 * - passengerRequestBatchId: Unique ID for batch grouping (required, UUID format)
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
 * - shipperPhoneNumber: Passenger's phone number (optional, required only when admin creates on behalf)
 *   - Used to create user account when admin creates request
 *   - Must be provided if shipperRequestCreatedByRoleId ===adminRoleId
 * - requestType: Type of request (optional, "PASSENGER" | "CARGO")
 *   - Currently not enforced in database, kept for future use
 *
 * Request Headers:
 * - Authorization: Bearer token (required)
 *   - Token must belong to a passenger role (roleId ===1) or admin role
 *   - userUniqueId extracted from token automatically (for passengers)
 *   - roleId extracted from token for authorization
 *
 * Response (Success - Passenger Creates Request):
 * - message: "success"
 * - newRequests: [
 *     {
 *       passengerRequestId: number (auto-increment ID),
 *       passengerRequestUniqueId: string (UUID),
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
 *       passengerRequestBatchId: string (UUID),
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
 * - error: "Missing required fields to create passenger request" (if validation fails in controller)
 * - error: "Batch uniqueId Can't be null" (if passengerRequestBatchId missing)
 * - error: "shipperPhoneNumber is required when admin creates request for shipper" (if admin but no phone)
 * - error: "Failed to create user for shipper" (if user creation fails for admin)
 * - error: "Failed to get userUniqueId from created user" (if user creation returns invalid data)
 * - error: "userUniqueId is required" (if userUniqueId not available after admin user creation)
 * - error: "All required requests have already been created for this batch." (if existingRequestsCount >= numberOfVehicles)
 *   - existingRequestsCount: number (current count of requests for this batch)
 *   - requestedVehicles: number (number of   Vehicle requested)
 *   - passengerRequestBatchId: string (UUID of the batch)
 * - error: "Invalid vehicle type" (if vehicleTypeUniqueId not found in VehicleTypes table)
 * - error: "Vehicle type not found" (if vehicleTypeUniqueId validation fails)
 * - error: "Unable to create request" (general processing error)
 *
 * Security:
 * - Requires valid authentication token (verifyTokenOfAxios)
 * - Validates user has passenger role (roleId ===1) or admin role
 * - For passengers: userUniqueId extracted from token (cannot be spoofed)
 * - For admin: Creates passenger user account within same transaction as request creation (atomic)
 * - Only allows passengers to create requests for themselves (or admin for others)
 *
 * Authorization:
 * - Passengers (roleId ===1) can create requests for themselves
 * - Admin can create requests on behalf of shippers (requires shipperPhoneNumber)
 * - Admin must provide shipperPhoneNumber to create user account
 * - Driver role (roleId ===2) can create requests internally (special use case - takeFromStreet)
 *
 * Validation:
 * - Validates required fields in controller (before service call):
 *   - passengerRequestBatchId, destination, vehicle, originLocation, numberOfVehicles,
 *     shippingDate, shippingCost, shippableItemQtyInQuintal, shippableItemName, deliveryDate
 * - Validates request body format via Joi schema (createPassengerRequest)
 *   - passengerRequestBatchId: UUID format, required
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
 * - Validates passengerRequestBatchId is not null (service level)
 * - Validates userUniqueId is available (after admin user creation if applicable)
 * - Validates vehicle type exists in VehicleTypes table (for each request creation)
 * - Validates existing requests count < numberOfVehicles (batch limit check)
 *
 * Error Cases:
 * - "Missing required fields to create passenger request": Controller validation failed
 *   - Status: 400 Bad Request
 *   - Cause: One or more required fields missing from request body
 * - "Batch uniqueId Can't be null": passengerRequestBatchId missing
 *   - Status: 400 Bad Request
 *   - Cause: passengerRequestBatchId not provided or null
 * - "shipperPhoneNumber is required when admin creates request for shipper": Admin creating but no phone
 *   - Status: 400 Bad Request
 *   - Cause: Admin role but shipperPhoneNumber not provided
 * - "Failed to create user for shipper": User creation failed for admin
 *   - Status: 500 Internal Server Error
 *   - Cause: createUser returned error (phone already exists with different user, database error, etc.)
 * - "Failed to get userUniqueId from created user": User creation succeeded but no userUniqueId returned
 *   - Status: 500 Internal Server Error
 *   - Cause: createUser returned success but dataOfPassenger.userUniqueId is missing
 * - "All required requests have already been created for this batch": Batch limit exceeded
 *   - Status: 409 Conflict (should be, but currently returns error message)
 *   - Cause: Existing requests count >= numberOfVehicles
 *   - Includes: existingRequestsCount, requestedVehicles, passengerRequestBatchId for debugging
 * - "Invalid vehicle type" or "Vehicle type not found": VehicleTypeUniqueId doesn't exist
 *   - Status: 500 Internal Server Error
 *   - Cause: VehicleTypeUniqueId not found in VehicleTypes table
 * - "Unable to create request": General processing error
 *   - Status: 500 Internal Server Error
 *   - Cause: Database error, network error, or other system error
 *
 * Use Cases:
 * 1. Passenger creates single request: numberOfVehicles = 1 → Creates 1 request → Returns 1 request
 * 2. Passenger creates batch request: numberOfVehicles = 3 → Creates 3 requests → Returns 3 requests
 * 3. Passenger creates partial batch: Existing 1 request, numberOfVehicles = 3 → Creates 2 more → Returns 2 requests
 * 4. Passenger attempts duplicate: numberOfVehicles = 2, existing = 2 → Returns error "already created"
 * 5. Admin creates for shipper: Admin provides phone → Creates user → Creates request → Returns request
 * 6. Driver takes from street: Driver picks up goods → Creates passenger user → Creates request (status = journeyStarted) → Returns array → Creates journey
 *
 * Audit Trail - Who Created the Request:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (passenger/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of creator (1=passenger, 2=driver, 3=admin)
 * - These fields are stored in PassengerRequest table for tracking and reporting
 * - Service uses shipperRequestCreatedByRoleId to determine return behavior:
 *   - Role 1 (Passenger) or 3 (Admin): Returns verifyPassengerStatus result (status counts)
 *   - Role 2 (Driver): Returns array of requests directly (no status counts needed)
 *
 * Status Flow:
 * 1. Request created → journeyStatusId: waiting (1)
 * 2. System finds nearby drivers → Status: requested (2)
 * 3. Driver accepts → Status: acceptedByDriver (3)
 * 4. Passenger accepts driver → Status: acceptedByPassenger (4)
 * 5. Driver starts journey → Status: journeyStarted (5)
 * 6. Driver completes journey → Status: journeyCompleted (6)
 *
 * Important Logic - Batch Grouping:
 * - All requests with same passengerRequestBatchId are treated as related (same shipment)
 * - Prevents creating more requests than numberOfVehicles for a batch
 * - Useful when passenger needs multiple   Vehicle for large shipment
 * - Each request in batch has unique passengerRequestUniqueId but same passengerRequestBatchId
 * - Batch check counts existing requests: WHERE passengerRequestBatchId = ? AND userUniqueId = ?
 * - If existingRequestsCount >= numberOfVehicles: All requests already created, return error
 * - Otherwise: Create remaining requests (numberOfVehicles - existingRequestsCount)
 *
 * Important Logic - Admin User Creation:
 * - Admin can create requests on behalf of shippers who don't have accounts
 * - Creates passenger user account using shipperPhoneNumber
 * - ✅ FIXED: User creation now uses same transaction as request creation (full transaction support)
 * - If user already exists (same phone), returns existing user (no duplicate)
 * - Generated email: fakeEmail_{randomNumber}@passenger.com
 * - Generated userRoleStatusDescription: "this is shipper "
 * - ✅ FIXED: User creation wrapped in same transaction as request creation
 * - ✅ FIXED: If request creation fails, user creation is rolled back (no orphaned users)
 * - ✅ FIXED: All operations atomic - all succeed or all fail together
 *
 * Important Logic - Driver "Take From Street" Scenario:
 * - Driver picks up goods from street while moving (not pre-booked)
 * - ✅ FIXED: Creates passenger user account INSIDE transaction (in DriverRequest.service.js)
 * - ✅ FIXED: User creation uses same transaction as request creation (full transaction support)
 * - Sets audit fields: shipperRequestCreatedBy = driver.userUniqueId, shipperRequestCreatedByRoleId = driver.roleId (2)
 * - Sets journeyStatusId = journeyStarted (5) - driver already picked up goods, not waiting
 * - Returns array of created requests directly (not wrapped in verifyPassengerStatus)
 * - Used immediately to create journey decision and journey record
 * - Audit trail stored in database to track that driver created this request
 * - Note: This is handled in DriverRequest.service.js
 * - ✅ FIXED: All operations atomic - user creation + passenger request + driver request + journey decision + journey + route points
 * - ✅ FIXED: No more orphaned users - if any operation fails, all are rolled back
 *
 * Important Logic - Sequential Creation:
 * - Requests are created sequentially in a loop (not in parallel)
 * - Reason: Each creation depends on previous one (order matters for batch)
 * - Loop: for (let i = 0; i < noOfRecords; i++)
 * - Each iteration: Creates one PassengerRequest record
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
 * - Batch grouping prevents duplicate requests using passengerRequestBatchId
 * - Admin can create requests on behalf of shippers (requires phone number)
 * - ✅ FIXED: Admin user creation now uses same transaction as request creation (full transaction support)
 * - Admin user creation + batch check + request creation are all atomic (wrapped in transaction)
 * - Race condition prevented by transaction isolation
 * - Sequential creation ensures batch ordering
 * - Vehicle type validation happens before request creation
 *
 * Performance Notes:
 * - Admin user creation adds one database transaction (if admin)
 * - Batch check uses indexed query (passengerRequestBatchId + userUniqueId)
 * - Vehicle type validation happens before loop (efficient - fails early)
 * - Request creation is sequential (could be parallelized, but safer sequential)
 * - Transaction timeout: 20 seconds (enough for multiple request creations)
 * - Consider adding composite index: (passengerRequestBatchId, userUniqueId) for faster batch checks
 * - Consider caching vehicle type validation (validate once, reuse result)
 *
 * Differences from Other Endpoints:
 * - Unlike /api/driver/request: This endpoint creates passenger requests, not driver requests
 * - Unlike /api/passenger/acceptDriverRequest: This endpoint creates new requests, doesn't accept drivers
 * - Unlike /api/passenger/cancelPassengerRequest: This endpoint creates requests, doesn't cancel them
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
 * 4. Add composite index on (passengerRequestBatchId, userUniqueId)
 *    - Would improve batch check query performance
 *    - Recommended for high-frequency batch checks
 *
 * 5. Cache vehicle type validation
 *    - Validate once before loop, reuse result
 *    - Would eliminate redundant database queries
 *    - Minor optimization for multiple request creation
 */
router.post(
  "/api/passengerRequest/createRequest",
  verifyTokenOfAxios,
  validator(createPassengerRequest), // Validates request body: passengerRequestBatchId, destination, vehicle, originLocation, numberOfVehicles, shippingDate, deliveryDate, shippingCost, shippableItemQtyInQuintal, shippableItemName, shipperPhoneNumber (optional), requestType (optional)
  controller.createPassengerRequest,
);
/**
 * Get Passenger Request Data Endpoint
 *
 * Purpose: Provides data to the frontend to display journey request details.
 *
 * Usage Examples:
 * - Get recent completed journeys: ?journeyStatusId=6&limit=7&page=1
 * - Get all requests: ?target=all&limit=10&page=1
 * - Get single request: ?passengerRequestUniqueId=xxx
 * - Filter by status: ?journeyStatusId=1,2,3
 *
 * Query Parameters:
 * - target: "all" | "single" (optional)
 * - journeyStatusId: single ID or comma-separated IDs (optional)
 * - limit: number of results (optional)
 * - page: page number (optional)
 * - passengerRequestUniqueId: filter by unique ID (optional)
 * - passengerUserUniqueId: filter by user ID, use "self" for current user (optional)
 * - Other filters: vehicleTypeUniqueId, passengerRequestBatchId, etc.
 */
router.get(
  "/api/user/getPassengerRequest4allOrSingleUser",
  verifyTokenOfAxios,
  validator(getPassengerRequestQuery, "query"),
  controller.getPassengerRequest4allOrSingleUser,
);
/**
 * Accept Driver Request Endpoint
 *
 * Purpose: Allows a passenger to accept a driver's offer/request for a journey based on bid principles.
 *
 * How it works:
 * - Passenger selects one driver from multiple driver offers
 * - Updates the selected driver's status to "accepted by passenger"
 * - Updates all other drivers' status to "not selected in bid"
 * - Sends notifications to all affected drivers (accepted/rejected)
 * - Returns updated passenger status with unique IDs and status counts
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request to accept
 * - journeyDecisionUniqueId: Unique ID of the journey decision
 * - passengerRequestUniqueId: Unique ID of the passenger request
 *
 * Response:
 * - Returns success with status, unique IDs, and updated totalRecords (status counts)
 * - Frontend can use this to update UI without additional API calls
 */
router.put(
  "/api/passenger/acceptDriverRequest",
  verifyTokenOfAxios,
  validator(acceptDriverRequestBody),
  controller.acceptDriverRequest,
);

/**
 * Reject Driver Offer Endpoint
 *
 * Purpose: Allows a passenger to reject a driver's offer/request.
 *
 * How it works:
 * - Passenger rejects a specific driver's offer
 * - Updates driver request status to "rejected by passenger"
 * - Updates journey decision status accordingly
 * - If this was the only active request (accepted by driver), passenger request status returns to "waiting"
 * - Sends notification to the rejected driver
 * - Updates are executed in parallel for better performance
 *
 * Request Body:
 * - driverRequestUniqueId: Unique ID of the driver request to reject (required)
 * - journeyDecisionUniqueId: Unique ID of the journey decision (required)
 * - passengerRequestUniqueId: Unique ID of the passenger request (required)
 * - passengerRequestId: Integer ID of the passenger request (required)
 * - journeyStatusId: Current journey status ID (required)
 *
 * Response:
 * - Returns success message: "Driver offer rejected successfully"
 * - Returns error with details if validation or update fails
 * - Frontend should call verifyPassengerStatus to get updated counts
 */
router.put(
  "/api/user/rejectDriverOffer",
  verifyTokenOfAxios,
  validator(rejectDriverOfferBody),
  controller.rejectDriverOffer,
);

/**
 * Update Passenger Request Endpoint
 *
 * Purpose: Updates an existing passenger request by its ID.
 *
 * How it works:
 * - Updates passenger request fields in the PassengerRequest table
 * - Uses passengerRequestId (integer) to identify the request
 * - Validates that the request exists (returns error if not found)
 * - Returns success message on successful update
 *
 * URL Parameters:
 * - id: passengerRequestId (integer) - Note: Despite route name, this uses integer ID, not UUID
 *
 * Request Body:
 * - Any fields from PassengerRequest table that need to be updated
 * - Common fields: originLocation, destination, shippingDate, deliveryDate,
 *   shippingCost, shippableItemName, shippableItemQtyInQuintal, etc.
 *
 * Response:
 * - Returns success message: "Request updated successfully"
 * - Returns error if request not found or no changes made
 */
router.put(
  "/api/passengerRequest/getById/:id",
  verifyTokenOfAxios,
  validator(requestParams, "params"),
  controller.updateRequestById,
);

/**
 * Delete Passenger Request Endpoint
 *
 * Purpose: Deletes a passenger request by its ID.
 *
 * How it works:
 * - Permanently deletes the passenger request from PassengerRequest table
 * - Uses passengerRequestId (integer) to identify the request
 * - Validates that the request exists (returns error if not found)
 * - Note: This is a hard delete - related records may need separate handling
 *
 * URL Parameters:
 * - id: passengerRequestId (integer) - Note: Despite route name, this uses integer ID, not UUID
 *
 * Response:
 * - Returns success message: "Request deleted successfully"
 * - Returns error if request not found
 * - Frontend should refresh request list after deletion
 */
router.delete(
  "/api/passengerRequest/getById/:id",
  verifyTokenOfAxios,
  validator(requestParams, "params"),
  controller.deleteRequest,
);

/**
 * Cancel Passenger Request Endpoint
 *
 * Purpose: Cancels an active passenger request (by passenger or admin).
 *
 * How it works:
 * - Updates passenger request status to "cancelled by passenger" or "cancelled by admin"
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
 * - passengerRequestUniqueId: Unique ID of the request to cancel
 * - cancellationReasonsTypeId: Reason for cancellation (optional)
 *
 * Authorization:
 * - Passenger can only cancel their own requests
 * - Admin/Super Admin can cancel any request
 *
 * Response:
 * - Returns success with cancellation status, unique IDs, and updated totalRecords
 */
router.put(
  "/api/passengerRequest/cancelPassengerRequest/:userUniqueId",
  verifyTokenOfAxios,
  validator(cancelRequestParams, "params"),
  validator(cancelPassengerRequestBody),
  verifyCancelPassengerRequestAuthorization,
  controller.cancelPassengerRequest,
);

/**
 * Cancel Passenger Request Batch Endpoint
 *
 * Purpose: Cancels ALL PassengerRequest rows that share a passengerRequestBatchId
 *          in a single atomic database operation.
 *
 * How it works:
 * - One UPDATE sets journeyStatusId = cancelledByPassenger/Admin for every row in the batch
 * - All pending CompanyBidRequest offers on the batch are marked 'expired'
 * - One CanceledJourney record is written for audit purposes
 *
 * Why batch-level? For company-targeted freight, the batch IS the order.
 * Cancelling N individual requests separately would require N round-trips and risks
 * partial failure. This endpoint is atomic via executeInTransaction.
 *
 * Params:
 * - passengerRequestBatchId: UUID of the batch to cancel
 *
 * Body (optional):
 * - cancellationReasonsTypeId: Reason for cancellation
 *
 * Auth:
 * - Shipper can cancel their own batch
 * - Admin/Super Admin can cancel any batch
 */
router.put(
  "/api/passengerRequest/cancelBatch/:passengerRequestBatchId",
  verifyTokenOfAxios,
  controller.cancelPassengerRequestBatch,
);

/**
 * Mark Journey Completion as Seen Endpoint
 *
 * Purpose: Marks a completed journey as seen by the passenger and creates a rating.
 *
 * How it works:
 * - Updates passenger request's isCompletionSeen flag to true
 * - Creates a rating record for the journey
 * - Used to track which completed journeys the passenger has viewed
 * - Typically called when passenger views journey completion details
 *
 * Request Body:
 * - passengerRequestUniqueId: Unique ID of the passenger request
 * - journeyDecisionUniqueId: Unique ID of the journey decision
 * - rating: Rating value (1-5 or similar scale)
 *
 * Response:
 * - Returns success message
 * - Frontend can use this to hide "new completion" badges
 */
router.put(
  "/api/passengerRequest/markJourneyCompletionAsSeen",
  verifyTokenOfAxios,
  validator(markJourneyCompletionAsSeen),
  controller.markJourneyCompletionAsSeenController,
);

/**
 * Get Cancellation Notifications Endpoint
 *
 * Purpose: Retrieves cancellation notifications for a passenger.
 *
 * How it works:
 * - Fetches cancellation notifications where passenger hasn't seen them yet
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
 * - Only passengers can access their own cancellation notifications
 *
 * Response:
 * - Returns array of cancellation notifications with pagination info
 * - Each notification includes cancellation reason, who cancelled, and timestamps
 */
router.get(
  "/api/passengerRequest/getCancellationNotifications",
  verifyTokenOfAxios,
  verifyPassengersIdentity,
  validator(getCancellationNotificationsQuery, "query"),
  controller.getCancellationNotificationsController,
);

/**
 * Mark Cancellation as Seen Endpoint
 *
 * Purpose: Marks a cancellation notification as seen by the passenger.
 *
 * How it works:
 * - Updates JourneyDecisions.isCancellationByDriverSeenByPassenger to "seen by passenger"
 * - Verifies that the journey decision belongs to the passenger's request
 * - Prevents duplicate notifications from appearing
 * - Used to track which cancellations the passenger has viewed
 * - Typically called when passenger views cancellation details
 *
 * Request Body:
 * - journeyDecisionUniqueId: Unique ID of the journey decision to mark as seen (required)
 *
 * Authorization:
 * - Only passengers can mark their own cancellation notifications as seen
 * - System verifies ownership by checking passengerRequestId matches userUniqueId
 *
 * Response:
 * - Returns success message: "Cancellation notification marked as seen"
 * - Returns error if journey decision not found or unauthorized
 * - Frontend can use this to hide "new cancellation" badges
 */
router.put(
  "/api/passengerRequest/markCancellationAsSeen",
  verifyTokenOfAxios,
  // verifyPassengersIdentity,
  validator(markCancellationAsSeen),
  controller.markCancellationAsSeenController,
);

/**
 * Verify Passenger Status Endpoint
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
 *   • accepted by passenger
 *   • journey started
 *   • journey completed
 *   • journey cancelled by passenger
 *   • journey cancelled by driver
 *   • journey cancelled by admin
 *   • journey cancelled by system
 *   • journey cancelled by no answer from driver
 *   • journey cancelled by not selected in bid
 *   • journey cancelled by rejected by driver
 *   • journey cancelled by rejected by passenger
 *
 * Frontend Usage:
 * 1. Call this endpoint to get status counts (totalRecords)
 * 2. Use /api/user/getPassengerRequest4allOrSingleUser with statusId to fetch detailed data
 * 3. Take actions using related endpoints:
 *    - PUT /api/passengerRequest/markJourneyCompletionAsSeen
 *    - PUT /api/passengerRequest/markCancellationAsSeen
 *    - PUT /api/passengerRequest/cancelPassengerRequest/:userUniqueId
 *    - PUT /api/passenger/acceptDriverRequest
 *    - PUT /api/user/rejectDriverOffer
 */
router.get(
  "/api/passengerRequest/verifyPassengerStatus",
  verifyTokenOfAxios,
  validator(verifyPassengerStatusQuery, "query"),
  controller.verifyPassengerStatus,
);

/**
 * Get All Active Requests Endpoint
 *
 * Purpose: Retrieves all active passenger requests for drivers to view available journeys.
 *
 * How it works:
 * - Fetches requests with active statuses: waiting, requested, acceptedByDriver
 * - Supports comprehensive filtering by user, request, location, and date criteria
 * - Includes pagination and sorting capabilities
 * - Returns detailed request information with user and vehicle type data
 *
 * Query Parameters:
 * - userUniqueId: Filter by passenger user ID (optional)
 * - email: Filter by passenger email (partial match, optional)
 * - phoneNumber: Filter by passenger phone (partial match, optional)
 * - fullName: Filter by passenger name (partial match, optional)
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
 * - Each request includes passenger details, vehicle type, and journey status
 * - Includes pagination metadata (currentPage, totalPages, totalCount, etc.)
 */
router.get(
  "/api/shippingRequest/getAllActiveRequests",
  verifyTokenOfAxios,
  validator(getAllActiveRequestsQuery, "query"),
  controller.getAllActiveRequestsController,
);

module.exports = router;
