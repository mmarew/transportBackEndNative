# User Management

Complete guide to user registration, verification, and profile management.

## User Registration Flow

### 1. Create User Account

**Endpoint**: `POST /api/user/createUser`
**Description**: Register a new user (shipper or driver)
**Authentication**: None required

**Request Body**:

```json
{
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "roleId": 1,
  "statusId": 1
}
```

**Response**:

```json
{
  "status": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "fullName": "John Doe",
    "phoneNumber": "+1234567890",
    "userCreatedAt": "2026-01-31T12:00:00.000Z"
  },
  "messageDetail": "User created successfully, but OTP SMS could not be sent..."
}
```

### 2. Verify User with OTP

**Endpoint**: `POST /api/user/verifyUserByOTP`
**Description**: Verify phone number using SMS OTP
**Authentication**: None required

**Request Body**:

```json
{
  "roleId": 1,
  "OTP": "123456",
  "phoneNumber": "+1234567890"
}
```

**Response**:

```json
{
  "token": "jwt-token-here",
  "message": "success",
  "data": "OTP verified successfully"
}
```

### 3. User Login

**Endpoint**: `POST /api/user/loginUser`
**Description**: Authenticate user with phone number and role
**Authentication**: None required

**Request Body**:

```json
{
  "phoneNumber": "+251983222221",
  "roleId": 6,
  "statusId": 1
}
```

**Response**:

```json
{
  "token": "jwt-token-here",
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "fullName": "User Name",
    "phoneNumber": "+251983222221",
    "roleId": 6,
    "statusId": 1
  }
}
```

## Admin User Management

### 1.1 Create Admin User

**Endpoint**: `POST /api/admin/createUserByAdminOrSuperAdmin`
**Description**: Creates a new user with admin privileges. Requires Super Admin authentication.
**Authentication**: Super Admin token required
**Request Body**:

```json
{
  "fullName": "Birhanu Gardie",
  "phoneNumber": "+251910185606",
  "email": "birie@gmail.com",
  "roleId": 3,
  "statusId": 1,
  "userRoleStatusDescription": "an admin can have a role of managing driver shipper etc."
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "ef226a60-08d1-4b0e-aaa6-de3f26d67d94",
    "fullName": "Birhanu Gardie",
    "phoneNumber": "+251910185606",
    "email": "birie@gmail.com",
    "userCreatedAt": "2026-01-31 15:03:39",
    "userCreatedBy": "f51c5673-b309-4837-9967-ed74b3d02ff2"
  }
}
```

### 1.2 Verify Admin User by OTP

**Endpoint**: `POST /api/user/verifyUserByOTP`
**Description**: Verifies an admin user's phone number using OTP sent during registration.
**Authentication**: None (OTP verification)
**Request Body**:

```json
{
  "roleId": 3,
  "OTP": 101010,
  "phoneNumber": "+251910185606"
}
```

**Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJVbmlxdWVJZCI6ImVmMjI2YTYwLTA4ZDEtNGIwZS1hYWE2LWRlM2YyNmQ2N2Q5NCIsImZ1bGxOYW1lIjoiQmlyaGFudSBHYXJkaWUiLCJwaG9uZU51bWJlciI6IisyNTE5MTAxODU2MDYiLCJlbWFpbCI6ImJpcmllQGdtYWlsLmNvbSIsInJvbGVJZCI6M319sImlhdCI6MTc2OTg3MTg0OX0.5wKgVhR5OJ-P5uzaK4QOg3Yyd60H465p2y4izxyoB60",
  "message": "success",
  "data": "OTP verified successfully"
}
```

> **Important**: Store the JWT token in localStorage (browsers), AsyncStorage (React Native), or environment variables (Postman). Include this token in the Authorization header as `Bearer <token>` for all subsequent admin API calls.

### Get Users by Filter

**Endpoint**: `GET /api/admin/getUserByFilterDetailed?page=1&limit=10`
**Description**: Search and filter users by various criteria with pagination
**Authentication**: Admin token required

**Query Parameters**:

- `page`: Page number for pagination (default: 1)
- `limit`: Number of results per page (default: 10)
- `fullName`: Filter by user name (optional)
- `phoneNumber`: Filter by phone number (optional)
- `email`: Filter by email address (optional)
- `roleId`: Filter by role ID (optional)
- `statusId`: Filter by status ID (optional)
- `startDate`: Filter users created from date (YYYY-MM-DD)
- `endDate`: Filter users created to date (YYYY-MM-DD)

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "userUniqueId": "e4174857-7242-46a4-a8d3-c640b7a10e70",
      "fullName": "John Doe",
      "phoneNumber": "+251983222221",
      "email": "john@example.com",
      "roleId": 1,
      "statusId": 1,
      "userCreatedAt": "2026-01-31T12:00:00.000Z",
      "userCreatedBy": "admin-uuid-here",
      "roleName": "Shipper",
      "statusName": "Active"
    },
    {
      "userUniqueId": "f51c5673-b309-4837-9967-ed74b3d02ff2",
      "fullName": "Jane Smith",
      "phoneNumber": "+251983222222",
      "email": "jane@example.com",
      "roleId": 2,
      "statusId": 1,
      "userCreatedAt": "2026-01-31T13:00:00.000Z",
      "userCreatedBy": "admin-uuid-here",
      "roleName": "Driver",
      "statusName": "Active"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 47,
    "itemsPerPage": 10,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "page": 1,
    "limit": 10,
    "appliedFilters": {}
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid query parameters
- **401 Unauthorized**: Invalid or missing admin token
- **403 Forbidden**: Not authorized to access user data
- **500 Internal Server Error**: Server error during retrieval

**Example Usage**:

```
GET /api/admin/getUserByFilterDetailed?page=1&limit=10&roleId=1&statusId=1
GET /api/admin/getUserByFilterDetailed?fullName=John&phoneNumber=251983222221
GET /api/admin/getUserByFilterDetailed?startDate=2026-01-01&endDate=2026-01-31
```

## Regular User Management

### 3. Create Regular User shipper

**Endpoint**: `POST /api/user/createUser`
**Description**: Creates a new shipper or driver user.
**Request Body**:

```json
{
  "fullName": "user 81 ",
  "phoneNumber": "+251922112481",
  // "email": "mabebawumolla8322@gmail.com",
  "roleId": 1,
  "statusId": 1
}
```

**Response**:

```json
{
  "status": "success",
  "data": {
    "userUniqueId": "7cf1250c-6b07-422b-b3fe-84144f9e7055",
    "fullName": "user 81 ",
    "phoneNumber": "+251922112481",
    "userCreatedAt": "2026-01-31 15:05:53",
    "userCreatedBy": "system"
  },
  "messageDetail": "User created successfully, but OTP SMS could not be sent: SMS API Error: 401 - \"Unauthorized (401-9) : Account balance is too low. Please refill or contact support.\"",
  "message": "success"
}
```

## User Profile Management

### Update Profile

**Endpoint**: `POST /api/user/profile`
**Description**: Update user profile information
**Authentication**: User token required

### Update User Data

**Endpoint**: `POST /api/user/updateUser/{userUniqueId}`
**Description**: Updates user profile information. This endpoint includes automated security flows for contact information changes.
**Authentication**: User token required

**Request Body**:

```json
{
  "fullName": "Updated User Name",
  "phoneNumber": "+251983222222",
  "email": "updated@example.com",
  "roleId": 1,
  "statusId": 1
}
```

#### Security & Verification Logic

When contact information is updated, the system triggers a security lifecycle:

1.  **Verification Reset**: Changing the `phoneNumber` or `email` automatically resets the corresponding verification flag (`isPhoneVerified` or `isEmailVerified`) to `false`.
2.  **Credential Refresh**:
    - **Phone Change**: A new `phoneVerificationOTP` is generated and hashed in the database.
    - **Email Change**: A new `emailVerificationToken` is generated (valid for 2 hours).
3.  **Automatic Dispatch**:
    - **SMS**: The system immediately attempts to send an SMS OTP to the new phone number.
    - **Email**: The system immediately attempts to send a Verification Link to the new email address (Base URL: `https://dynamicsroute.tech`).
