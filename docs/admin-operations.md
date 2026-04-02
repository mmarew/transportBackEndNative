# Admin Operations

Complete guide to administrative functions, system monitoring, and management operations.

## Super Admin Jobs List

Super Admins have elevated privileges beyond regular admins. They can perform all admin operations plus additional system-level management tasks.

### 🔐 **Critical System Operations**

#### 1. Create Admin Users

**Endpoint**: `POST /api/admin/createUserByAdminOrSuperAdmin`
**Description**: Create new admin accounts with elevated permissions
**Authentication**: Super Admin token required
**Impact**: Grants admin access to new users

#### 2. Install System Data

**Endpoint**: `POST /api/admin/installPreDefinedData`
**Description**: Initialize system with predefined roles, vehicle types, and configuration data
**Authentication**: Super Admin token required
**Impact**: Sets up core system infrastructure

#### 3. Assign User Roles

**Endpoint**: `POST /api/admin/userRole/create`
**Description**: Assign specific roles to users (Passenger, Driver, Admin, etc.)
**Authentication**: Super Admin token required
**Impact**: Controls user permissions and access levels

### 👥 **User Management (Super Admin)**

#### 4. Create Super Admin Accounts

**Description**: Create additional super admin accounts for system administration
**Authentication**: Super Admin token required
**Impact**: Expands super admin team

#### 5. Manage Admin Permissions

**Description**: Modify admin role permissions and access controls
**Authentication**: Super Admin token required
**Impact**: Controls admin capabilities

#### 6. User Account Overrides

**Description**: Override user account restrictions and bans
**Authentication**: Super Admin token required
**Impact**: Emergency access management

### ⚙️ **System Configuration**

#### 7. System Settings Management

**Description**: Configure global system parameters and policies
**Authentication**: Super Admin token required
**Impact**: Affects entire system behavior

#### 8. Security Policy Updates

**Description**: Modify security rules, password policies, and access controls
**Authentication**: Super Admin token required
**Impact**: System-wide security configuration

#### 9. Database Schema Updates

**Description**: Approve and deploy database structure changes
**Authentication**: Super Admin token required
**Impact**: Database integrity and performance

### 📊 **Audit & Monitoring**

#### 10. Full System Audit Logs

**Description**: Access complete audit trails of all system activities
**Authentication**: Super Admin token required
**Impact**: Complete visibility into system operations

#### 11. Admin Activity Monitoring

**Description**: Monitor all admin actions and decisions
**Authentication**: Super Admin token required
**Impact**: Oversight of administrative activities

#### 12. Security Incident Response

**Description**: Handle security breaches and system compromises
**Authentication**: Super Admin token required
**Impact**: System security maintenance

### 💰 **Financial Oversight**

#### 13. Critical Financial Approvals

**Description**: Approve large financial transactions and system-level payments
**Authentication**: Super Admin token required
**Impact**: Financial system integrity

#### 14. Commission Rate Management

**Description**: Set and modify system-wide commission structures
**Authentication**: Super Admin token required
**Impact**: Revenue model configuration

### 🔄 **Emergency Operations**

#### 15. System Maintenance Mode

**Description**: Enable/disable system maintenance and emergency modes
**Authentication**: Super Admin token required
**Impact**: System availability control

#### 16. Data Recovery Operations

**Description**: Initiate and oversee data backup and recovery procedures
**Authentication**: Super Admin token required
**Impact**: Data integrity and availability

### 📋 **Reporting & Analytics**

#### 17. Executive Dashboard Access

**Description**: Access comprehensive business intelligence and KPIs
**Authentication**: Super Admin token required
**Impact**: Strategic decision support

#### 18. Compliance Reporting

**Description**: Generate regulatory compliance and audit reports
**Authentication**: Super Admin token required
**Impact**: Legal and regulatory compliance

---

## Regular Admin Operations

Regular admins can perform the following operations but cannot access Super Admin functions above.

## User Management (Admin)

### Get Users by Filter

**Endpoint**: `GET /api/admin/getUserByFilterDetailed`
**Description**: Search and filter users by criteria
**Authentication**: Admin token required

**Query Parameters:**

- `phoneNumber`: Filter by phone
- `roleId`: Filter by role (1=Passenger, 2=Driver, 3=Admin)
- `statusId`: Filter by status
- `fullName`: Search by name

### Create Admin User

**Endpoint**: `POST /api/admin/createUserByAdminOrSuperAdmin`
**Description**: Create new admin users
**Authentication**: Super Admin token required

## Driver Management

