# Predefined Data Reference

This document contains all predefined data that is automatically installed when running the `/api/admin/installPreDefinedData` endpoint. This data includes system constants, master data, and configuration values that form the foundation of the transport management system.

## Installation Process

The predefined data is installed through the `installPreDefinedData` service function, which processes data sequentially in the following order:

1. Vehicle Status Types
2. Journey Status
3. Vehicle Types
4. Document Types
5. Driver Document Requirements
6. Shipper Document Requirements
7. Cancellation Reasons
8. Payment Status
9. Payment Methods
10. Commission Rates
11. Tariff Rates
12. Financial Institution Accounts
13. Subscription Plans
14. Deposit Sources
15. Delinquency Types
16. Commission Status
17. Subscription Plan Pricing

## 1. User Roles

### Role List

```json
[
  {
    "roleId": 1,
    "roleName": "Shipper",
    "roleDescription": "a person who can make order to driver to load goods"
  },
  {
    "roleId": 2,
    "roleName": "Driver",
    "roleDescription": "a person who can recive order from shipper to load goods"
  },
  {
    "roleId": 3,
    "roleName": "Admin",
    "roleDescription": "a person who can manage the system, driver and shipper"
  },
  {
    "roleId": 4,
    "roleName": "vehicle owner",
    "roleDescription": "a person who brought the car for delivery"
  },
  {
    "roleId": 5,
    "roleName": "System",
    "roleDescription": "some codes writen in app an do jobs by itself"
  },
  {
    "roleId": 6,
    "roleName": "Supper Admin",
    "roleDescription": "a person who can manage drivers shippers and admins using api requests"
  },
  {
    "roleId": 7,
    "roleName": "unknown role id",
    "roleDescription": "This role is used to register user as default role and can be updated by supper admin"
  }
]
```

## 2. User Status

### Status List

```json
[
  {
    "statusId": 1,
    "statusName": "active",
    "statusDescription": "Driver has registered a vehicle and all required documents are accepted. Driver is active."
  },
  {
    "statusId": 2,
    "statusName": "inactive - vehicle not registered",
    "statusDescription": "Driver has not registered a vehicle."
  },
  {
    "statusId": 3,
    "statusName": "inactive - required documents missing",
    "statusDescription": "Driver has not attached all required documents."
  },
  {
    "statusId": 4,
    "statusName": "inactive - documents rejected",
    "statusDescription": "One or more required documents have been rejected."
  },
  {
    "statusId": 5,
    "statusName": "inactive - documents pending",
    "statusDescription": "One or more required documents are pending review."
  },
  {
    "statusId": 6,
    "statusName": "inactive - User is banned by admin",
    "statusDescription": "User is banned by admin when it commits some crimes or brake rules"
  },
  {
    "statusId": 7,
    "statusName": "inactive - Driver doesn't have a subscription",
    "statusDescription": "Driver is banned by the system when they don't have a subscription"
  }
]
```

## 3. Vehicle Status Types

### Vehicle Status Types

```json
[
  {
    "VehicleStatusTypeName": "active",
    "statusTypeDescription": "When   Vehicle are active and ready to be used by drivers."
  },
  {
    "VehicleStatusTypeName": "inactive",
    "statusTypeDescription": "When   Vehicle are inactive and not ready to be used by drivers."
  },
  {
    "VehicleStatusTypeName": "deleted",
    "statusTypeDescription": "When   Vehicle are deleted by the admin."
  },
  {
    "VehicleStatusTypeName": "suspended",
    "statusTypeDescription": "When   Vehicle are suspended by the admin."
  },
  {
    "VehicleStatusTypeName": "rejected",
    "statusTypeDescription": "When   Vehicle are rejected by the admin."
  },
  {
    "VehicleStatusTypeName": "reserved by other driver",
    "statusTypeDescription": "when other driver has reserved the vehicle"
  }
]
```

## 4. Document Types

### Document Types List

```json
[
  {
    "documentTypeName": "Driver's License",
    "documentTypeDescription": "A valid and unexpired driver's license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
    "isExpirationDateRequired": true
  },
  {
    "documentTypeName": " Vehicle Registration (librea)",
    "documentTypeDescription": "Proof of ownership or right to use the vehicle for ride share services. It confirms the vehicle is legally registered.",
    "isExpirationDateRequired": false
  },
  {
    "documentTypeName": "Insurance Document",
    "documentTypeDescription": "Proof of insurance coverage, ensuring that the driver and shippers are protected in the event of an accident.",
    "isExpirationDateRequired": true
  },
  {
    "documentTypeName": "Profile Photo",
    "documentTypeDescription": "Profile Photo is used to identify current face of user",
    "isExpirationDateRequired": false
  },
  {
    "documentTypeName": "Tax Identification Number",
    "documentTypeDescription": "document that certifies the driver is registered with tax authorities, especially if they are working as an independent contractor.",
    "isExpirationDateRequired": true
  },
  {
    "documentTypeName": "Delegation of Vehicle Use",
    "documentTypeDescription": "A formal document that provides proof that the owner of the vehicle has granted the driver permission to use the vehicle for commercial purposes (ride-sharing).",
    "isExpirationDateRequired": true
  },
  {
    "documentTypeName": "National ID",
    "documentTypeDescription": "A valid and unexpired national ID. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
    "isExpirationDateRequired": true
  }
]
```

