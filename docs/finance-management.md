## Finance Management

The Finance Management module handles all financial transactions, deposits, subscriptions, commissions, and user balances within the transport management system.

### 1.1 Create Deposit Source

**Endpoint**: `POST /api/finance/depositSource`  
**Description**: Creates a new deposit source that indicates who makes deposits and where funds come from.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "sourceKey": "Driver",
  "sourceLabel": "when drivers make direct deposit to their account"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "depositSourceId": 1,
    "depositSourceUniqueId": "a96b28d1-c476-4687-9bd2-d49379a3dd3f",
    "sourceKey": "Driver",
    "sourceLabel": "when drivers make direct deposit to their account",
    "depositSourceCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
    "depositSourceUpdatedBy": null,
    "depositSourceDeletedBy": null,
    "depositSourceCreatedAt": "2026-02-01T06:35:31.000Z",
    "depositSourceUpdatedAt": null,
    "depositSourceDeletedAt": null
  }
}
```

### 1.2 Get Deposit Sources

**Endpoint**: `GET /api/finance/depositSources`  
**Description**: Retrieves all available deposit sources that indicate who makes deposits and where funds come from.  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "depositSourceId": 4,
      "depositSourceUniqueId": "a2cae558-d02d-495a-9b1a-0ec48985b162",
      "sourceKey": "Bonus",
      "sourceLabel": "When one driver makes direct transfer to other driver",
      "depositSourceCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "depositSourceUpdatedBy": null,
      "depositSourceDeletedBy": null,
      "depositSourceCreatedAt": "2026-02-01T09:35:32.000Z",
      "depositSourceUpdatedAt": null,
      "depositSourceDeletedAt": null
    },
    {
      "depositSourceId": 1,
      "depositSourceUniqueId": "a96b28d1-c476-4687-9bd2-d49379a3dd3f",
      "sourceKey": "Driver",
      "sourceLabel": "when drivers make direct deposit to their account",
      "depositSourceCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "depositSourceUpdatedBy": null,
      "depositSourceDeletedBy": null,
      "depositSourceCreatedAt": "2026-02-01T09:35:31.000Z",
      "depositSourceUpdatedAt": null,
      "depositSourceDeletedAt": null
    },
    {
      "depositSourceId": 2,
      "depositSourceUniqueId": "471efa2c-9acb-4ce6-a694-41f7d7bb431a",
      "sourceKey": "Transfer",
      "sourceLabel": "When one driver makes direct transfer to other driver",
      "depositSourceCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "depositSourceUpdatedBy": null,
      "depositSourceDeletedBy": null,
      "depositSourceCreatedAt": "2026-02-01T09:35:31.000Z",
      "depositSourceUpdatedAt": null,
      "depositSourceDeletedAt": null
    },
    {
      "depositSourceId": 3,
      "depositSourceUniqueId": "e442ace0-eeaf-4057-9e01-093eeb4702f2",
      "sourceKey": "Admin",
      "sourceLabel": "When admin makes direct deposit to their account",
      "depositSourceCreatedBy": "3289885a-d5b9-4bde-8cee-642a7eb026cd",
      "depositSourceUpdatedBy": null,
      "depositSourceDeletedBy": null,
      "depositSourceCreatedAt": "2026-02-01T09:35:31.000Z",
      "depositSourceUpdatedAt": null,
      "depositSourceDeletedAt": null
    }
  ]
}
```

### 1.3 Update Deposit Source

**Endpoint**: `PUT /api/finance/depositSource/{depositSourceUniqueId}`  
**Description**: Updates an existing deposit source configuration.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "sourceKey": "Driver1",
  "sourceLabel": "when drivers pay their deposits"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "depositSourceUniqueId": "a2cae558-d02d-495a-9b1a-0ec48985b162",
    "sourceKey": "Driver1",
    "sourceLabel": "when drivers pay their deposits"
  }
}
```

### 1.4 Delete Deposit Source

**Endpoint**: `DELETE /api/finance/depositSource/{depositSourceUniqueId}`  
**Description**: Deletes a deposit source from the system.  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": "Deleted: a2cae558-d02d-495a-9b1a-0ec48985b162"
}
```

### 2.1 Create User Deposit

**Endpoint**: `POST /api/finance/userDeposit`  
**Description**: Creates a deposit transaction that increases the user's balance. Deposits may require admin approval if not configured as automatic.  
**Balance Effect**: **Positive** - Increases user balance (Previous Balance + Deposit Amount = New Balance)  
**Authentication**: User token required (for self-deposit) or Admin token (for manual deposits)  
**Request Body**:

