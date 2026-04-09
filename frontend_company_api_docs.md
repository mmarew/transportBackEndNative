# Corporate Freight & Company Management API Guide

This comprehensive API documentation is designed for Frontend Developers integrating the corporate freight bidding layout. It outlines the complete CRUD (Create, Read, Update, Delete) operations across all company modules: **Companies, Roles, Memberships, Fleet (Vehicles), Bids, and Assignments**.

> [!IMPORTANT]
> **Authentication:** All requests MUST include the header `Authorization: Bearer <jwt_error>`.
> **Pagination & Filtering:** Most `GET` endpoints support `?page=1&limit=10` along with specific ID filters.
> **Standard Response Format**: 
> ```json
> {
>   "message": "success",
>   "data": { ... }, // Object or Array
>   "pagination": { "currentPage": 1, "totalPages": 5, "totalItems": 45, "hasNext": true } // Included on GET endpoints
> }
> ```

---

## 1. Transport Company Management (`/api/company/companies`)

Allows admins to manage the actual transporting company entities.

### Create Company
- **Method**: `POST` | **Endpoint**: `/api/company/companies`
- **Payload**:
  ```json
  {
    "companyName": "Ethio Freight Logistics",
    "companyRegistrationNumber": "ET-12345",
    "companyPhone": "+251911234567",
    "companyEmail": "contact@ethiofreight.com",
    "companyAddress": "Addis Ababa"
  }
  ```

### Get All / Search Companies
- **Method**: `GET` | **Endpoint**: `/api/company/companies`
- **Query Params**: `?page=1&limit=10&companyName=Ethio&approvalStatus=approved`

### Update Company
- **Method**: `PATCH` | **Endpoint**: `/api/company/companies/:companyUniqueId`
- **Payload**: Any combination of the fields used in Create (e.g. `{"companyPhone": "+2519000000"}`).

### Delete Company
- **Method**: `DELETE` | **Endpoint**: `/api/company/companies/:companyUniqueId`

---

## 2. Company Roles (`/api/company/roles`)

Customizable RBAC (Role Based Access Control) internal to the company (e.g. Dispatcher, Viewer).

### Create Role
- **Method**: `POST` | **Endpoint**: `/api/company/roles`
- **Payload**:
  ```json
  {
    "companyRoleName": "Senior Dispatcher",
    "companyRoleDescription": "Can bid and assign drivers."
  }
  ```

### Get Roles
- **Method**: `GET` | **Endpoint**: `/api/company/roles`
- **Query Params**: `?companyRoleUniqueId=UUID`

### Update Role
- **Method**: `PUT` | **Endpoint**: `/api/company/roles/:companyRoleUniqueId`
- **Payload**: Same fields as Create.

### Delete Role
- **Method**: `DELETE` | **Endpoint**: `/api/company/roles/:companyRoleUniqueId`

---

## 3. Memberships (Drivers & Staff) (`/api/company/memberships`)

Linking users (Drivers, Dispatchers) under a specific company envelope.

### Assign Member (Driver/Staff) to Company
- **Method**: `POST` | **Endpoint**: `/api/company/memberships/:userUniqueId`
- **Payload**:
  ```json
  {
    "companyUniqueId": "UUID_OF_COMPANY",
    "companyRoleUniqueId": "UUID_OF_ROLE" // Optional
  }
  ```

### View Members / Search
- **Method**: `GET` | **Endpoint**: `/api/company/memberships`
- **Query Params**: `?companyUniqueId=UUID&isActive=true&userUniqueId=UUID`

### Deactivate Member
- **Method**: `PATCH` | **Endpoint**: `/api/company/memberships/:membershipUniqueId/deactivate`

### Delete/Remove Member
- **Method**: `DELETE` | **Endpoint**: `/api/company/memberships/:membershipUniqueId`

---

## 4. Corporate Fleet (Vehicles) (`/api/company/fleet`)

Registering specific vehicles that belong to the transport company.

### Assign Vehicle to Company Fleet
- **Method**: `POST` | **Endpoint**: `/api/company/fleet`
- **Payload**:
  ```json
  {
    "companyUniqueId": "UUID_OF_COMPANY",
    "vehicleUniqueId": "UUID_OF_VEHICLE"
  }
  ```

### View Fleet / Search
- **Method**: `GET` | **Endpoint**: `/api/company/fleet`
- **Query Params**: `?companyUniqueId=UUID&vehicleUniqueId=UUID`

### Remove Vehicle from Fleet
- **Method**: `DELETE` | **Endpoint**: `/api/company/fleet/:companyVehicleUniqueId`

---

## 5. Bidding & Freight Load Acquisition (`/api/company/bids`)

Where the core interactions with standard Shippers occur. 

### Submit a Bid 
- **Method**: `POST` | **Endpoint**: `/api/company/bids`
- **Payload**:
  ```json
  {
    "passengerRequestBatchId": "UUID_OF_SHIPPER_BATCH",
    "numberOfVehiclesOffered": 2,
    "vehicleTypeUniqueId": "UUID_OF_TRUCK",
    "proposedCostPerVehicle": 5000,
    "bidNotes": "Departing immediately"
  }
  ```

### Get Bids / Monitor Status
- **Method**: `GET` | **Endpoint**: `/api/company/bids`
- **Query Params**: `?bidStatus=accepted_by_shipper&passengerRequestBatchId=UUID`

### Update Bid Status (usually Shipper Accept/Reject)
- **Method**: `PATCH` | **Endpoint**: `/api/company/bids/:companyBidRequestUniqueId/status`
- **Payload**:
  ```json
  { "bidStatus": "cancelled_by_company" }
  ```

### Delete/Withdraw Bid
- **Method**: `DELETE` | **Endpoint**: `/api/company/bids/:companyBidRequestUniqueId`

---

## 6. Driver Assignments (`/api/company/assignments`)

Mapping your company's drivers logically onto winning bid slots.

### Assign Driver to Slot 
- **Method**: `POST` | **Endpoint**: `/api/company/assignments`
- **Payload**:
  ```json
  {
    "companyBidRequestUniqueId": "UUID_OF_THE_ACCEPTED_BID",
    "passengerRequestUniqueId": "UUID_OF_SPECIFIC_FREIGHT_SLOT",
    "vehicleUniqueId": "UUID_OF_COMPANY_VEHICLE",
    "driverUserUniqueId": "UUID_OF_COMPANY_DRIVER"
  }
  ```

### View Assignments / Search
- **Method**: `GET` | **Endpoint**: `/api/company/assignments`
- **Query Params**: `?companyBidRequestUniqueId=UUID&assignmentStatus=assigned`

### Update Assignment Status (Driver Confirmation)
- **Method**: `PATCH` | **Endpoint**: `/api/company/assignments/:assignmentUniqueId/status`
- **Payload**:
  ```json
  {
    "assignmentStatus": "confirmed_by_driver",
    "originLatitude": 8.9806,      // Required for driver confirmation mapping
    "originLongitude": 38.7578,
    "originPlace": "Addis Ababa"
  }
  ```
> **Response Handling:** This endpoint returns `journeyDecisionUniqueId` deeply nested under `data`. Your frontend MUST cache `journeyDecisionUniqueId` because it is strictly required to subsequently call standard routes like `PUT /api/driver/startJourney`.

### Delete/Recall Assignment
- **Method**: `DELETE` | **Endpoint**: `/api/company/assignments/:assignmentUniqueId`