4.  **Token Synchronization**: The response includes a **new JWT token**. This token contains the updated (unverified) flags and the new contact values. The client MUST update its local storage with this new token.

**Response**:

```json
{
  "token": "new-jwt-token-here",
  "message": "success",
  "data": "User updated successfully"
}
```

**Error Responses**:

- **400 Bad Request**: Invalid user data or missing required fields
- **401 Unauthorized**: Invalid or missing user token
- **403 Forbidden**: Not authorized to update this user
- **404 Not Found**: User not found
- **500 Internal Server Error**: Server error during update

### Delete User

**Endpoint**: `DELETE /api/user/deleteUser/{userUniqueId}`
**Description**: Permanently delete a user account by user unique ID
**Authentication**: User token required (own account) or Admin token (any user)

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "fd82aca9-4a3d-44bc-a7d8-8f8c18a51e74",
    "deletedAt": "2026-02-03T09:19:00.000Z",
    "deletedBy": "user-uuid-here"
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid user unique ID format
- **401 Unauthorized**: Invalid or missing token
- **403 Forbidden**: Not authorized to delete this user
- **404 Not Found**: User not found
- **409 Conflict**: User cannot be deleted (active journeys, pending payments, etc.)
- **500 Internal Server Error**: Server error during deletion

### Email Verification Flows (Junior Developer Guide)

#### **1. Successful Email Verification (Happy Path)**

1.  **Trigger**: User clicks the button in the verification email.
2.  **Logic**: The backend (`verifyEmailByToken`) checks if the UUID token is valid and hasn't expired (2-hour limit).
3.  **Real-time Update**:
    - The backend marks the email as verified.
    - **WebSocket Broadcast**: It identifies all active roles for the user (Shipper, Driver, or Admin).
    - **Fresh JWT**: It generates a brand-new security token (JWT) where `isEmailVerified` is true.
    - **Pusher**: It sends this token to the app via WebSocket. The app then automatically unlocks "verified-only" features without the user having to re-login.

#### **2. Reporting "Wrong Email" (Disavowal Flow)**

1.  **Trigger**: Recipient B receives an email meant for User A and clicks "Not my account."
2.  **Logic**: The backend (`reportMisdirectedEmail`) immediately revokes the token, ensuring no one can verify that account using that email.
3.  **WebSocket Notification**: The backend notifies User A (the original sender) via WebSocket. The app should display: _"The email address you provided was reported as incorrect. Please check for typos and try again."_
4.  **Security Benefit**: This prevents User A from waiting for an email that will never come and alerts them to the typo instantly.

**Important Notes**:

- Users with active journeys or pending transactions cannot be deleted
- Admin can delete any user, regular users can only delete their own account
- Deletion is permanent and cannot be undone
- All associated data (requests, journeys, payments) will be anonymized or deleted

## User Status Management

### Account Status Check

**Endpoint**: `GET /api/account/status?ownerUserUniqueId=self&roleId=2`
**Description**: Check account status and requirements
**Authentication**: User token required
