# Driver Registration

Complete guide to driver account creation, verification, and management.

Driver Registration Flow

### 1. Create Driver Account

**Endpoint**: `POST /api/user/createUser`
**Description**: Creates a new driver account.
**Request Body**:

```json
{
  "fullName": "user 80",
  "phoneNumber": "+251922112481",
  "statusId": "2"
}
```

**Success Response**:

```json
{
  "message": "success",
  "user": {
    "userUniqueId": "uuid-here",
    "fullName": "Driver Name",
    "phoneNumber": "+1234567890",
    "roleId": 2
  }
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or invalid data format
- **409 Conflict**: Phone number or email already exists
- **500 Internal Server Error**: Server error during user creation

### 2. Verify Driver OTP & Generate Token

**Endpoint**: `POST /api/user/verifyUserByOTP`
**Description**: Verify driver phone number with OTP and generate JWT authentication token
**Authentication**: None required

**Request Body:**

```json
{
  "roleId": 2,
  "OTP": 101010,
  "phoneNumber": "+251922112481"
}
```

**Success Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "success",
  "data": "OTP verified successfully"
}
```

**Error Responses**:

- **400 Bad Request**: Invalid OTP or missing required fields
- **401 Unauthorized**: Invalid or expired OTP
- **404 Not Found**: User with phone number not found
- **429 Too Many Requests**: Too many OTP attempts
- **500 Internal Server Error**: Server error during verification

### 3. Check Driver Account Status

**Endpoint**: `GET /api/account/status?ownerUserUniqueId=self&roleId=2`
**Description**: Check driver account status, document requirements, and vehicle assignment
**Authentication**: Driver token required

**Success Response:**

```json
{
    "message": "success",
    "messageType": "accountStatus",
    "userData": {
        "statusId": 3,
        "statusName": "inactive - required documents missing",
        "statusDescription": "Driver has not attached all required documents.",
        "roleId": 2
    },
    "attachedDocumentsByStatus": {...},
    "unAttachedDocumentTypes": [...],
    "vehicle": {...},
    "subscription": {...}
}
```

**Error Responses**:

- **401 Unauthorized**: Invalid or missing driver token
- **404 Not Found**: Driver account not found
- **500 Internal Server Error**: Server error during status check

