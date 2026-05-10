# Document Management (Attached Documents)

Complete guide to document upload, verification, and management system for attached documents.

## Document Types Management

Document types define the categories of documents that users can upload. These are managed by administrators but visible to all authenticated users.

**Note**: Document types can be created during installation with predefined data to enable quick start of the application. Common document types include Driver's License, Vehicle Registration, Insurance, and Profile Photos.

### Create Document Type

**Endpoint**: `POST /api/documentTypes`
**Description**: Create a new document type for users to upload
**Authentication**: User token required (Note: May require admin privileges based on business rules)

**Request Body**:

```json
{
  "documentTypeName": "Driver's License",
  "documentTypeDescription": "A valid and unexpired driver's license for vehicle operation",
  "isDocumentMandatory": 1,
  "isFileNumberRequired": 1,
  "isExpirationDateRequired": 1,
  "isDescriptionRequired": 0
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "documentTypeId": 1,
    "documentTypeUniqueId": "d7b3021f-cca4-48b2-959f-6994b408a3bc",
    "documentTypeName": "Driver's License",
    "documentTypeDescription": "A valid and unexpired driver's license for vehicle operation",
    "isDocumentMandatory": 1,
    "isFileNumberRequired": 1,
    "isExpirationDateRequired": 1,
    "isDescriptionRequired": 0,
    "documentTypeCreatedAt": "2026-02-03T09:00:00.000Z"
  }
}
```

### Get Document Types

**Endpoint**: `GET /api/documentTypes`
**Description**: Retrieve all available document types
**Authentication**: Admin token required

**Note**: While this endpoint requires admin privileges for management purposes, users can view required document types for their role through the account status endpoint (`GET /api/account/status?ownerUserUniqueId=self&roleId={roleId}`) in the `requiredDocuments` array.

**Query Parameters**:

- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `sortBy`: Sort field
- `sortOrder`: Sort order ("ASC" or "DESC")

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "documentTypeId": 1,
      "documentTypeUniqueId": "d7b3021f-cca4-48b2-959f-6994b408a3bc",
      "documentTypeName": "Driver's License",
      "documentTypeDescription": "A valid and unexpired driver's license for vehicle operation",
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 1,
      "isDescriptionRequired": 0,
      "documentTypeCreatedAt": "2026-02-03T09:00:00.000Z",
      "documentTypeCreatedBy": "admin-uuid-here"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 4,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

### Update Document Type

**Endpoint**: `PUT /api/documentTypes/{documentTypeUniqueId}`
**Description**: Update an existing document type
**Authentication**: Admin token required

**URL Parameters**:

- `documentTypeUniqueId`: Document type UUID

**Request Body**:

```json
{
  "documentTypeName": "Updated Driver's License",
  "documentTypeDescription": "Updated description for driver's license",
  "isDocumentMandatory": 1,
  "isFileNumberRequired": 1,
  "isExpirationDateRequired": 1,
  "isDescriptionRequired": 1
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "documentTypeId": 1,
    "documentTypeUniqueId": "d7b3021f-cca4-48b2-959f-6994b408a3bc",
    "documentTypeName": "Updated Driver's License",
    "documentTypeDescription": "Updated description for driver's license",
    "isDocumentMandatory": 1,
    "isFileNumberRequired": 1,
    "isExpirationDateRequired": 1,
    "isDescriptionRequired": 1,
    "documentTypeUpdatedAt": "2026-02-03T10:00:00.000Z"
  }
}
```

### Delete Document Type

**Endpoint**: `DELETE /api/documentTypes/{documentTypeUniqueId}`
**Description**: Permanently delete a document type
**Authentication**: Admin token required

**URL Parameters**:

- `documentTypeUniqueId`: Document type UUID

**Response**:

```json
{
  "message": "success",
  "data": {
    "documentTypeUniqueId": "d7b3021f-cca4-48b2-959f-6994b408a3bc",
    "deletedAt": "2026-02-03T11:00:00.000Z"
  }
}
```

**Error Responses** (for all CRUD operations):