## 5. Document Requirements

### Driver Document Requirements

```json
[
  {
    "roleId": "2",
    "documentTypeId": "1",
    "isDocumentMandatory": true,
    "isExpirationDateRequired": true,
    "isFileNumberRequired": true
  },
  {
    "roleId": "2",
    "documentTypeId": "2",
    "isDocumentMandatory": true,
    "isExpirationDateRequired": false,
    "isFileNumberRequired": true
  },
  {
    "roleId": "2",
    "documentTypeId": "4",
    "isDocumentMandatory": true,
    "isExpirationDateRequired": false,
    "isFileNumberRequired": false
  }
]
```

### Shipper Document Requirements

```json
[
  {
    "roleId": 1,
    "documentTypeId": 4,
    "isDocumentMandatory": false,
    "isExpirationDateRequired": false
  },
  {
    "roleId": 1,
    "documentTypeId": 7,
    "isDocumentMandatory": false,
    "isExpirationDateRequired": false
  }
]
```

## 6. Vehicle Types

### Vehicle Types

```json
[
  {
    "vehicleTypeName": "Isuzu FSR",
    "carryingCapacity": 100
  },
  {
    "vehicleTypeName": "Isuzu NPR",
    "carryingCapacity": 50
  },
  {
    "vehicleTypeName": "Euro tracker",
    "carryingCapacity": 430
  },
  {
    "vehicleTypeName": "Sino truck",
    "carryingCapacity": 150
  }
]
```

## 7. Journey Status

### Journey Status List

```json
[
  {
    "journeyStatusId": 1,
    "journeyStatusName": "waiting",
    "journeyStatusDescription": "Initial state when a shipper creates a transport request, waiting for drivers to respond and accept."
  },
  {
    "journeyStatusId": 2,
    "journeyStatusName": "requested",
    "journeyStatusDescription": "A shipper request has been sent or forwarded to a driver. The driver has received the request but has not yet responded."
  },
  {
    "journeyStatusId": 3,
    "journeyStatusName": "acceptedByDriver",
    "journeyStatusDescription": "Driver has accepted the shipper request and provided their bidding price."
  },
  {
    "journeyStatusId": 4,
    "journeyStatusName": "acceptedByShipper",
    "journeyStatusDescription": "Shipper has selected one driver from multiple drivers who accepted the request."
  },
  {
    "journeyStatusId": 5,
    "journeyStatusName": "journeyStarted",
    "journeyStatusDescription": "The actual journey has been initiated by the driver."
  },
  {
    "journeyStatusId": 6,
    "journeyStatusName": "journeyCompleted",
    "journeyStatusDescription": "The journey has been successfully completed by the driver."
  },
  {
    "journeyStatusId": 7,
    "journeyStatusName": "cancelledByShipper",
    "journeyStatusDescription": "Shipper has cancelled the entire transport request."
  },
  {
    "journeyStatusId": 8,
    "journeyStatusName": "rejectedByShipper",
    "journeyStatusDescription": "Shipper has rejected a specific driver's offer after the driver accepted the request."
  },
  {
    "journeyStatusId": 9,
    "journeyStatusName": "cancelledByDriver",
    "journeyStatusDescription": "Driver canceled the request after accepting it and providing their bidding price."
  },
  {
    "journeyStatusId": 10,
    "journeyStatusName": "cancelledByAdmin",
    "journeyStatusDescription": "Admin has cancelled the request."
  },
  {
    "journeyStatusId": 11,
    "journeyStatusName": "completedByAdmin",
    "journeyStatusDescription": "Admin has manually marked the journey as completed."
  },
  {
    "journeyStatusId": 12,
    "journeyStatusName": "cancelledBySystem",
    "journeyStatusDescription": "System has automatically cancelled the request."
  },
  {
    "journeyStatusId": 13,
    "journeyStatusName": "noAnswerFromDriver",
    "journeyStatusDescription": "Driver did not respond to the incoming request within the expected time."
  },
  {
    "journeyStatusId": 14,
    "journeyStatusName": "notSelectedInBid",
    "journeyStatusDescription": "Driver had accepted the request but was not selected during bid selection."
  },
  {
    "journeyStatusId": 15,
    "journeyStatusName": "rejectedByDriver",
    "journeyStatusDescription": "Driver rejected the incoming shipper request before accepting it."
  }
]
```