````json
{
  "message": "success",
  "messageType": "accountStatus",
  "vehicle": null,
  "userData": {
    "userRoleStatusId": 5,
    "userRoleStatusUniqueId": "f05804fa-8f49-4126-9247-213045fd8453",
    "statusId": 2,
    "userRoleId": 5,
    "userRoleStatusDescription": null,
    "userRoleStatusCreatedBy": "b269e36d-1ed1-469d-8d4a-042f53365329",
    "userRoleStatusCreatedAt": "2026-01-31T12:23:31.000Z",
    "userRoleStatusCurrentVersion": 1,
    "userUniqueId": "b269e36d-1ed1-469d-8d4a-042f53365329",
    "roleId": 2,
    "userRoleUniqueId": "3564bda8-6afd-4c1e-9250-75ef1dd55813",
    "fullName": "user 80",
    "phoneNumber": "+251918569809",
    "email": null,
    "roleName": "Driver",
    "roleDescription": "a person who can recive order from shipper to load goods",
    "statusName": "inactive - vehicle not registered",
    "statusDescription": "Driver has not registered a vehicle.",
    "createdByName": "user 80"
  },
  "attachedDocumentsByStatus": {
    "PENDING": [],
    "ACCEPTED": [],
    "REJECTED": []
  },
  "unAttachedDocumentTypes": [
    {
      "attachedDocumentId": null,
      "attachedDocumentUniqueId": null,
      "userUniqueId": null,
      "attachedDocumentDescription": null,
      "documentTypeId": 1,
      "attachedDocumentFileNumber": null,
      "documentExpirationDate": null,
      "attachedDocumentAcceptance": null,
      "attachedDocumentName": null,
      "documentVersion": null,
      "attachedDocumentCreatedByUserId": null,
      "attachedDocumentCreatedAt": null,
      "attachedDocumentAcceptanceReason": null,
      "attachedDocumentAcceptedRejectedByUserId": null,
      "attachedDocumentAcceptedRejectedAt": null,
      "documentTypeUniqueId": "fb7c9a3a-ca80-453f-96d2-bb661237ba22",
      "documentTypeName": "Driver's License",
      "uploadedDocumentName": "driversLicense",
      "uploadedDocumentTypeId": "driversLicenseTypeId",
      "uploadedDocumentDescription": "driversLicenseDescription",
      "uploadedDocumentExpirationDate": "driversLicenseExpirationDate",
      "uploadedDocumentFileNumber": "driversLicenseFileNumber",
      "documentTypeDescription": " A valid and unexpired driver's license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
      "documentTypeCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "documentTypeCreatedAt": "2026-01-31T11:53:03.000Z",
      "documentTypeUpdatedBy": null,
      "documentTypeUpdatedAt": null,
      "documentTypeDeletedBy": null,
      "documentTypeDeletedAt": null,
      "isDocumentTypeDeleted": 0,
      "documentTypeCurrentVersion": 1,
      "roleDocumentRequirementId": 1,
      "roleDocumentRequirementUniqueId": "c60ce1c0-87eb-44fb-bbdb-18424502e4c8",
      "roleId": 2,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 1,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:06.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "doc_status": "NOT_ATTACHED"
    },
    {
      "attachedDocumentId": null,
      "attachedDocumentUniqueId": null,
      "userUniqueId": null,
      "attachedDocumentDescription": null,
      "documentTypeId": 2,
      "attachedDocumentFileNumber": null,
      "documentExpirationDate": null,
      "attachedDocumentAcceptance": null,
      "attachedDocumentName": null,
      "documentVersion": null,
      "attachedDocumentCreatedByUserId": null,
      "attachedDocumentCreatedAt": null,
      "attachedDocumentAcceptanceReason": null,
      "attachedDocumentAcceptedRejectedByUserId": null,
      "attachedDocumentAcceptedRejectedAt": null,
      "documentTypeUniqueId": "b05fdb3f-ce24-4514-be46-d87bedaf8fe1",
      "documentTypeName": " Vehicle Registration (librea)",
      "uploadedDocumentName": "VehicleRegistrationLibrea",
      "uploadedDocumentTypeId": "VehicleRegistrationLibreaTypeId",
      "uploadedDocumentDescription": "VehicleRegistrationLibreaDescription",
      "uploadedDocumentExpirationDate": "VehicleRegistrationLibreaExpirationDate",
      "uploadedDocumentFileNumber": "VehicleRegistrationLibreaFileNumber",
      "documentTypeDescription": "Proof of ownership or right to use the vehicle for ride share services. It confirms the vehicle is legally registered.",
      "documentTypeCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "documentTypeCreatedAt": "2026-01-31T11:53:03.000Z",
      "documentTypeUpdatedBy": null,
      "documentTypeUpdatedAt": null,
      "documentTypeDeletedBy": null,
      "documentTypeDeletedAt": null,
      "isDocumentTypeDeleted": 0,
      "documentTypeCurrentVersion": 1,
      "roleDocumentRequirementId": 2,
      "roleDocumentRequirementUniqueId": "348a065d-1886-4145-a457-139b768a7bb0",
      "roleId": 2,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 0,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:07.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "doc_status": "NOT_ATTACHED"
    },
    {
      "attachedDocumentId": null,
      "attachedDocumentUniqueId": null,
      "userUniqueId": null,
      "attachedDocumentDescription": null,
      "documentTypeId": 4,
      "attachedDocumentFileNumber": null,
      "documentExpirationDate": null,
      "attachedDocumentAcceptance": null,
      "attachedDocumentName": null,
      "documentVersion": null,
      "attachedDocumentCreatedByUserId": null,
      "attachedDocumentCreatedAt": null,
      "attachedDocumentAcceptanceReason": null,
      "attachedDocumentAcceptedRejectedByUserId": null,
      "attachedDocumentAcceptedRejectedAt": null,
      "documentTypeUniqueId": "d080a535-45fe-4fa7-bb75-e3e8a2bd85b8",
      "documentTypeName": "Profile Photo",
      "uploadedDocumentName": "profilePhoto",
      "uploadedDocumentTypeId": "profilePhotoTypeId",
      "uploadedDocumentDescription": "profilePhotoDescription",
      "uploadedDocumentExpirationDate": "profilePhotoExpirationDate",
      "uploadedDocumentFileNumber": "profilePhotoFileNumber",
      "documentTypeDescription": "Profile Photo is used to identify current face of user",
      "documentTypeCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "documentTypeCreatedAt": "2026-01-31T11:53:04.000Z",
      "documentTypeUpdatedBy": null,
      "documentTypeUpdatedAt": null,
      "documentTypeDeletedBy": null,
      "documentTypeDeletedAt": null,
      "isDocumentTypeDeleted": 0,
      "documentTypeCurrentVersion": 1,
      "roleDocumentRequirementId": 3,
      "roleDocumentRequirementUniqueId": "180acf9b-8d85-41db-a98c-c890ab273bdf",
      "roleId": 2,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 0,
      "isExpirationDateRequired": 0,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:08.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "doc_status": "NOT_ATTACHED"
    }
  ],
  "requiredDocuments": [
    {
      "roleDocumentRequirementId": 1,
      "roleDocumentRequirementUniqueId": "c60ce1c0-87eb-44fb-bbdb-18424502e4c8",
      "roleId": 2,
      "documentTypeId": 1,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 1,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:06.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "dt_documentTypeId": 1,
      "documentTypeName": "Driver's License",
      "ro_roleId": 2,
      "roleUniqueId": "25fb4e56-d664-433d-b6f0-8f6b7163229c",
      "roleName": "Driver"
    },
    {
      "roleDocumentRequirementId": 2,
      "roleDocumentRequirementUniqueId": "348a065d-1886-4145-a457-139b768a7bb0",
      "roleId": 2,
      "documentTypeId": 2,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 0,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:07.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "dt_documentTypeId": 2,
      "documentTypeName": " Vehicle Registration (librea)",
      "ro_roleId": 2,
      "roleUniqueId": "25fb4e56-d664-433d-b6f0-8f6b7163229c",
      "roleName": "Driver"
    },
    {
      "roleDocumentRequirementId": 3,
      "roleDocumentRequirementUniqueId": "180acf9b-8d85-41db-a98c-c890ab273bdf",
      "roleId": 2,
      "documentTypeId": 4,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 0,
      "isExpirationDateRequired": 0,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "roleDocumentRequirementUpdatedBy": null,
      "roleDocumentRequirementDeletedBy": null,
      "roleDocumentRequirementCreatedAt": "2026-01-31T11:53:08.000Z",
      "roleDocumentRequirementUpdatedAt": null,
      "roleDocumentRequirementDeletedAt": null,
      "dt_documentTypeId": 4,
      "documentTypeName": "Profile Photo",
      "ro_roleId": 2,
      "roleUniqueId": "25fb4e56-d664-433d-b6f0-8f6b7163229c",
      "roleName": "Driver"
    }
  ],
  "subscription": {
    "hasActiveSubscription": true,
    "subscriptionType": "paid",
    "subscriptionDetails": [
      {
        "userSubscriptionId": 1,
        "userSubscriptionUniqueId": "6bcc90de-f580-48fe-b2f4-9626062799f0",
        "driverUniqueId": "b269e36d-1ed1-469d-8d4a-042f53365329",
        "subscriptionPlanPricingUniqueId": "1ee1aa1f-ef8c-4547-ba39-9b90261eb4ef",
        "startDate": "2026-01-31T12:27:36.000Z",
        "endDate": "2026-03-02T12:27:36.000Z",
        "userSubscriptionCreatedBy": "b269e36d-1ed1-469d-8d4a-042f53365329",
        "userSubscriptionUpdatedBy": null,
        "userSubscriptionDeletedBy": null,
        "userSubscriptionCreatedAt": "2026-01-31T12:27:37.000Z",
        "userSubscriptionUpdatedAt": null,
        "userSubscriptionDeletedAt": null,
        "planName": "One month Free",
        "planDescription": "This plan is free for one month",
        "isFree": 1,
        "price": "700.00",
        "effectiveFrom": "2026-01-19T21:00:00.000Z",
        "effectiveTo": "2026-02-18T21:00:00.000Z",
        "subscriptionStatus": "active",
        "daysUntilExpiry": 30
      }
    ],
    "wasRecentlyGranted": true
  },
  "status": 2,
  "reason": "No vehicle registered for this role",
  "banData": null
}