- **400 Bad Request**: Invalid request data or missing required fields
- **401 Unauthorized**: Invalid or missing token
- **403 Forbidden**: Not authorized to perform this operation
- **404 Not Found**: Document type not found
- **409 Conflict**: Document type cannot be deleted (in use by documents)
- **500 Internal Server Error**: Server error

## Role Document Requirements Management

After creating document types, you need to assign them to specific user roles with defined requirements. This determines which documents are required for each role (e.g., Driver, Shipper) and what information must be provided with each document.

### Create Role Document Requirement

**Endpoint**: `POST /api/RoleDocumentRequirements`
**Description**: Assign a document type to a role with specific requirements
**Authentication**: User token required

**Request Body**:

```json
{
  "roleId": 2,
  "documentTypeId": 1,
  "isDocumentMandatory": 1,
  "isFileNumberRequired": 1,
  "isExpirationDateRequired": 1,
  "isDescriptionRequired": 0
}
```

**Request Body Fields**:

- `roleId`: Role ID (2=Driver, 1=Shipper, etc.)
- `documentTypeId`: Document type ID to assign
- `isDocumentMandatory`: 1 if document is required, 0 if optional
- `isFileNumberRequired`: 1 if file number must be provided, 0 if optional
- `isExpirationDateRequired`: 1 if expiration date must be provided, 0 if optional
- `isDescriptionRequired`: 1 if description must be provided, 0 if optional

**Response**:

```json
{
  "message": "success",
  "data": {
    "roleDocumentRequirementId": 1,
    "roleDocumentRequirementUniqueId": "ddb6a1e7-4d3f-400a-9aa4-daa8471b4630",
    "roleId": 2,
    "documentTypeId": 1,
    "isDocumentMandatory": 1,
    "isFileNumberRequired": 1,
    "isExpirationDateRequired": 1,
    "isDescriptionRequired": 0,
    "roleDocumentRequirementCreatedAt": "2026-02-03T09:00:00.000Z",
    "roleDocumentRequirementCreatedBy": "admin-uuid-here"
  }
}
```

### Get Role Document Requirements

**Endpoint**: `GET /api/RoleDocumentRequirements`
**Description**: Retrieve role document requirements with filtering
**Authentication**: User token required

**Query Parameters**:

- `roleId`: Filter by role ID
- `documentTypeId`: Filter by document type ID
- `isDocumentMandatory`: Filter by mandatory status (0 or 1)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `sortBy`: Sort field
- `sortOrder`: Sort order ("ASC" or "DESC")

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "roleDocumentRequirementId": 1,
      "roleDocumentRequirementUniqueId": "ddb6a1e7-4d3f-400a-9aa4-daa8471b4630",
      "roleId": 2,
      "documentTypeId": 1,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 1,
      "isDescriptionRequired": 0,
      "roleDocumentRequirementCreatedAt": "2026-02-03T09:00:00.000Z",
      "roleDocumentRequirementCreatedBy": "admin-uuid-here",
      "roleName": "Driver",
      "documentTypeName": "Driver's License"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 4,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

### Update Role Document Requirement

**Endpoint**: `PUT /api/RoleDocumentRequirements/{roleDocumentRequirementUniqueId}`
**Description**: Update the requirements for a role-document mapping
**Authentication**: User token required

**URL Parameters**:

- `roleDocumentRequirementUniqueId`: Requirement mapping UUID

**Request Body**:

```json
{
  "isDocumentMandatory": 1,
  "isFileNumberRequired": 0,
  "isExpirationDateRequired": 1,
  "isDescriptionRequired": 1
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "roleDocumentRequirementId": 1,
    "roleDocumentRequirementUniqueId": "ddb6a1e7-4d3f-400a-9aa4-daa8471b4630",
    "roleId": 2,
    "documentTypeId": 1,
    "isDocumentMandatory": 1,
    "isFileNumberRequired": 0,
    "isExpirationDateRequired": 1,
    "isDescriptionRequired": 1,
    "roleDocumentRequirementUpdatedAt": "2026-02-03T10:00:00.000Z"
  }
}
```