```json
{
  "userUniqueId": "user-uuid-here",
  "amount": 1000.0,
  "depositSourceUniqueId": "driver-earnings-uuid",
  "description": "Payment for completed delivery",
  "referenceNumber": "TXN123456",
  "requiresApproval": false
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "depositId": 1,
    "depositUniqueId": "deposit-uuid-here",
    "userUniqueId": "user-uuid-here",
    "amount": 1000.0,
    "balanceBefore": 500.0,
    "balanceAfter": 1500.0,
    "status": "APPROVED",
    "approvedAt": "2026-01-31T15:30:00.000Z",
    "approvedBy": "admin-uuid-here"
  }
}
```

### 2.2 Get User Deposits

**Endpoint**: `GET /api/finance/userDeposits/{userUniqueId}`  
**Description**: Retrieves all deposit transactions for a specific user.  
**Authentication**: User token required (own deposits) or Admin token  
**Query Parameters**:

- `status`: Filter by deposit status (pending, approved, rejected)
- `limit`: Number of deposits to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "depositId": 1,
      "depositUniqueId": "deposit-uuid-here",
      "userUniqueId": "user-uuid-here",
      "amount": 1000.0,
      "depositSource": "Driver Earnings",
      "status": "APPROVED",
      "createdAt": "2026-01-31T15:30:00.000Z",
      "approvedAt": "2026-01-31T15:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 10,
    "offset": 0,
    "hasNext": false
  }
}
```

### 2.3 Get Deposit by ID

**Endpoint**: `GET /api/finance/userDeposit/{depositUniqueId}`  
**Description**: Retrieves a specific deposit transaction by its unique ID.  
**Authentication**: User token required (own deposit) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "depositId": 1,
    "depositUniqueId": "deposit-uuid-here",
    "userUniqueId": "user-uuid-here",
    "amount": 1000.0,
    "balanceBefore": 500.0,
    "balanceAfter": 1500.0,
    "depositSource": "Driver Earnings",
    "status": "APPROVED",
    "description": "Payment for completed delivery",
    "referenceNumber": "TXN123456",
    "createdAt": "2026-01-31T15:30:00.000Z",
    "approvedAt": "2026-01-31T15:30:00.000Z",
    "approvedBy": "admin-uuid-here"
  }
}
```

### 2.4 Update Deposit Status

**Endpoint**: `PUT /api/finance/userDeposit/{depositUniqueId}`  
**Description**: Updates the status of a deposit transaction (approve/reject pending deposits).  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "status": "APPROVED",
  "reason": "Verified transaction details"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "depositId": 1,
    "depositUniqueId": "deposit-uuid-here",
    "status": "APPROVED",
    "approvedAt": "2026-01-31T16:00:00.000Z",
    "approvedBy": "admin-uuid-here",
    "reason": "Verified transaction details"
  }
}
```

### 2.5 Delete/Cancel Deposit

**Endpoint**: `DELETE /api/finance/userDeposit/{depositUniqueId}`  
**Description**: Cancels a pending deposit transaction before it gets processed.  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": "Deposit cancelled: deposit-uuid-here"
}
```

### 6. Get User Subscriptions

**Endpoint**: `GET /api/finance/userSubscriptions/{userUniqueId}`  
**Description**: Retrieves subscription information for a user, including free and paid subscriptions. Paid subscriptions are deducted from user balance.  
**Authentication**: User token required (own subscriptions) or Admin token (any user)  
**Query Parameters**:

- `status`: Filter by subscription status (active, expired, cancelled)
- `type`: Filter by subscription type (free, paid)

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "hasActiveSubscription": true,
    "currentBalance": 2500.0,
    "subscriptions": [
      {
        "userSubscriptionId": 1,
        "subscriptionPlanUniqueId": "monthly-plan-uuid",
        "planName": "Premium Monthly",
        "planType": "paid",
        "price": 500.0,
        "startDate": "2026-01-01T00:00:00.000Z",
        "endDate": "2026-02-01T00:00:00.000Z",
        "status": "active",
        "daysRemaining": 15,
        "autoRenew": true
      },
      {
        "userSubscriptionId": 2,
        "subscriptionPlanUniqueId": "free-trial-uuid",
        "planName": "Free Trial",
        "planType": "free",
        "price": 0.0,
        "startDate": "2025-12-01T00:00:00.000Z",
        "endDate": "2026-01-01T00:00:00.000Z",
        "status": "expired",
        "daysRemaining": 0,
        "autoRenew": false
      }
    ]
  }
}
```

### 3.1 Get User Subscriptions

**Endpoint**: `GET /api/finance/userSubscriptions/{userUniqueId}`  
**Description**: Retrieves subscription information for a user, including free and paid subscriptions. Paid subscriptions are deducted from user balance.  
**Authentication**: User token required (own subscriptions) or Admin token (any user)  
**Query Parameters**:

- `status`: Filter by subscription status (active, expired, cancelled)
- `type`: Filter by subscription type (free, paid)

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "hasActiveSubscription": true,
    "currentBalance": 2500.0,
    "subscriptions": [
      {
        "userSubscriptionId": 1,
        "subscriptionPlanUniqueId": "monthly-plan-uuid",
        "planName": "Premium Monthly",
        "planType": "paid",
        "price": 500.0,
        "startDate": "2026-01-01T00:00:00.000Z",
        "endDate": "2026-02-01T00:00:00.000Z",
        "status": "active",
        "daysRemaining": 15,
        "autoRenew": true
      }
    ]
  }
}
```