### 3. Register Vehicle

**Endpoint**: `POST /api/user/vehicles/driverUserUniqueId/self`
**Description**: Register a new vehicle for the driver if no vehicle exists in account status
**Authentication**: Driver token required if registered by driver, admin token if registered by admin

**Request Body**:

```json
{
  "vehicleTypeUniqueId": "fddf2911-dfa5-4363-a04f-c82e59536fa4",
  "licensePlate": "3-23A6326 AA",
  "color": "White base red sponda",
  "isDriverOwnerOfVehicle": false
}
````

**Success Response**:

```json
{
  "message": "Vehicle registered successfully",
  "vehicleId": "vehicle-uuid-here"
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or invalid vehicle data
- **401 Unauthorized**: Invalid or missing authentication token
- **403 Forbidden**: Insufficient permissions to register vehicle
- **404 Not Found**: Driver or vehicle type not found
- **409 Conflict**: Vehicle with license plate already exists
- **500 Internal Server Error**: Server error during vehicle registration

from account we can know role document requirement

so we can upload documents for driver verification based on uploadedDocumentName ,uploadedDocumentTypeId,uploadedDocumentFileNumber,uploadedDocumentExpirationDate,uploadedDocumentDescription

### Setting Driver Online/Available Status

**Endpoint**: `POST /api/driver/request`
**Description**: Creates a driver request and automatically searches for nearby shipper requests. If match found, immediately creates journey decision and starts journey.
**Authentication**: Driver token required

**Request Body:**

```json
{
  "currentLocation": {
    "latitude": 9.0204683,
    "longitude": 38.80246,
    "description": "Addis Ababa, Ethiopia"
  }
}
```

**Success Response (Match Found - Waiting for Acceptance):**

```json
{
  "message": "success",
  "status": 2,
  "uniqueIds": {
    "driverRequestUniqueId": "8f66482b-f0f0-4f94-9d7a-d7d0a6d2c894",
    "shipperRequestUniqueId": "f64ca621-8b44-4adc-92a9-dc0767542099",
    "journeyDecisionUniqueId": "68ed97a0-a18d-4a92-b15e-808032f96bf3"
  },
  "driver": {
    "driver": {
      "driverRequestId": 15,
      "driverRequestUniqueId": "8f66482b-f0f0-4f94-9d7a-d7d0a6d2c894",
      "userUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "originLatitude": "9.02046830",
      "originLongitude": "38.80246000",
      "originPlace": "Addis Ababa, Ethiopia",
      "journeyStatusId": 2,
      "isCancellationByPassengerSeenByDriver": "no need to see it",
      "driverRequestUpdatedBy": null,
      "driverRequestDeletedBy": null,
      "driverRequestCreatedAt": "2026-02-02T13:49:38.000Z",
      "driverRequestUpdatedAt": null,
      "driverRequestDeletedAt": null,
      "fullName": "system",
      "phoneNumber": "+251922112480",
      "email": "system@system.com",
      "isNotSelectedSeenByDriver": null,
      "isRejectionByPassengerSeenByDriver": null
    },
    "vehicle": {
      "vehicleDriverId": 2,
      "vehicleDriverUniqueId": "092306df-abb0-4975-b4b6-e51b317a429f",
      "vehicleUniqueId": "386dcb61-7056-4879-9514-62a7ae549c8a",
      "driverUserUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "assignmentStatus": "active",
      "assignmentStartDate": "2026-02-01T15:12:51.000Z",
      "assignmentEndDate": null,
      "vehicleDriverCreatedBy": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "vehicleDriverUpdatedBy": null,
      "vehicleDriverDeletedBy": null,
      "vehicleDriverCreatedAt": "2026-02-01T15:12:51.000Z",
      "vehicleDriverUpdatedAt": "2026-02-01T12:12:51.000Z",
      "vehicleDriverDeletedAt": null,
      "vehicleTypeUniqueId": "366883de-0471-4ac3-a2f7-812681091c05",
      "licensePlate": "3-4322rfc",
      "color": "Whote",
      "vehicleTypeId": 1,
      "vehicleTypeName": "Isuzu FSR",
      "vehicleTypeIconName": null,
      "vehicleTypeDescription": null,
      "vehicleTypeCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "vehicleTypeUpdatedBy": null,
      "carryingCapacity": 100,
      "vehicleTypeUpdatedAt": null,
      "vehicleTypeCreatedAt": "2026-02-01T06:35:12.000Z",
      "vehicleTypeDeletedAt": null
    }
  },
  "shipper": {
    "userId": 4,
    "userUniqueId": "81055b1e-fd8e-4efb-9c0c-af9be907bda7",
    "fullName": "Birhanu Gardie",
    "phoneNumber": "+251922112481",
    "email": null,
    "userCreatedAt": "2026-02-01T07:39:27.000Z",
    "userCreatedBy": "system",
    "userDeletedAt": null,
    "userDeletedBy": null,
    "isDeleted": 0,
    "shipperRequestId": 144,
    "shipperRequestUniqueId": "f64ca621-8b44-4adc-92a9-dc0767542099",
    "shipperRequestBatchId": "32ebe525-291c-4e10-953f-4440ae10da69",
    "vehicleTypeUniqueId": "366883de-0471-4ac3-a2f7-812681091c05",
    "journeyStatusId": 2,
    "originLatitude": "9.00735000",
    "originLongitude": "38.85261830",
    "originPlace": "Yeka Bole Bota, Bole, Addis Ababa, 7898, Ethiopia",
    "destinationLatitude": "11.85000000",
    "destinationLongitude": "38.36667000",
    "destinationPlace": "Gayint, South Gonder, Amhara Region, Ethiopia",
    "shipperRequestCreatedAt": "2026-02-02T08:03:28.000Z",
    "shippableItemName": "Vccc",
    "shippableItemQtyInQuintal": "90.00",
    "shippingDate": "2026-02-02T05:01:09.000Z",
    "deliveryDate": "2026-02-02T05:01:09.000Z",
    "shippingCost": "45000.00",
    "isCompletionSeen": 0,
    "shipperRequestCreatedBy": "81055b1e-fd8e-4efb-9c0c-af9be907bda7",
    "shipperRequestCreatedByRoleId": 1,
    "shipperRequestUpdatedBy": null,
    "shipperRequestDeletedBy": null,
    "shipperRequestUpdatedAt": null,
    "shipperRequestDeletedAt": null
  },
  "journey": null,
  "decision": {
    "journeyDecisionUniqueId": "68ed97a0-a18d-4a92-b15e-808032f96bf3",
    "shipperRequestId": 144,
    "driverRequestId": 15,
    "journeyStatusId": 2,
    "decisionTime": "2026-02-02 16:49:39",
    "decisionBy": "driver",
    "journeyDecisionCreatedBy": "02069e59-6b22-4d45-8158-4adcacdbea11",
    "journeyDecisionCreatedAt": "2026-02-02 16:49:39"
  }
}
```

**Error Responses**:

- **400 Bad Request**: Missing location data or invalid request format
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver account suspended or not verified
- **404 Not Found**: Driver not found or no active vehicle
- **409 Conflict**: Driver already has an active request
- **500 Internal Server Error**: Server error during request creation

### Setting Driver Offline/Unavailable Status

**Endpoint**: `DELETE /api/driver/cancelDriverRequest`
**Description**: Cancels the active driver request, making the driver unavailable for new shipper requests
**Authentication**: Driver token required
**Query Parameters:**

- `ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2`

**Success Response:**

```json
{
  "status": 15,
  "message": "success",
  "data": "You have successfully cancelled your request."
}
```

**Error Responses**:

- **400 Bad Request**: Invalid query parameters or cancellation reason
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not authorized to cancel this request
- **404 Not Found**: Active driver request not found
- **409 Conflict**: Cannot cancel request in current status (e.g., already in journey)
- **500 Internal Server Error**: Server error during cancellation

### Verify Driver Journey Status

**Endpoint**: `GET /api/driver/verifyDriverJourneyStatus`
**Description**: Verify if driver is currently in a journey or available for new requests
**Authentication**: Driver token required

**Success Response (No Active Requests):**

```json
{
  "message": "success",
  "data": "No active requests found for this driver",
  "status": null,
  "vehicle": {
    "vehicleDriverId": 2,
    "vehicleDriverUniqueId": "092306df-abb0-4975-b4b6-e51b317a429f",
    "vehicleUniqueId": "386dcb61-7056-4879-9514-62a7ae549c8a",
    "driverUserUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
    "assignmentStatus": "active",
    "assignmentStartDate": "2026-02-01T15:12:51.000Z",
    "assignmentEndDate": null,
    "vehicleDriverCreatedBy": "02069e59-6b22-4d45-8158-4adcacdbea11",
    "vehicleDriverUpdatedBy": null,
    "vehicleDriverDeletedBy": null,
    "vehicleDriverCreatedAt": "2026-02-01T15:12:51.000Z",
    "vehicleDriverUpdatedAt": "2026-02-01T12:12:51.000Z",
    "vehicleDriverDeletedAt": null,
    "vehicleTypeUniqueId": "366883de-0471-4ac3-a2f7-812681091c05",
    "licensePlate": "3-4322rfc",
    "color": "Whote",
    "vehicleTypeId": 1,
    "vehicleTypeName": "Isuzu FSR",
    "vehicleTypeIconName": null,
    "vehicleTypeDescription": null,
    "vehicleTypeCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
    "vehicleTypeUpdatedBy": null,
    "carryingCapacity": 100,
    "vehicleTypeUpdatedAt": null,
    "vehicleTypeCreatedAt": "2026-02-01T06:35:12.000Z",
    "vehicleTypeDeletedAt": null
  }
}
```

**Success Response (Has Request and Matched with Shipper):**

```json
{
  "message": "success",
  "status": 2,
  "uniqueIds": {
    "driverRequestUniqueId": "8f66482b-f0f0-4f94-9d7a-d7d0a6d2c894",
    "shipperRequestUniqueId": "f64ca621-8b44-4adc-92a9-dc0767542099",
    "journeyDecisionUniqueId": "68ed97a0-a18d-4a92-b15e-808032f96bf3"
  },
  "driver": {
    "driver": {
      "driverRequestId": 15,
      "driverRequestUniqueId": "8f66482b-f0f0-4f94-9d7a-d7d0a6d2c894",
      "userUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "originLatitude": "9.02046830",
      "originLongitude": "38.80246000",
      "originPlace": "Addis Ababa, Ethiopia",
      "journeyStatusId": 2,
      "isCancellationByPassengerSeenByDriver": "no need to see it",
      "driverRequestUpdatedBy": null,
      "driverRequestDeletedBy": null,
      "driverRequestCreatedAt": "2026-02-02T13:49:38.000Z",
      "driverRequestUpdatedAt": null,
      "driverRequestDeletedAt": null,
      "fullName": "system",
      "phoneNumber": "+251922112480",
      "email": "system@system.com",
      "isNotSelectedSeenByDriver": "no need to see it",
      "isRejectionByPassengerSeenByDriver": "no need to see it",
      "driverProfilePhoto": "https://transport.masetawosha.com/uploads/2_2bbdf07b-59f0-4372-8d60-96d2aa9a520b.png"
    },
    "vehicle": {
      "vehicleDriverId": 2,
      "vehicleDriverUniqueId": "092306df-abb0-4975-b4b6-e51b317a429f",
      "vehicleUniqueId": "386dcb61-7056-4879-9514-62a7ae549c8a",
      "driverUserUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "assignmentStatus": "active",
      "assignmentStartDate": "2026-02-01T15:12:51.000Z",
      "assignmentEndDate": null,
      "vehicleDriverCreatedBy": "02069e59-6b22-4d45-8158-4adcacdbea11",
      "vehicleDriverUpdatedBy": null,
      "vehicleDriverDeletedBy": null,
      "vehicleDriverCreatedAt": "2026-02-01T15:12:51.000Z",
      "vehicleDriverUpdatedAt": "2026-02-01T12:12:51.000Z",
      "vehicleDriverDeletedAt": null,
      "vehicleTypeUniqueId": "366883de-0471-4ac3-a2f7-812681091c05",
      "licensePlate": "3-4322rfc",
      "color": "Whote",
      "vehicleTypeId": 1,
      "vehicleTypeName": "Isuzu FSR",
      "vehicleTypeIconName": null,
      "vehicleTypeDescription": null,
      "vehicleTypeCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "vehicleTypeUpdatedBy": null,
      "carryingCapacity": 100,
      "vehicleTypeUpdatedAt": null,
      "vehicleTypeCreatedAt": "2026-02-01T06:35:12.000Z",
      "vehicleTypeDeletedAt": null
    }
  },
  "shipper": {
    "shipperRequestId": 144,
    "shipperRequestUniqueId": "f64ca621-8b44-4adc-92a9-dc0767542099",
    "userUniqueId": "81055b1e-fd8e-4efb-9c0c-af9be907bda7",
    "shipperRequestBatchId": "32ebe525-291c-4e10-953f-4440ae10da69",
    "vehicleTypeUniqueId": "366883de-0471-4ac3-a2f7-812681091c05",
    "journeyStatusId": 2,
    "originLatitude": "9.00735000",
    "originLongitude": "38.85261830",
    "originPlace": "Yeka Bole Bota, Bole, Addis Ababa, 7898, Ethiopia",
    "destinationLatitude": "11.85000000",
    "destinationLongitude": "38.36667000",
    "destinationPlace": "Gayint, South Gonder, Amhara Region, Ethiopia",
    "shipperRequestCreatedAt": "2026-02-02T08:03:28.000Z",
    "shippableItemName": "Vccc",
    "shippableItemQtyInQuintal": "90.00",
    "shippingDate": "2026-02-02T05:01:09.000Z",
    "deliveryDate": "2026-02-02T05:01:09.000Z",
    "shippingCost": "45000.00",
    "isCompletionSeen": 0,
    "shipperRequestCreatedBy": "81055b1e-fd8e-4efb-9c0c-af9be907bda7",
    "shipperRequestCreatedByRoleId": 1,
    "shipperRequestUpdatedBy": null,
    "shipperRequestDeletedBy": null,
    "shipperRequestUpdatedAt": null,
    "shipperRequestDeletedAt": null,
    "userId": 4,
    "fullName": "Birhanu Gardie",
    "phoneNumber": "+251922112481",
    "email": null,
    "userCreatedAt": "2026-02-01T07:39:27.000Z",
    "userCreatedBy": "system",
    "userDeletedAt": null,
    "userDeletedBy": null,
    "isDeleted": 0
  },
  "journey": null,
  "decision": {
    "journeyDecisionId": 70,
    "journeyDecisionUniqueId": "68ed97a0-a18d-4a92-b15e-808032f96bf3",
    "shipperRequestId": 144,
    "driverRequestId": 15,
    "journeyStatusId": 2,
    "decisionTime": "2026-02-02T13:49:39.000Z",
    "decisionBy": "driver",
    "shippingDateByDriver": null,
    "deliveryDateByDriver": null,
    "shippingCostByDriver": null,
    "isNotSelectedSeenByDriver": "no need to see it",
    "isCancellationByDriverSeenByPassenger": "no need to see it",
    "isRejectionByPassengerSeenByDriver": "no need to see it",
    "journeyDecisionCreatedBy": "02069e59-6b22-4d45-8158-4adcacdbea11",
    "journeyDecisionUpdatedBy": null,
    "journeyDecisionDeletedBy": null,
    "journeyDecisionCreatedAt": "2026-02-02T13:49:39.000Z",
    "journeyDecisionUpdatedAt": null,
    "journeyDecisionDeletedAt": null
  }
}
```

**Error Responses**:

- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver account suspended or not verified
- **404 Not Found**: Driver not found
- **500 Internal Server Error**: Server error during status verification

### Location Updates

**Endpoint**: `POST /api/journeyRoutePoints`
**Description**: Send updated GPS location during journey for tracking and route recording
**Authentication**: Driver token required

**Request Body:**

```json
{
  "journeyDecisionUniqueId": "uuid-here",
  "latitude": 9.012345,
  "longitude": 38.712345
}
```

**Success Response:**

```json
{
  "message": "success",
  "data": "Location updated successfully"
}
```

**Error Responses**:

- **400 Bad Request**: Missing location coordinates or invalid journey ID
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not part of this journey or journey not active
- **404 Not Found**: Journey or driver request not found
- **409 Conflict**: Journey already completed or cancelled
- **500 Internal Server Error**: Server error during location update

## Driver Dashboard

### Driver Notifications

Drivers receive real-time notifications through WebSocket connections and can verify their status using the verifyDriverJourneyStatus endpoint. Available requests are handled through the automatic matching system when drivers go online.

**For accepting matched requests, use:** `PUT /api/driver/acceptPassengerRequest`

**Error Responses**:

- **400 Bad Request**: Missing required fields or invalid request data
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not authorized for this request or request not assigned to driver
- **404 Not Found**: Passenger request or driver request not found
- **409 Conflict**: Request already accepted by another driver or in invalid status
- **500 Internal Server Error**: Server error during request acceptance

### Manual Request Acceptance

**Endpoint**: `POST /api/driver/createAndAcceptNewRequest`
**Description**: Allows drivers to manually create and accept shipper requests that were not auto-matched (outside distance range). Drivers can participate in requests beyond their normal search radius.
**Authentication**: Driver token required

**Request Body:**

```json
{
  "shipperRequestUniqueId": "3605efdb-45f2-4ecf-ad8e-bb14ddee3cd5",
  "shippingCostByDriver": "58000.00",
  "currentLocation": {
    "latitude": 9.007053,
    "longitude": 38.868049,
    "description": "in eth addis"
  }
}
```

**Success Response:**

```json
{
    "message": "success",
    "status": 3,
    "uniqueIds": {
        "driverRequestUniqueId": "uuid-here",
        "journeyDecisionUniqueId": "uuid-here"
    },
    "driver": {...},
    "shipper": {...},
    "decision": {...}
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or request not in negative status
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver request does not belong to this user
- **404 Not Found**: Driver request or journey decision not found
- **500 Internal Server Error**: Server error during status update

**For canceling active requests, use:** `DELETE /api/driver/cancelDriverRequest?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2`

### Mark Negative Status as Seen

**Endpoint**: `PUT /api/driver/markNegativeStatusAsSeen`
**Description**: Allows drivers to mark negative notifications as seen. Handles multiple negative statuses: not selected in bid, rejected by shipper, cancelled by shipper, cancelled by admin, or cancelled by system.
**Authentication**: Driver token required

**Request Body:**

```json
{
  "driverRequestUniqueId": "2e957815-a749-4fa3-8a26-b2ce338a24af"
}
```

**Success Response:**

```json
{
  "message": "success",
  "data": "not selected in bid notification marked as seen"
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or request not in negative status
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver request does not belong to this user
- **404 Not Found**: Driver request or journey decision not found
- **500 Internal Server Error**: Server error during status update

**For canceling active requests, use:** `DELETE /api/driver/cancelDriverRequest?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2`

### Street Pickup Requests

**Endpoint**: `POST /api/driver/takeFromStreet`
**Description**: Allows drivers to create shipper requests for street pickups. Drivers can create requests on behalf of shippers they meet on the street who don't have the app.
**Authentication**: Driver token required

**Request Body:**

```json
{
  "phoneNumber": "+251922222229",
  "destination": {
    "latitude": "9.8",
    "longitude": "38.9",
    "description": "Addis Ababa, Ethiopia"
  },
  "vehicle": {
    "vehicleTypeUniqueId": "4b35462c-1da3-4639-8371-10c311ba8c03"
  },
  "originLocation": {
    "latitude": 9.0042278,
    "longitude": 38.8661227,
    "description": "Diredawa, Ethiopia"
  },
  "currentLocation": {
    "latitude": 9.0042278,
    "longitude": 38.8661227,
    "description": "Diredawa, Ethiopia"
  },
  "shipperRequestBatchId": "uuidv4-8900-uiuip-9090-989800-08991",
  "shippableItemName": "cement",
  "shippableItemQtyInQuintal": 450,
  "shippingDate": "2025-10-10:21:19:21",
  "deliveryDate": "2025-10-10:21:19:21",
  "shippingCost": 40000
}
```

**Success Response:**

```json
{
  "message": "success",
  "status": 1,
  "shipperRequestUniqueId": "uuid-here",
  "shipperRequestBatchId": "uuid-here",
  "shipper": {
    "phoneNumber": "+251922222229",
    "fullName": "Street Passenger"
  }
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or invalid data format
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not authorized to create street requests
- **409 Conflict**: Duplicate request or shipper phone number already exists
- **500 Internal Server Error**: Server error during request creation

## Journey Management

### Start Journey

**Endpoint**: `PUT /api/driver/startJourney`
**Description**: Officially start a journey after accepting a shipper request
**Authentication**: Driver token required

**Request Body:**

```json
{
  "journeyDecisionUniqueId": "uuid-here",
  "latitude": 9.012345,
  "longitude": 38.712345
}
```

**Response:**

```json
{
    "message": "success",
    "status": 5,
    "data": {
        "journeyUniqueId": "journey-uuid",
        "driver": {...},
        "shipper": {...},
        "journey": {...}
    }
}
```

**Error Responses**:

- **400 Bad Request**: Missing journey ID or location coordinates
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not authorized for this journey or journey not in accepted status
- **404 Not Found**: Journey decision or driver request not found
- **409 Conflict**: Journey already started or in invalid status
- **500 Internal Server Error**: Server error during journey start

### Complete Journey

**Endpoint**: `PUT /api/driver/completeJourney`
**Description**: Complete a journey after delivering the goods to the destination
**Authentication**: Driver token required

**Request Body:**

```json
{
  "journeyDecisionUniqueId": "uuid-here",
  "shipperRequestUniqueId": "uuid-here",
  "driverRequestUniqueId": "uuid-here",
  "journeyUniqueId": "uuid-here",
  "latitude": 9.012345,
  "longitude": 38.712345
}
```

**Success Response:**

```json
{
    "message": "success",
    "status": 6,
    "data": {
        "journeyUniqueId": "journey-uuid",
        "completionTime": "2026-01-31T15:30:00.000Z",
        "driver": {...},
        "shipper": {...},
        "journey": {...}
    }
}
```

**Error Responses**:

- **400 Bad Request**: Missing required IDs or location coordinates
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Driver not authorized for this journey or journey not in started status
- **404 Not Found**: Journey, driver request, or shipper request not found
- **409 Conflict**: Journey already completed or in invalid status
- **500 Internal Server Error**: Server error during journey completion

### Driver Request History

**Endpoint**: `GET /api/user/getDriverRequest`
**Description**: Get driver request history with filtering options. Used for viewing completed journeys and request history.
**Authentication**: Driver token required

**Query Parameters:**

- `target=single` - Get single request or `all` for multiple
- `journeyStatusIds=6` - Filter by journey status (6 = completed)
- `driverUserUniqueId=self` - Current user's requests
- `page=1` - Page number (default: 1)
- `limit=10` - Results per page (default: 10)
- `startDate=2026-01-01` - Filter by start date
- `endDate=2026-01-31` - Filter by end date
- `sortBy=createdAt` - Sort field
- `sortOrder=desc` - Sort direction (asc/desc)

**Success Response:**

```json
{
  "message": "success",
  "data": [
    {
      "driverRequestId": 15,
      "driverRequestUniqueId": "uuid-here",
      "journeyStatusId": 6,
      "originLatitude": "9.02046830",
      "originLongitude": "38.80246000",
      "originPlace": "Addis Ababa, Ethiopia",
      "driverRequestCreatedAt": "2026-02-02T13:49:38.000Z",
      "shipper": {
        "shipperRequestId": 144,
        "shipperRequestUniqueId": "uuid-here",
        "fullName": "Birhanu Gardie",
        "phoneNumber": "+251922112481",
        "destinationPlace": "Gayint, South Gonder, Amhara Region, Ethiopia",
        "shippableItemName": "Vccc",
        "shippingCost": "45000.00"
      },
      "journey": {
        "journeyId": 25,
        "journeyUniqueId": "uuid-here",
        "journeyStartedAt": "2026-02-02T14:30:00.000Z",
        "journeyCompletedAt": "2026-02-02T16:45:00.000Z"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalRecords": 47,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid query parameters
- **401 Unauthorized**: Invalid or missing driver token
- **403 Forbidden**: Not authorized to view these requests
- **500 Internal Server Error**: Server error during request retrieval

### Passenger No Answer Report

**Endpoint**: `PUT /api/shipper/noAnswerFromDriver`
**Description**: Allows shippers to report when a driver doesn't answer their request. Updates driver status to "no answer" and creates new shipper request if needed.
**Authentication**: Passenger token required

**Request Body:**

```json
{
  "shipperRequestUniqueId": "f64ca621-8b44-4adc-92a9-dc0767542099",
  "driverRequestUniqueId": "8f66482b-f0f0-4f94-9d7a-d7d0a6d2c894"
}
```

**Success Response:**

```json
{
  "message": "success",
  "status": 1,
  "data": "driver_not_answered"
}
```

**Error Responses**:

- **400 Bad Request**: Missing required fields or invalid request status
- **401 Unauthorized**: Invalid or missing shipper token
- **403 Forbidden**: Not authorized to report this request
- **404 Not Found**: Passenger request or driver request not found
- **409 Conflict**: Driver already answered or request in invalid status
- **500 Internal Server Error**: Server error during no answer processing

**Payment Transactions**

**Description**: View payment transactions
**Authentication**: Driver token required