### Delete Role Document Requirement

**Endpoint**: `DELETE /api/RoleDocumentRequirements/{roleDocumentRequirementUniqueId}`
**Description**: Remove a document requirement from a role
**Authentication**: User token required

**URL Parameters**:

- `roleDocumentRequirementUniqueId`: Requirement mapping UUID

**Response**:

```json
{
  "message": "success",
  "data": {
    "roleDocumentRequirementUniqueId": "ddb6a1e7-4d3f-400a-9aa4-daa8471b4630",
    "deletedAt": "2026-02-03T11:00:00.000Z"
  }
}
```

**Error Responses** (for all CRUD operations):

- **400 Bad Request**: Invalid request data or conflicting requirements
- **401 Unauthorized**: Invalid or missing token
- **403 Forbidden**: Not authorized to manage role requirements
- **404 Not Found**: Role document requirement not found
- **409 Conflict**: Cannot delete requirement (documents already uploaded)
- **500 Internal Server Error**: Server error

## Attached Documents

### Upload Documents

**Endpoint**: `POST /api/user/attachDocuments/{userUniqueId}`
**Description**: Upload multiple document files for a user. Supports dynamic document types with expiration dates and file numbers.
**Authentication**: User token required
**Content-Type**: `multipart/form-data`

**URL Parameters**:

- `userUniqueId`: Target user unique ID (UUID) or "self" for current user

**Form Data Fields**:

- Files: Multiple file uploads with dynamic naming (e.g., `driversLicense`, `vehicleRegistration`)
- Dynamic Fields: For each document type, include:
  - `{documentType}ExpirationDate`: Expiration date (ISO format)
  - `{documentType}FileNumber`: Document file number
  - `{documentType}Description`: Optional description

**Example Form Data**:

```
driversLicense: [file] - Driver's license file
driversLicenseExpirationDate: "2026-12-31"
driversLicenseFileNumber: "DL123456"
driversLicenseDescription: "Driver's license front and back"

vehicleRegistration: [file] - Vehicle registration file
vehicleRegistrationExpirationDate: "2027-06-15"
vehicleRegistrationFileNumber: "VR789012"
```

**Success Response**:

```json
{
  "message": "success",
  "data": [
    {
      "attachedDocumentId": 1,
      "attachedDocumentUniqueId": "uuid-here",
      "documentTypeId": 1,
      "documentName": "driversLicense",
      "filePath": "ftp://server.com/uploads/driversLicense_uuid.jpg",
      "fileNumber": "DL123456",
      "expirationDate": "2026-12-31T00:00:00.000Z",
      "description": "Driver's license front and back",
      "status": "pending",
      "uploadedAt": "2026-02-03T09:00:00.000Z"
    }
  ]
}
```

**Error Responses**:

- **400 Bad Request**: Invalid file format, size exceeded, or duplicate documents
- **401 Unauthorized**: Invalid or missing user token
- **403 Forbidden**: Not authorized to upload for this user
- **404 Not Found**: User not found
- **500 Internal Server Error**: Upload or storage error

### Get Documents by Filter

**Endpoint**: `GET /api/user/attachedDocuments`
**Description**: Retrieve documents with comprehensive filtering and pagination
**Authentication**: User token required

**Query Parameters**:

- `attachedDocumentUniqueId`: Get single document by UUID (optional)
- `userUniqueId`: Filter by user UUID or "self" (optional, defaults to current user)
- `documentTypeId`: Filter by document type ID or "all" (optional)
- `attachedDocumentAcceptance`: Filter by acceptance status ("ACCEPTED", "PENDING", "REJECTED") (optional)
- `email`: Filter by user email or "all" (optional)
- `phoneNumber`: Filter by user phone number or "all" (optional)
- `fullName`: Filter by user full name or "all" (optional)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10, max: 100)
- `sortBy`: Sort field (default: "attachedDocumentCreatedAt")
- `sortOrder`: Sort order "ASC" or "DESC" (default: "DESC")