### 3.2 Get Subscription by ID

**Endpoint**: `GET /api/finance/userSubscription/{subscriptionUniqueId}`  
**Description**: Retrieves detailed information about a specific user subscription.  
**Authentication**: User token required (own subscription) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "userSubscriptionId": 1,
    "subscriptionUniqueId": "user-subscription-uuid",
    "userUniqueId": "user-uuid-here",
    "subscriptionPlanUniqueId": "monthly-plan-uuid",
    "planName": "Premium Monthly",
    "planType": "paid",
    "price": 500.0,
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-02-01T00:00:00.000Z",
    "status": "active",
    "daysRemaining": 15,
    "autoRenew": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### 3.3 Cancel User Subscription

**Endpoint**: `DELETE /api/finance/userSubscription/{subscriptionUniqueId}`  
**Description**: Cancels an active user subscription.  
**Authentication**: User token required (own subscription) or Admin token  
**Request Body** (optional):

```json
{
  "reason": "No longer needed",
  "refundRequested": false
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "subscriptionUniqueId": "user-subscription-uuid",
    "status": "cancelled",
    "cancelledAt": "2026-01-31T17:00:00.000Z",
    "refundProcessed": false
  }
}
```

### 7. Get Subscription Plans

**Endpoint**: `GET /api/finance/subscriptionPlans`  
**Description**: Retrieves all available subscription plans that users can subscribe to.  
**Authentication**: User token required  
**Query Parameters**:

- `isActive`: Filter by active status (true/false)
- `planType`: Filter by plan type (free, paid)

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "subscriptionPlanId": 1,
      "subscriptionPlanUniqueId": "monthly-premium-uuid",
      "planName": "Monthly Premium",
      "planDescription": "Full access to premium features for one month",
      "planType": "paid",
      "durationDays": 30,
      "isActive": true,
      "features": [
        "unlimited_requests",
        "priority_matching",
        "advanced_analytics"
      ]
    },
    {
      "subscriptionPlanId": 2,
      "subscriptionPlanUniqueId": "free-trial-uuid",
      "planName": "Free Trial",
      "planDescription": "7-day free trial with limited features",
      "planType": "free",
      "durationDays": 7,
      "isActive": true,
      "features": ["basic_requests", "standard_matching"]
    }
  ]
}
```

### 4.1 Create Subscription Plan

**Endpoint**: `POST /api/finance/subscriptionPlan`  
**Description**: Creates a new subscription plan for users to subscribe to.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "planName": "Monthly Premium",
  "planDescription": "Full access to premium features for one month",
  "planType": "paid",
  "durationDays": 30,
  "features": ["unlimited_requests", "priority_matching", "advanced_analytics"],
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "subscriptionPlanId": 1,
    "subscriptionPlanUniqueId": "monthly-premium-uuid",
    "planName": "Monthly Premium",
    "planDescription": "Full access to premium features for one month",
    "planType": "paid",
    "durationDays": 30,
    "isActive": true,
    "features": [
      "unlimited_requests",
      "priority_matching",
      "advanced_analytics"
    ],
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

### 4.2 Get All Subscription Plans

**Endpoint**: `GET /api/finance/subscriptionPlans`  
**Description**: Retrieves all available subscription plans that users can subscribe to.  
**Authentication**: User token required  
**Query Parameters**:

- `isActive`: Filter by active status (true/false)
- `planType`: Filter by plan type (free, paid)

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "subscriptionPlanId": 1,
      "subscriptionPlanUniqueId": "monthly-premium-uuid",
      "planName": "Monthly Premium",
      "planDescription": "Full access to premium features for one month",
      "planType": "paid",
      "durationDays": 30,
      "isActive": true,
      "features": [
        "unlimited_requests",
        "priority_matching",
        "advanced_analytics"
      ]
    }
  ]
}
```

### 4.3 Get Subscription Plan by ID

**Endpoint**: `GET /api/finance/subscriptionPlan/{planUniqueId}`  
**Description**: Retrieves detailed information about a specific subscription plan.  
**Authentication**: User token required  
**Response**:

```json
{
  "message": "success",
  "data": {
    "subscriptionPlanId": 1,
    "subscriptionPlanUniqueId": "monthly-premium-uuid",
    "planName": "Monthly Premium",
    "planDescription": "Full access to premium features for one month",
    "planType": "paid",
    "durationDays": 30,
    "isActive": true,
    "features": [
      "unlimited_requests",
      "priority_matching",
      "advanced_analytics"
    ],
    "createdAt": "2026-01-31T10:00:00.000Z",
    "updatedAt": "2026-01-31T10:00:00.000Z"
  }
}
```

### 4.4 Update Subscription Plan

**Endpoint**: `PUT /api/finance/subscriptionPlan/{planUniqueId}`  
**Description**: Updates an existing subscription plan configuration.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "planName": "Monthly Premium Plus",
  "planDescription": "Enhanced premium features for one month",
  "features": [
    "unlimited_requests",
    "priority_matching",
    "advanced_analytics",
    "premium_support"
  ],
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "subscriptionPlanUniqueId": "monthly-premium-uuid",
    "planName": "Monthly Premium Plus",
    "planDescription": "Enhanced premium features for one month",
    "features": [
      "unlimited_requests",
      "priority_matching",
      "advanced_analytics",
      "premium_support"
    ],
    "updatedAt": "2026-01-31T11:00:00.000Z"
  }
}
```

### 4.5 Delete Subscription Plan

**Endpoint**: `DELETE /api/finance/subscriptionPlan/{planUniqueId}`  
**Description**: Deactivates a subscription plan (soft delete to preserve existing subscriptions).  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": "Subscription plan deactivated: monthly-premium-uuid"
}
```

### 8. Get Subscription Plan Pricing

**Endpoint**: `GET /api/finance/subscriptionPricing/{planUniqueId}`  
**Description**: Retrieves pricing information for a specific subscription plan, including current price and discount offers.  
**Authentication**: User token required  
**Response**:

```json
{
  "message": "success",
  "data": {
    "subscriptionPlanUniqueId": "monthly-premium-uuid",
    "planName": "Monthly Premium",
    "basePrice": 500.0,
    "currentPrice": 450.0,
    "currency": "ETB",
    "discount": {
      "percentage": 10,
      "validUntil": "2026-02-15T00:00:00.000Z",
      "promoCode": "LAUNCH10"
    },
    "billingCycle": "monthly",
    "pricingHistory": [
      {
        "price": 500.0,
        "effectiveFrom": "2026-01-01T00:00:00.000Z",
        "effectiveTo": null
      }
    ]
  }
}
```

### 5.1 Get Payment Status

**Endpoint**: `GET /api/finance/paymentStatus/{transactionId}`  
**Description**: Checks the status of a payment transaction.  
**Authentication**: User token required (own payments) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "transactionId": "txn-uuid-here",
    "status": "COMPLETED",
    "amount": 450.0,
    "paymentMethod": "balance_deduction",
    "processedAt": "2026-01-31T16:00:00.000Z",
    "referenceNumber": "SUB20260131160000"
  }
}
```

### 5.2 Get Payment Methods

**Endpoint**: `GET /api/finance/paymentMethods`  
**Description**: Retrieves available payment methods for deposits and subscriptions.  
**Authentication**: User token required  
**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "paymentMethodId": 1,
      "methodName": "Balance Deduction",
      "methodType": "internal",
      "isActive": true,
      "description": "Deduct from user balance"
    },
    {
      "paymentMethodId": 2,
      "methodName": "Bank Transfer",
      "methodType": "external",
      "isActive": true,
      "description": "Direct bank transfer",
      "processingFee": 10.0
    },
    {
      "paymentMethodId": 3,
      "methodName": "Mobile Money",
      "methodType": "external",
      "isActive": true,
      "description": "Mobile payment platforms",
      "processingFee": 5.0
    }
  ]
}
```

### 5.3 Create Payment Method

**Endpoint**: `POST /api/finance/paymentMethod`  
**Description**: Creates a new payment method for the system.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "methodName": "Credit Card",
  "methodType": "external",
  "description": "Visa, Mastercard, and other credit cards",
  "processingFee": 15.0,
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "paymentMethodId": 4,
    "paymentMethodUniqueId": "credit-card-uuid",
    "methodName": "Credit Card",
    "methodType": "external",
    "description": "Visa, Mastercard, and other credit cards",
    "processingFee": 15.0,
    "isActive": true,
    "createdAt": "2026-01-31T12:00:00.000Z"
  }
}
```

### 5.4 Update Payment Method

**Endpoint**: `PUT /api/finance/paymentMethod/{methodUniqueId}`  
**Description**: Updates an existing payment method configuration.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "methodName": "Credit Card (Premium)",
  "processingFee": 12.0,
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "paymentMethodUniqueId": "credit-card-uuid",
    "methodName": "Credit Card (Premium)",
    "processingFee": 12.0,
    "updatedAt": "2026-01-31T13:00:00.000Z"
  }
}
```