## 8. Cancellation Reasons

### Cancellation Reasons

```json
[
  { "cancellationReason": "Driver too late", "roleId": 1 },
  { "cancellationReason": "Driver did not answered requests", "roleId": 2 },
  { "cancellationReason": "Change of plans", "roleId": 1 },
  { "cancellationReason": "Driver took too long", "roleId": 1 },
  { "cancellationReason": "Found another ride", "roleId": 1 },
  { "cancellationReason": "Wrong vehicle description", "roleId": 1 },
  {
    "cancellationReason": "Driver did not meet my location",
    "roleId": 1
  },
  { "cancellationReason": "Incorrect route", "roleId": 1 },
  {
    "cancellationReason": "Driver's vehicle didn't match description",
    "roleId": 1
  },
  {
    "cancellationReason": "Driver was rude or unprofessional",
    "roleId": 1
  },
  { "cancellationReason": "Shipper didn't show up", "roleId": 2 },
  { "cancellationReason": "Shipper was unresponsive", "roleId": 2 },
  { "cancellationReason": "Safety concerns", "roleId": 2 },
  { "cancellationReason": "Incorrect pickup location", "roleId": 2 },
  {
    "cancellationReason": "Shipper had too many people",
    "roleId": 2
  },
  {
    "cancellationReason": "Shipper was disrespectful",
    "roleId": 2
  },
  {
    "cancellationReason": "Shipper requested an illegal or unsafe route",
    "roleId": 2
  },
  { "cancellationReason": "Vehicle issue", "roleId": 2 },
  {
    "cancellationReason": "App-related technical issue",
    "roleId": 3
  },
  { "cancellationReason": "Route unavailable", "roleId": 3 },
  { "cancellationReason": "Driver no longer available", "roleId": 3 }
]
```

## 9. Payment Status

### Payment Status List

```json
[
  {
    "paymentStatusId": 1,
    "paymentStatus": "pending",
    "paymentStatusDescription": "Payment is pending"
  },
  {
    "paymentStatusId": 2,
    "paymentStatus": "completed",
    "paymentStatusDescription": "Payment is completed"
  },
  {
    "paymentStatusId": 3,
    "paymentStatus": "failed",
    "paymentStatusDescription": "Payment failed"
  }
]
```

## 10. Payment Methods

### Payment Methods

```json
[
  {
    "paymentMethodId": 1,
    "paymentMethod": "cash",
    "paymentMethodDescription": "Payment by cash"
  },
  {
    "paymentMethodId": 2,
    "paymentMethod": "bank",
    "paymentMethodDescription": "Payment by bank"
  },
  {
    "paymentMethodId": 3,
    "paymentMethod": "telebirr",
    "paymentMethodDescription": "Payment by telebirr"
  }
]
```

## 11. Tariff Rates

### Tariff Rate List

```json
[
  {
    "tariffRateId": 1,
    "tariffRateName": "Standard",
    "standingTariffRate": 100,
    "journeyTariffRate": 25,
    "timingTariffRate": 10,
    "tariffRateDescription": "some descriptions ",
    "tariffRateEffectiveDate": "2026-01-01",
    "tariffRateExpirationDate": "2030-01-01"
  },
  {
    "tariffRateId": 2,
    "tariffRateName": "Premium",
    "standingTariffRate": 150,
    "journeyTariffRate": 45,
    "timingTariffRate": 30,
    "tariffRateDescription": "some descriptions ",
    "tariffRateEffectiveDate": "2026-01-01",
    "tariffRateExpirationDate": "2030-01-01"
  }
]
```

## 12. Commission Rates

### Commission Rates

```json
[
  {
    "commissionRateId": 1,
    "commissionRate": 0.1,
    "commissionRateEffectiveDate": "2029-01-01"
  }
]
```

## 13. Financial Institution Accounts

### Financial Institution Accounts

```json
[
  {
    "institutionName": "Commercial Bank of Ethiopia",
    "accountHolderName": "Marew Masresha Abate",
    "accountNumber": "1000142114999",
    "accountType": "bank",
    "isActive": true
  },
  {
    "institutionName": "Tele birr",
    "accountHolderName": "Marew Masresha Abate",
    "accountNumber": "0922112480",
    "accountType": "mobile_money",
    "isActive": true
  }
]
```