**Success Response**:

```json
{
  "message": "success",
  "data": {
    "documents": [
      {
        "attachedDocumentId": 4,
        "attachedDocumentUniqueId": "f98bce63-d146-47c7-a2d0-403b59f9d738",
        "userUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
        "attachedDocumentDescription": "This document allows the driver to drive vehicle.",
        "documentTypeId": 1,
        "attachedDocumentFileNumber": null,
        "documentExpirationDate": "2029-10-09T21:00:00.000Z",
        "attachedDocumentAcceptance": "ACCEPTED",
        "attachedDocumentName": "https://transport.masetawosha.com/uploads/2_8f379de1-ac48-46f7-be70-a955c31989ec.png",
        "documentVersion": 1,
        "attachedDocumentCreatedByUserId": "02069e59-6b22-4d45-8158-4adcacdbea11",
        "attachedDocumentCreatedAt": "2026-02-01T12:18:34.000Z",
        "attachedDocumentAcceptanceReason": null,
        "attachedDocumentAcceptedRejectedByUserId": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
        "attachedDocumentAcceptedRejectedAt": "2026-02-01T18:48:57.000Z",
        "documentTypeUniqueId": "d7b3021f-cca4-48b2-959f-6994b408a3bc",
        "documentTypeName": "Driver's License",
        "uploadedDocumentName": "driversLicense",
        "uploadedDocumentTypeId": "driversLicenseTypeId",
        "uploadedDocumentDescription": "driversLicenseDescription",
        "uploadedDocumentExpirationDate": "driversLicenseExpirationDate",
        "uploadedDocumentFileNumber": "driversLicenseFileNumber",
        "documentTypeDescription": " A valid and unexpired driver's license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
        "documentTypeCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
        "documentTypeCreatedAt": "2026-02-01T06:35:13.000Z",
        "documentTypeUpdatedBy": null,
        "documentTypeUpdatedAt": null,
        "documentTypeDeletedBy": null,
        "documentTypeDeletedAt": null,
        "isDocumentTypeDeleted": 0,
        "documentTypeCurrentVersion": 1,
        "userId": 2,
        "fullName": "system",
        "phoneNumber": "+251922112480",
        "email": "system@system.com",
        "userCreatedAt": "2026-02-01T06:34:23.000Z",
        "userCreatedBy": "system",
        "userDeletedAt": null,
        "userDeletedBy": null,
        "isDeleted": 0
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalCount": 3,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid query parameters
- **401 Unauthorized**: Invalid or missing user token
- **403 Forbidden**: Not authorized to view these documents
- **500 Internal Server Error**: Database or retrieval error

### Update Document

**Endpoint**: `PUT /api/user/attachedDocuments/{attachedDocumentUniqueId}`
**Description**: Update an existing document with new file or metadata
**Authentication**: User token required
**Content-Type**: `multipart/form-data`

**URL Parameters**:

- `attachedDocumentUniqueId`: Document unique ID (UUID)

**Form Data Fields**:

- File: New document file (optional)
- Dynamic Fields: Update metadata fields as needed:
  - `{documentType}ExpirationDate`: Updated expiration date
  - `{documentType}FileNumber`: Updated file number
  - `{documentType}Description`: Updated description

**Success Response**:

```json
{
  "message": "success",
  "data": {
    "attachedDocumentId": 1,
    "attachedDocumentUniqueId": "uuid-here",
    "documentName": "driversLicense",
    "filePath": "ftp://server.com/uploads/driversLicense_updated_uuid.jpg",
    "fileNumber": "DL123456-UPDATED",
    "expirationDate": "2027-12-31T00:00:00.000Z",
    "description": "Updated driver's license",
    "status": "pending",
    "updatedAt": "2026-02-03T09:30:00.000Z"
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid file or parameters
- **401 Unauthorized**: Invalid or missing user token
- **403 Forbidden**: Not authorized to update this document
- **404 Not Found**: Document not found
- **500 Internal Server Error**: Update or storage error

### Delete Document

**Endpoint**: `DELETE /api/user/attachedDocuments/{attachedDocumentUniqueId}`
**Description**: Permanently delete a document
**Authentication**: User token required

**URL Parameters**:

- `attachedDocumentUniqueId`: Document unique ID (UUID)

**Success Response**:

```json
{
  "message": "success",
  "data": {
    "attachedDocumentUniqueId": "uuid-here",
    "deletedAt": "2026-02-03T09:45:00.000Z",
    "fileDeleted": true
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid document ID format
- **401 Unauthorized**: Invalid or missing user token
- **403 Forbidden**: Not authorized to delete this document
- **404 Not Found**: Document not found
- **409 Conflict**: Document cannot be deleted (approved or in use)
- **500 Internal Server Error**: Deletion error

## Admin Document Review

### Approve/Reject Documents

**Endpoint**: `PUT /api/admin/acceptRejectAttachedDocuments`
**Description**: Admin approve or reject submitted documents
**Authentication**: Admin token required

**Request Body**:

```json
{
  "attachedDocumentUniqueId": "uuid-here",
  "action": "ACCEPTED",
  "reason": "Document is valid and complete",
  "roleId": 2
}
```

**Request Body Fields**:

- `attachedDocumentUniqueId`: Document UUID (required)
- `action`: "ACCEPTED" or "REJECTED" (required)
- `reason`: Approval/rejection reason (optional)
- `roleId`: User role ID for notifications (optional)

**Success Response**:

```json
{
  "message": "success",
  "data": {
    "attachedDocumentUniqueId": "uuid-here",
    "status": "ACCEPTED",
    "approvedBy": "admin-uuid-here",
    "approvedAt": "2026-02-03T10:00:00.000Z",
    "reason": "Document is valid and complete"
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid action or missing required fields
- **401 Unauthorized**: Invalid or missing admin token
- **403 Forbidden**: Not authorized to review documents
- **404 Not Found**: Document not found
- **500 Internal Server Error**: Review update error

## Document Categories

### Supported Document Categories

**Driver Documents:**

- `driversLicense`: Driver's license (required)
- `vehicleRegistration`: Vehicle registration/Librea (required)
- `vehicleInsurance`: Vehicle insurance certificate (required)
- `profilePhoto`: Driver profile photo (optional)

**Shipper Documents:**

- `idCard`: Government ID card (optional)
- `profilePhoto`: Shipper profile photo (optional)

## Getting Required Documents

### Account Status Endpoint

Users can retrieve their required document types and current document status by calling the account status endpoint after login.

**Endpoint**: `GET /api/account/status?ownerUserUniqueId=self&roleId={roleId}`
**Description**: Get user account status including required documents, uploaded documents status, and subscription information
**Authentication**: User token required

**Query Parameters**:

- `ownerUserUniqueId`: Use "self" for current user
- `roleId`: User's role ID (2=Driver, 1=Shipper, etc.)

**Response Structure**:

```json
{
  "message": "success",
  "messageType": "accountStatus",
  "vehicle": {
    // Vehicle information (for drivers)
  },
  "userData": {
    // User basic information
  },
  "attachedDocumentsByStatus": {
    "PENDING": [],
    "ACCEPTED": [
      {
        "attachedDocumentId": 4,
        "attachedDocumentUniqueId": "f98bce63-d146-47c7-a2d0-403b59f9d738",
        "userUniqueId": "02069e59-6b22-4d45-8158-4adcacdbea11",
        "documentTypeId": 1,
        "attachedDocumentAcceptance": "ACCEPTED",
        "documentTypeName": "Driver's License",
        "isDocumentMandatory": 1,
        "isFileNumberRequired": 1,
        "isExpirationDateRequired": 1,
        "isDescriptionRequired": 0,
        "doc_status": "ACCEPTED"
      }
    ],
    "REJECTED": []
  },
  "unAttachedDocumentTypes": [],
  "requiredDocuments": [
    {
      "roleDocumentRequirementId": 1,
      "roleDocumentRequirementUniqueId": "ddb6a1e7-4d3f-400a-9aa4-daa8471b4630",
      "roleId": 2,
      "documentTypeId": 1,
      "isDocumentMandatory": 1,
      "isFileNumberRequired": 1,
      "isExpirationDateRequired": 1,
      "isDescriptionRequired": 0,
      "documentTypeName": "Driver's License",
      "roleName": "Driver"
    }
  ],
  "subscription": {
    // Subscription information
  },
  "status": 1,
  "reason": "All requirements satisfied"
}
```

**Key Response Fields**:

**attachedDocumentsByStatus**: Documents grouped by approval status

- `PENDING`: Documents awaiting admin review
- `ACCEPTED`: Approved documents
- `REJECTED`: Rejected documents

**requiredDocuments**: Array of document types required for the user's role

- `documentTypeName`: Name of required document
- `isDocumentMandatory`: Whether document is required (1=yes, 0=optional)
- `isFileNumberRequired`: Whether file number is required
- `isExpirationDateRequired`: Whether expiration date is required
- `isDescriptionRequired`: Whether description is required

**unAttachedDocumentTypes**: Documents not yet uploaded (usually empty if all required docs are uploaded)

### Usage Flow

1. **User Login**: User authenticates and receives JWT token
2. **Check Account Status**: Call `/api/account/status?ownerUserUniqueId=self&roleId={roleId}`
3. **Review Required Documents**: Check `requiredDocuments` array for documents to upload
4. **Upload Missing Documents**: Use upload endpoint for any missing required documents
5. **Monitor Status**: Check `attachedDocumentsByStatus` for approval status

**Example API Call**:

```bash
curl -X GET "http://localhost:3000/api/account/status?ownerUserUniqueId=self&roleId=2" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Document Requirements by Role

**Driver (roleId: 2):**

- Driver's License (Mandatory, File Number + Expiration Date required)
- Vehicle Registration (Librea) (Mandatory, File Number required)
- Vehicle Insurance (Mandatory)
- Profile Photo (Mandatory)

**Shipper (roleId: 1):**

- ID Card (Optional)
- Profile Photo (Optional)

## Document Storage

### File Storage Details

- **Storage**: FTP server for secure file storage
- **File Types**: PDF, JPEG, PNG only
- **File Size**: Maximum 5MB per file
- **Naming**: Unique UUID-based filenames
- **Access**: Public URLs for approved documents, secure access for admin review

### Document Lifecycle

1. **Upload**: User uploads document via form-data
2. **Validation**: File type, size, and duplicate checking
3. **Storage**: File uploaded to FTP server
4. **Status**: Set to "pending" for review
5. **Review**: Admin reviews and approves/rejects
6. **Notification**: User notified of decision
7. **Access**: Approved documents accessible via public URLs

### Document Statuses

- **pending**: Awaiting admin review
- **ACCEPTED**: Approved by admin
- **REJECTED**: Rejected by admin

## Security Features

### Upload Security

- File type validation (PDF, JPEG, PNG)
- File size limits (5MB maximum)
- Duplicate document detection
- User authorization checks

### Access Control

- User can only access their own documents
- Admin can access all documents for review
- Secure FTP storage with access controls
- Public URLs only for approved documents

## API Examples

### Upload Multiple Documents

```bash
curl -X POST "http://localhost:3000/api/user/attachDocuments/self" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "driversLicense=@drivers_license.jpg" \
  -F "driversLicenseExpirationDate=2026-12-31" \
  -F "driversLicenseFileNumber=DL123456" \
  -F "vehicleRegistration=@vehicle_reg.pdf" \
  -F "vehicleRegistrationExpirationDate=2027-06-15"
```

### Get User's Documents

```bash
curl -X GET "http://localhost:3000/api/user/attachedDocuments?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Admin Approve Document

```bash
curl -X PUT "http://localhost:3000/api/admin/acceptRejectAttachedDocuments" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attachedDocumentUniqueId": "document-uuid-here",
    "action": "ACCEPTED",
    "reason": "Valid document"
  }'
```