### 9. Subscribe to Plan

**Endpoint**: `POST /api/finance/subscribe`  
**Description**: Subscribes a user to a subscription plan. Paid plans deduct from user balance immediately.  
**Balance Effect**: **Negative** (for paid plans) - Decreases user balance (Previous Balance - Subscription Cost = New Balance)  
**Authentication**: User token required  
**Request Body**:

```json
{
  "subscriptionPlanUniqueId": "monthly-premium-uuid",
  "promoCode": "LAUNCH10",
  "autoRenew": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "userSubscriptionId": 1,
    "subscriptionUniqueId": "user-subscription-uuid",
    "planName": "Monthly Premium",
    "startDate": "2026-01-31T16:00:00.000Z",
    "endDate": "2026-03-03T16:00:00.000Z",
    "amountDeducted": 450.0,
    "balanceRemaining": 2050.0,
    "status": "active"
  }
}
```

### 6.1 Get Commission Rates

**Endpoint**: `GET /api/finance/commissionRates`  
**Description**: Retrieves commission rates applied to different transaction types and user roles.  
**Authentication**: Admin token required  
**Query Parameters**:

- `userRoleId`: Filter by user role
- `transactionType`: Filter by transaction type

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "commissionRateId": 1,
      "userRoleId": 2,
      "roleName": "Driver",
      "transactionType": "transport_job",
      "ratePercentage": 15.0,
      "fixedFee": 0.0,
      "isActive": true,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "description": "15% commission on driver earnings"
    },
    {
      "commissionRateId": 2,
      "userRoleId": 1,
      "roleName": "Shipper",
      "transactionType": "booking_fee",
      "ratePercentage": 5.0,
      "fixedFee": 10.0,
      "isActive": true,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "description": "5% + 10 ETB booking fee"
    }
  ]
}
```

### 6.2 Create Commission Rate

**Endpoint**: `POST /api/finance/commissionRate`  
**Description**: Creates a new commission rate for a specific user role and transaction type.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "userRoleId": 2,
  "transactionType": "transport_job",
  "ratePercentage": 15.0,
  "fixedFee": 0.0,
  "description": "15% commission on driver earnings",
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "commissionRateId": 1,
    "commissionRateUniqueId": "driver-commission-uuid",
    "userRoleId": 2,
    "roleName": "Driver",
    "transactionType": "transport_job",
    "ratePercentage": 15.0,
    "fixedFee": 0.0,
    "isActive": true,
    "effectiveFrom": "2026-01-01T00:00:00.000Z",
    "description": "15% commission on driver earnings",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### 6.3 Get Commission Rate by ID

**Endpoint**: `GET /api/finance/commissionRate/{rateUniqueId}`  
**Description**: Retrieves detailed information about a specific commission rate.  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": {
    "commissionRateId": 1,
    "commissionRateUniqueId": "driver-commission-uuid",
    "userRoleId": 2,
    "roleName": "Driver",
    "transactionType": "transport_job",
    "ratePercentage": 15.0,
    "fixedFee": 0.0,
    "isActive": true,
    "effectiveFrom": "2026-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "description": "15% commission on driver earnings",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### 6.4 Update Commission Rate

**Endpoint**: `PUT /api/finance/commissionRate/{rateUniqueId}`  
**Description**: Updates an existing commission rate configuration.  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "ratePercentage": 12.0,
  "description": "12% commission on driver earnings (reduced rate)",
  "isActive": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "commissionRateUniqueId": "driver-commission-uuid",
    "ratePercentage": 12.0,
    "description": "12% commission on driver earnings (reduced rate)",
    "updatedAt": "2026-01-31T14:00:00.000Z"
  }
}
```

### 6.5 Delete Commission Rate

**Endpoint**: `DELETE /api/finance/commissionRate/{rateUniqueId}`  
**Description**: Deactivates a commission rate (soft delete to preserve historical data).  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": "Commission rate deactivated: driver-commission-uuid"
}
```

### 10. Get Payment Status

**Endpoint**: `GET /api/finance/paymentStatus/{transactionId}`  
**Description**: Checks the status of a payment transaction.  
**Authentication**: User token required (own payments) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "transactionId": "txn-uuid-here",
    "status": "COMPLETED",
    "amount": 450.0,
    "paymentMethod": "balance_deduction",
    "processedAt": "2026-01-31T16:00:00.000Z",
    "referenceNumber": "SUB20260131160000"
  }
}
```

### 7.1 Process User Refund