### Get Unauthorized Drivers

**Endpoint**: `GET /api/admin/getUnAuthorizedDriver`
**Description**: View and filter drivers whose status is not yet active (e.g., pending review, rejected documents, missing registration). This endpoint automatically enriches each driver with their current document statuses and provides full pagination.

**Authentication**: Admin token required

**Query Parameters:**

- `search`: General search across full name, email, phone, license plate, and vehicle types.
- `name`: Filter by full name.
- `phone`: Filter by phone number.
- `email`: Filter by email.
- `status`: Specific status ID(s). (Accepts single ID or array)
- `vehicleType`: Filter by the name of the vehicle type assigned to the driver.
- `licensePlate`: Filter by the vehicle's license plate.
- `page`: Page number for pagination (Default: 1).
- `limit`: Records per page (Default: 10).
- `sortBy`: Field to sort by (`userRoleStatusCreatedAt`, `fullName`, `email`, `phoneNumber`, `statusName`).
- `sortOrder`: Sorting direction (`ASC` or `DESC`).

**Behavior (FIXED):** 
The endpoint now correctly handles the `search` parameter for drivers with and without existing vehicle assignments.

### Get Online Drivers

**Endpoint**: `GET /api/admin/getOnlineDrivers`
**Description**: View currently online drivers
**Authentication**: Admin token required

### Get All Active Drivers

**Endpoint**: `GET /api/admin/getAllActiveDrivers`
**Description**: View all active drivers
**Authentication**: Admin token required

## Document Approval

### Approve/Reject Documents

**Endpoint**: `PUT /api/admin/acceptRejectAttachedDocuments`
**Description**: Review and approve driver documents
**Authentication**: Admin token required

**Request Body:**

```json
{
  "attachedDocumentUniqueId": "document-uuid",
  "action": "ACCEPTED",
  "reason": "Document is valid"
}
```

## Journey Monitoring

### View Ongoing Journeys

**Endpoint**: `GET /api/user/getOngoingJourney`
**Description**: Monitor active journeys
**Authentication**: Admin token required

### Journey Statistics

**Endpoint**: `GET /api/admin/journeyStats`
**Description**: Get journey statistics and metrics
**Authentication**: Admin token required

## Financial Management

### Approve User Deposits

**Endpoint**: `PUT /api/finance/userDeposit/{userDepositUniqueId}`
**Description**: Approve pending deposit requests
**Authentication**: Admin token required

### View User Deposits

**Endpoint**: `GET /api/finance/userDeposit`
**Description**: View all deposit requests
**Authentication**: Admin token required

## System Administration

### Database Management

**Endpoint**: `DELETE /api/admin/dropAllTables`
**Description**: Drop all database tables (dev only)
**Authentication**: Admin token required

**Endpoint**: `POST /api/admin/createTable`
**Description**: Create database tables
**Authentication**: Admin token required

### System Configuration

**Endpoint**: `POST /api/admin/installPreDefinedData`
**Description**: Install initial system data
**Authentication**: Super Admin token required

## Role Management

### Create Roles

**Endpoint**: `POST /api/admin/roles`
**Description**: Create new user roles
**Authentication**: Admin token required

### Manage User Roles

**Endpoint**: `POST /api/admin/userRole/create`
**Description**: Assign roles to users
**Authentication**: Super Admin token required

### View Roles

**Endpoint**: `GET /api/admin/roles`
**Description**: Get all system roles
**Authentication**: Admin token required

## System Monitoring

### Application Health

**Endpoint**: `GET /health`
**Description**: Check application health status
**Authentication**: None required

### Database Health

**Endpoint**: `GET /health/database`
**Description**: Check database connectivity
**Authentication**: None required

### System Metrics

**Endpoint**: `GET /admin/metrics`
**Description**: View system performance metrics
**Authentication**: Admin token required

## Security & Access Control

### Admin Access Verification

- `verifyAdminsIdentity`: Ensures admin role
- `verifyIfUserIsSupperAdmin`: Ensures super admin role
- `verifyTokenOfAxios`: Validates JWT tokens

### Audit Logging

- All admin actions are logged
- User permission changes tracked
- Security events monitored

## Admin Dashboard Features

### Statistics Overview

- Total users by role
- Active drivers count
- Pending document approvals
- Revenue metrics

### User Activity Monitoring

- Recent registrations
- Active sessions
- Failed login attempts
- System usage patterns

### Financial Oversight

- Deposit approval queue
- Payment transaction monitoring
- Revenue analytics
- Financial reporting