## 14. Subscription Plans

### Subscription Plan Lists

```json
[
  {
    "planName": "One month Free",
    "isFree": true,
    "description": "This plan is free for one month"
  },
  {
    "planName": "One month",
    "isFree": false
  },
  {
    "planName": "Three Months",
    "isFree": false
  },
  {
    "planName": "One Year",
    "isFree": false
  }
]
```

## 15. Deposit Sources

### Deposit Sources

```json
[
  {
    "sourceKey": "Driver",
    "sourceLabel": "when drivers make direct deposit to there account"
  },
  {
    "sourceKey": "Bonus",
    "sourceLabel": "When one driver make direct transfer to other driver"
  }
]
```

## 16. Delinquency Types

### Delinquency Types

```json
[
  {
    "delinquencyTypeName": "late arrival of driver",
    "delinquencyTypeDescription": "Driver late arrival",
    "delinquencyTypeId": 1,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "Driver",
    "isActive": true
  },
  {
    "delinquencyTypeName": "rude behavior of driver",
    "delinquencyTypeDescription": "Driver rude behavior",
    "delinquencyTypeId": 2,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "Driver",
    "isActive": true
  },
  {
    "delinquencyTypeName": "late departure of driver",
    "delinquencyTypeDescription": "Driver late departure",
    "delinquencyTypeId": 3,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "Driver",
    "isActive": true
  },
  {
    "delinquencyTypeName": "rude behavior of shipper",
    "delinquencyTypeDescription": "Shipper rude behavior",
    "delinquencyTypeId": 4,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "shipper",
    "isActive": true
  },
  {
    "delinquencyTypeName": "late departure of shipper",
    "delinquencyTypeDescription": "Shipper late departure",
    "delinquencyTypeId": 5,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "shipper",
    "isActive": true
  },
  {
    "delinquencyTypeName": "Goods not delivered",
    "delinquencyTypeDescription": "Goods not delivered",
    "delinquencyTypeId": 6,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "Driver",
    "isActive": true
  },
  {
    "delinquencyTypeName": "Payments not made",
    "delinquencyTypeDescription": "Payments not made to driver by shipper",
    "delinquencyTypeId": 7,
    "defaultPoints": 1,
    "defaultSeverity": "MEDIUM",
    "applicableRoles": "shipper",
    "isActive": true
  }
]
```

## 17. Commission Status

### Commission Status List

```json
[
  {
    "statusName": "REQUESTED",
    "description": "Commission requested by the system/admin",
    "effectiveFrom": "2024-01-01",
    "effectiveTo": null
  },
  {
    "statusName": "PENDING",
    "description": "Commission calculated but not yet paid",
    "effectiveFrom": "2024-01-01",
    "effectiveTo": null
  },
  {
    "statusName": "PAID",
    "description": "Commission successfully paid",
    "effectiveFrom": "2024-01-01",
    "effectiveTo": null
  },
  {
    "statusName": "FREE",
    "description": "Commission waived or free tier",
    "effectiveFrom": "2024-01-01",
    "effectiveTo": null
  },
  {
    "statusName": "CANCELED",
    "description": "Commission canceled",
    "effectiveFrom": "2024-01-01",
    "effectiveTo": null
  }
]
```

## 18. Subscription Plan Pricing

### Subscription Plan Pricing Lists

```json
[
  {
    "price": 700,
    "durationInDays": 30,
    "effectiveFrom": "2026-01-20 00:00:00"
  },
  {
    "price": 700,
    "durationInDays": 30,
    "effectiveFrom": "2026-01-20 00:00:00"
  },
  {
    "price": 1800,
    "durationInDays": 90,
    "effectiveFrom": "2026-01-20 00:00:00"
  },
  {
    "price": 6000,
    "durationInDays": 365,
    "effectiveFrom": "2026-01-20 00:00:00"
  }
]
```

## API Endpoint

**Endpoint**: `POST /api/admin/installPreDefinedData`  
**Description**: Installs all predefined data in the correct order for system initialization  
**Authentication**: User token required  
**Query Parameters**: None required  
**Response**: Detailed success/error report for each data category

## Usage Notes

- This endpoint should be called after database table creation (`POST /api/admin/createTable`)
- Data is processed sequentially to maintain foreign key relationships
- Existing data is not overwritten (uses ON DUPLICATE KEY UPDATE)
- The super admin user is created automatically during table creation
- All predefined data includes timestamps and audit fields

## Dependencies

The installation order ensures proper dependencies:

1. Status and Roles (base data)
2. Vehicle and Document types
3. Document requirements (depend on types and roles)
4. Payment and financial data
5. Subscription and pricing data