**Endpoint**: `POST /api/finance/refund`  
**Description**: Processes a refund request, adding funds back to user balance.  
**Balance Effect**: **Positive** - Increases user balance (Previous Balance + Refund Amount = New Balance)  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "userUniqueId": "user-uuid-here",
  "amount": 500.0,
  "reason": "Service cancellation",
  "originalTransactionId": "original-txn-uuid",
  "refundType": "full_refund"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "refundId": 1,
    "refundUniqueId": "refund-uuid-here",
    "userUniqueId": "user-uuid-here",
    "amount": 500.0,
    "balanceBefore": 1000.0,
    "balanceAfter": 1500.0,
    "status": "COMPLETED",
    "processedAt": "2026-01-31T17:00:00.000Z",
    "processedBy": "admin-uuid-here"
  }
}
```

### 7.2 Get User Refunds

**Endpoint**: `GET /api/finance/userRefunds/{userUniqueId}`  
**Description**: Retrieves all refund transactions for a specific user.  
**Authentication**: User token required (own refunds) or Admin token  
**Query Parameters**:

- `status`: Filter by refund status (pending, completed, rejected)
- `limit`: Number of refunds to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "refundId": 1,
      "refundUniqueId": "refund-uuid-here",
      "userUniqueId": "user-uuid-here",
      "amount": 500.0,
      "reason": "Service cancellation",
      "status": "COMPLETED",
      "processedAt": "2026-01-31T17:00:00.000Z",
      "processedBy": "admin-uuid-here"
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 10,
    "offset": 0,
    "hasNext": false
  }
}
```

### 7.3 Get Refund by ID

**Endpoint**: `GET /api/finance/userRefund/{refundUniqueId}`  
**Description**: Retrieves detailed information about a specific refund transaction.  
**Authentication**: User token required (own refund) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "refundId": 1,
    "refundUniqueId": "refund-uuid-here",
    "userUniqueId": "user-uuid-here",
    "amount": 500.0,
    "balanceBefore": 1000.0,
    "balanceAfter": 1500.0,
    "reason": "Service cancellation",
    "originalTransactionId": "original-txn-uuid",
    "refundType": "full_refund",
    "status": "COMPLETED",
    "processedAt": "2026-01-31T17:00:00.000Z",
    "processedBy": "admin-uuid-here",
    "createdAt": "2026-01-31T16:30:00.000Z"
  }
}
```

### 7.4 Update Refund Status

**Endpoint**: `PUT /api/finance/userRefund/{refundUniqueId}`  
**Description**: Updates the status of a refund request (approve/reject pending refunds).  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "status": "COMPLETED",
  "reason": "Refund processed successfully"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "refundId": 1,
    "refundUniqueId": "refund-uuid-here",
    "status": "COMPLETED",
    "processedAt": "2026-01-31T17:00:00.000Z",
    "processedBy": "admin-uuid-here",
    "reason": "Refund processed successfully"
  }
}
```

### 11. Get Payment Methods

**Endpoint**: `GET /api/finance/paymentMethods`  
**Description**: Retrieves available payment methods for deposits and subscriptions.  
**Authentication**: User token required  
**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "paymentMethodId": 1,
      "methodName": "Balance Deduction",
      "methodType": "internal",
      "isActive": true,
      "description": "Deduct from user balance"
    },
    {
      "paymentMethodId": 2,
      "methodName": "Bank Transfer",
      "methodType": "external",
      "isActive": true,
      "description": "Direct bank transfer",
      "processingFee": 10.0
    },
    {
      "paymentMethodId": 3,
      "methodName": "Mobile Money",
      "methodType": "external",
      "isActive": true,
      "description": "Mobile payment platforms",
      "processingFee": 5.0
    }
  ]
}
```

### 8.1 Transfer Balance

**Endpoint**: `POST /api/finance/balanceTransfer`  
**Description**: Transfers balance from one user to another, with admin approval for security.  
**Balance Effect**: **Sender: Negative** - Decreases sender balance (Previous Balance - Transfer Amount = New Balance)  
**Balance Effect**: **Receiver: Positive** - Increases receiver balance (Previous Balance + Transfer Amount = New Balance)  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "fromUserUniqueId": "sender-uuid-here",
  "toUserUniqueId": "receiver-uuid-here",
  "amount": 200.0,
  "reason": "Account correction",
  "requiresApproval": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "transferId": 1,
    "transferUniqueId": "transfer-uuid-here",
    "fromUserUniqueId": "sender-uuid-here",
    "toUserUniqueId": "receiver-uuid-here",
    "amount": 200.0,
    "status": "PENDING_APPROVAL",
    "requestedAt": "2026-01-31T17:30:00.000Z",
    "requestedBy": "admin-uuid-here"
  }
}
```

### 8.2 Get User Balance Transfers

**Endpoint**: `GET /api/finance/balanceTransfers/{userUniqueId}`  
**Description**: Retrieves all balance transfer transactions for a specific user (as sender or receiver).  
**Authentication**: User token required (own transfers) or Admin token  
**Query Parameters**:

- `direction`: Filter by direction (sent, received)
- `status`: Filter by transfer status (pending, completed, cancelled)
- `limit`: Number of transfers to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "transferId": 1,
      "transferUniqueId": "transfer-uuid-here",
      "fromUserUniqueId": "sender-uuid-here",
      "toUserUniqueId": "receiver-uuid-here",
      "amount": 200.0,
      "direction": "sent",
      "status": "COMPLETED",
      "reason": "Account correction",
      "processedAt": "2026-01-31T18:00:00.000Z",
      "processedBy": "admin-uuid-here"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 10,
    "offset": 0,
    "hasNext": false
  }
}
```

### 8.3 Get Balance Transfer by ID

**Endpoint**: `GET /api/finance/balanceTransfer/{transferUniqueId}`  
**Description**: Retrieves detailed information about a specific balance transfer.  
**Authentication**: User token required (own transfer) or Admin token  
**Response**:

```json
{
  "message": "success",
  "data": {
    "transferId": 1,
    "transferUniqueId": "transfer-uuid-here",
    "fromUserUniqueId": "sender-uuid-here",
    "toUserUniqueId": "receiver-uuid-here",
    "fromUserName": "Sender User",
    "toUserName": "Receiver User",
    "amount": 200.0,
    "balanceBeforeSender": 1000.0,
    "balanceAfterSender": 800.0,
    "balanceBeforeReceiver": 500.0,
    "balanceAfterReceiver": 700.0,
    "reason": "Account correction",
    "status": "COMPLETED",
    "requestedAt": "2026-01-31T17:30:00.000Z",
    "processedAt": "2026-01-31T18:00:00.000Z",
    "processedBy": "admin-uuid-here"
  }
}
```

### 8.4 Update Transfer Status

**Endpoint**: `PUT /api/finance/balanceTransfer/{transferUniqueId}`  
**Description**: Updates the status of a balance transfer request (approve/reject pending transfers).  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "status": "COMPLETED",
  "reason": "Transfer approved and processed"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "transferId": 1,
    "transferUniqueId": "transfer-uuid-here",
    "status": "COMPLETED",
    "processedAt": "2026-01-31T18:00:00.000Z",
    "processedBy": "admin-uuid-here",
    "reason": "Transfer approved and processed"
  }
}
```

### 8.5 Cancel Balance Transfer

**Endpoint**: `DELETE /api/finance/balanceTransfer/{transferUniqueId}`  
**Description**: Cancels a pending balance transfer request.  
**Authentication**: Admin token required  
**Response**:

```json
{
  "message": "success",
  "data": "Balance transfer cancelled: transfer-uuid-here"
}
```

### 12. Get Commission Rates

**Endpoint**: `GET /api/finance/commissionRates`  
**Description**: Retrieves commission rates applied to different transaction types and user roles.  
**Authentication**: Admin token required  
**Query Parameters**:

- `userRoleId`: Filter by user role
- `transactionType`: Filter by transaction type

**Response**:

```json
{
  "message": "success",
  "data": [
    {
      "commissionRateId": 1,
      "userRoleId": 2,
      "roleName": "Driver",
      "transactionType": "transport_job",
      "ratePercentage": 15.0,
      "fixedFee": 0.0,
      "isActive": true,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "description": "15% commission on driver earnings"
    },
    {
      "commissionRateId": 2,
      "userRoleId": 1,
      "roleName": "Shipper",
      "transactionType": "booking_fee",
      "ratePercentage": 5.0,
      "fixedFee": 10.0,
      "isActive": true,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "description": "5% + 10 ETB booking fee"
    }
  ]
}
```

### 9.1 Get User Balance

**Endpoint**: `GET /api/finance/userBalance/{userUniqueId}`  
**Description**: Retrieves the current balance and transaction history for a user.  
**Authentication**: User token required (own balance) or Admin token  
**Query Parameters**:

- `includeHistory`: Include transaction history (true/false)
- `limit`: Number of transactions to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "currentBalance": 2500.0,
    "availableBalance": 2400.0,
    "pendingBalance": 100.0,
    "lastUpdated": "2026-01-31T18:00:00.000Z",
    "transactionHistory": [
      {
        "transactionId": 1,
        "transactionType": "deposit",
        "amount": 1000.0,
        "description": "Driver earnings",
        "createdAt": "2026-01-30T10:00:00.000Z",
        "balanceAfter": 2500.0
      },
      {
        "transactionId": 2,
        "transactionType": "subscription",
        "amount": -450.0,
        "description": "Monthly Premium subscription",
        "createdAt": "2026-01-31T16:00:00.000Z",
        "balanceAfter": 2050.0
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "hasNext": true
    }
  }
}
```

### 9.2 Get Balance History

**Endpoint**: `GET /api/finance/balanceHistory/{userUniqueId}`  
**Description**: Retrieves detailed balance transaction history with filtering options.  
**Authentication**: User token required (own history) or Admin token  
**Query Parameters**:

- `transactionType`: Filter by type (deposit, subscription, refund, transfer)
- `startDate`: Filter from date (ISO format)
- `endDate`: Filter to date (ISO format)
- `limit`: Number of transactions to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "totalTransactions": 25,
    "balanceSummary": {
      "totalDeposits": 5000.0,
      "totalSubscriptions": -1200.0,
      "totalRefunds": 200.0,
      "totalTransfers": -300.0,
      "netBalance": 3700.0
    },
    "transactions": [
      {
        "transactionId": 1,
        "type": "deposit",
        "amount": 1000.0,
        "description": "Driver earnings",
        "reference": "TXN123456",
        "createdAt": "2026-01-30T10:00:00.000Z",
        "balanceAfter": 2500.0
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "hasNext": true
    }
  }
}
```

### 13. Process User Refund

**Endpoint**: `POST /api/finance/refund`  
**Description**: Processes a refund request, adding funds back to user balance.  
**Balance Effect**: **Positive** - Increases user balance (Previous Balance + Refund Amount = New Balance)  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "userUniqueId": "user-uuid-here",
  "amount": 500.0,
  "reason": "Service cancellation",
  "originalTransactionId": "original-txn-uuid",
  "refundType": "full_refund"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "refundId": 1,
    "refundUniqueId": "refund-uuid-here",
    "userUniqueId": "user-uuid-here",
    "amount": 500.0,
    "balanceBefore": 1000.0,
    "balanceAfter": 1500.0,
    "status": "COMPLETED",
    "processedAt": "2026-01-31T17:00:00.000Z",
    "processedBy": "admin-uuid-here"
  }
}
```

### 14. Transfer Balance

**Endpoint**: `POST /api/finance/balanceTransfer`  
**Description**: Transfers balance from one user to another, with admin approval for security.  
**Balance Effect**: **Sender: Negative** - Decreases sender balance (Previous Balance - Transfer Amount = New Balance)  
**Balance Effect**: **Receiver: Positive** - Increases receiver balance (Previous Balance + Transfer Amount = New Balance)  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "fromUserUniqueId": "sender-uuid-here",
  "toUserUniqueId": "receiver-uuid-here",
  "amount": 200.0,
  "reason": "Account correction",
  "requiresApproval": true
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "transferId": 1,
    "transferUniqueId": "transfer-uuid-here",
    "fromUserUniqueId": "sender-uuid-here",
    "toUserUniqueId": "receiver-uuid-here",
    "amount": 200.0,
    "status": "PENDING_APPROVAL",
    "requestedAt": "2026-01-31T17:30:00.000Z",
    "requestedBy": "admin-uuid-here"
  }
}
```

### 15. Get User Balance

**Endpoint**: `GET /api/finance/userBalance/{userUniqueId}`  
**Description**: Retrieves the current balance and transaction history for a user.  
**Authentication**: User token required (own balance) or Admin token  
**Query Parameters**:

- `includeHistory`: Include transaction history (true/false)
- `limit`: Number of transactions to return
- `offset`: Pagination offset

**Response**:

```json
{
  "message": "success",
  "data": {
    "userUniqueId": "user-uuid-here",
    "currentBalance": 2500.0,
    "availableBalance": 2400.0,
    "pendingBalance": 100.0,
    "lastUpdated": "2026-01-31T18:00:00.000Z",
    "transactionHistory": [
      {
        "transactionId": 1,
        "transactionType": "deposit",
        "amount": 1000.0,
        "description": "Driver earnings",
        "createdAt": "2026-01-30T10:00:00.000Z",
        "balanceAfter": 2500.0
      },
      {
        "transactionId": 2,
        "transactionType": "subscription",
        "amount": -450.0,
        "description": "Monthly Premium subscription",
        "createdAt": "2026-01-31T16:00:00.000Z",
        "balanceAfter": 2050.0
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "hasNext": true
    }
  }
}
```

### 16. Approve Pending Deposits (Admin)

**Endpoint**: `POST /api/finance/approveDeposit`  
**Description**: Admin approves pending deposit transactions that require manual approval.  
**Balance Effect**: **Positive** - Increases user balance upon approval (Previous Balance + Deposit Amount = New Balance)  
**Authentication**: Admin token required  
**Request Body**:

```json
{
  "depositUniqueId": "deposit-uuid-here",
  "approvalStatus": "APPROVED",
  "approvalReason": "Verified transaction details"
}
```

**Response**:

```json
{
  "message": "success",
  "data": {
    "depositId": 1,
    "status": "APPROVED",
    "approvedBy": "admin-uuid-here",
    "approvedAt": "2026-01-31T18:30:00.000Z",
    "userBalanceUpdated": true
  }
}
```
