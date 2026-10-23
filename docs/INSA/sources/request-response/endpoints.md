# API Endpoint Inventory

**Transport Management System API v1.0.0** — complete route inventory.

**208 routes / 289 operations**, extracted from the source routers and **validated against the running server**: every route below answered a live preflight probe (routes that answered `404` were discarded).

Auth column:

- **[A]** — requires `Authorization: Bearer <JWT>`: the route answered `401 Invalid token` when probed without a valid token.
- **[P]** — no token required: 17 endpoints (registration/login/OTP verification, health checks, payment webhook, maintenance endpoints). Listed in the README of this package.

`:param` segments are path parameters (UUIDs or numeric ids).

**Summary by group:**

| Group | Routes | Operations |
|---|---:|---:|
| `/ (root)` | 8 | 12 |
| `/api/RoleDocumentRequirements` | 2 | 4 |
| `/api/account` | 1 | 1 |
| `/api/admin` | 39 | 53 |
| `/api/company` | 26 | 37 |
| `/api/companyAdmin` | 1 | 1 |
| `/api/deliveryConfirmations` | 5 | 7 |
| `/api/dispatcher` | 1 | 1 |
| `/api/documentTypes` | 2 | 4 |
| `/api/driver` | 16 | 17 |
| `/api/finance` | 39 | 70 |
| `/api/health` | 2 | 2 |
| `/api/journeyDecisions` | 2 | 3 |
| `/api/journeyRoutePoints` | 2 | 4 |
| `/api/notifications` | 2 | 2 |
| `/api/queueOrganization` | 1 | 1 |
| `/api/ratings` | 2 | 4 |
| `/api/shipper` | 3 | 3 |
| `/api/shipperRequest` | 8 | 9 |
| `/api/shipperRequestBatch` | 5 | 6 |
| `/api/shippingRequest` | 2 | 2 |
| `/api/user` | 30 | 33 |
| `/api/utils` | 1 | 1 |
| `/api/vehicle` | 3 | 3 |
| `/api/vehicleDriver` | 2 | 4 |
| `/api/vehicleStatus` | 2 | 4 |
| `/api/vehicles` | 1 | 1 |

**Total:** 208 routes / 289 operations — 272 authenticated, 17 public.

## `/ (root)`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/` | P |
| GET | `/me/account` | A |
| GET | `/smsSender` | A |
| POST | `/smsSender` | A |
| DELETE | `/smsSender/:id` | A |
| GET | `/smsSender/:id` | A |
| PUT | `/smsSender/:id` | A |
| GET | `/tableColumns/:tableName` | A |
| POST | `/vehicleStatusType` | A |
| DELETE | `/vehicleStatusType/:vehicleStatusTypeUniqueId` | A |
| PUT | `/vehicleStatusType/:vehicleStatusTypeUniqueId` | A |
| GET | `/vehicleStatusTypes` | A |

## `/api/RoleDocumentRequirements`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/RoleDocumentRequirements/` | A |
| POST | `/api/RoleDocumentRequirements/` | A |
| DELETE | `/api/RoleDocumentRequirements/:roleDocumentRequirementUniqueId` | A |
| PUT | `/api/RoleDocumentRequirements/:roleDocumentRequirementUniqueId` | A |

## `/api/account`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/account/status` | A |

## `/api/admin`

| Method | Path | Auth |
|:---|:---|:---:|
| PUT | `/api/admin/acceptRejectAttachedDocuments` | A |
| PUT | `/api/admin/addForeignKey/:tableName` | A |
| PUT | `/api/admin/addIndex/:tableName` | A |
| PUT | `/api/admin/alterColumn/:tableName` | A |
| POST | `/api/admin/createTable` | P |
| POST | `/api/admin/createUserByAdminOrSuperAdmin` | A |
| GET | `/api/admin/database/stats` | P |
| GET | `/api/admin/dev/getUserOtp` | A |
| POST | `/api/admin/dev/seedTestDocument` | A |
| DELETE | `/api/admin/dropAllTables` | A |
| DELETE | `/api/admin/dropColumn/:tableName/:columnName` | A |
| DELETE | `/api/admin/dropForeignKey/:tableName` | A |
| DELETE | `/api/admin/dropIndex/:tableName` | A |
| DELETE | `/api/admin/dropTables` | P |
| GET | `/api/admin/getUserByFilterDetailed` | A |
| GET | `/api/admin/installPreDefinedData` | A |
| POST | `/api/admin/installPreDefinedData` | A |
| GET | `/api/admin/journeyStatus/` | A |
| POST | `/api/admin/journeyStatus/` | A |
| DELETE | `/api/admin/journeyStatus/:journeyStatusUniqueId` | A |
| PUT | `/api/admin/journeyStatus/:journeyStatusUniqueId` | A |
| GET | `/api/admin/roles/` | A |
| POST | `/api/admin/roles/` | A |
| DELETE | `/api/admin/roles/:roleUniqueId` | A |
| PUT | `/api/admin/roles/:roleUniqueId` | A |
| GET | `/api/admin/statuses/` | A |
| POST | `/api/admin/statuses/` | A |
| DELETE | `/api/admin/statuses/:statusUniqueId` | A |
| PUT | `/api/admin/statuses/:statusUniqueId` | A |
| GET | `/api/admin/tables` | A |
| GET | `/api/admin/tariffRateForVehicleType/` | A |
| POST | `/api/admin/tariffRateForVehicleType/` | A |
| DELETE | `/api/admin/tariffRateForVehicleType/:tariffRateForVehicleTypeUniqueId` | A |
| PUT | `/api/admin/tariffRateForVehicleType/:tariffRateForVehicleTypeUniqueId` | A |
| PUT | `/api/admin/updateTable/:tableName` | A |
| DELETE | `/api/admin/userRole/:userRoleUniqueId` | A |
| DELETE | `/api/admin/users/:userUniqueId/sessions` | A |
| PUT | `/api/admin/userRole/:userRoleUniqueId` | A |
| POST | `/api/admin/userRole/create` | A |
| GET | `/api/admin/userRole/filter` | A |
| POST | `/api/admin/userRoleStatus/` | P |
| DELETE | `/api/admin/userRoleStatus/:userRoleStatusUniqueId` | A |
| PUT | `/api/admin/userRoleStatus/:userUniqueId` | A |
| GET | `/api/admin/userRoleStatus/byPhone` | A |
| GET | `/api/admin/userRoleStatus/current` | A |
| GET | `/api/admin/vehicleOwnerships/` | A |
| POST | `/api/admin/vehicleOwnerships/` | A |
| DELETE | `/api/admin/vehicleOwnerships/:ownershipUniqueId` | A |
| PUT | `/api/admin/vehicleOwnerships/:ownershipUniqueId` | A |
| GET | `/api/admin/vehicleTypes/` | A |
| POST | `/api/admin/vehicleTypes/` | A |
| DELETE | `/api/admin/vehicleTypes/:vehicleTypeUniqueId` | A |
| PUT | `/api/admin/vehicleTypes/:vehicleTypeUniqueId` | A |

## `/api/company`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/company/assignments/` | A |
| POST | `/api/company/assignments/` | A |
| DELETE | `/api/company/assignments/:assignmentUniqueId` | A |
| POST | `/api/company/assignments/:assignmentUniqueId/replace` | A |
| PATCH | `/api/company/assignments/:assignmentUniqueId/status` | A |
| POST | `/api/company/assignments/auto` | A |
| POST | `/api/company/assignments/bulk` | A |
| POST | `/api/company/attachDocuments/:companyUniqueId` | A |
| GET | `/api/company/attachedDocuments/:companyUniqueId` | A |
| GET | `/api/company/bids/` | A |
| POST | `/api/company/bids/` | A |
| DELETE | `/api/company/bids/:companyBidRequestUniqueId` | A |
| PATCH | `/api/company/bids/:companyBidRequestUniqueId/markAsSeen` | A |
| PATCH | `/api/company/bids/:companyBidRequestUniqueId/status` | A |
| GET | `/api/company/companies/` | A |
| POST | `/api/company/companies/` | A |
| DELETE | `/api/company/companies/:companyUniqueId` | A |
| PATCH | `/api/company/companies/:companyUniqueId` | A |
| PATCH | `/api/company/companies/:companyUniqueId/approve` | A |
| GET | `/api/company/companies/:companyUniqueId/profileHistory` | A |
| GET | `/api/company/documentHistory/:companyUniqueId` | A |
| GET | `/api/company/fleet/` | A |
| POST | `/api/company/fleet/` | A |
| PUT | `/api/company/fleet/` | A |
| DELETE | `/api/company/fleet/:companyVehicleUniqueId` | A |
| PATCH | `/api/company/fleet/:companyVehicleUniqueId` | A |
| GET | `/api/company/memberships/` | A |
| DELETE | `/api/company/memberships/:membershipUniqueId` | A |
| PATCH | `/api/company/memberships/:membershipUniqueId` | A |
| PATCH | `/api/company/memberships/:membershipUniqueId/deactivate` | A |
| PATCH | `/api/company/memberships/:membershipUniqueId/reactivate` | A |
| POST | `/api/company/memberships/:userUniqueId` | A |
| GET | `/api/company/roles/` | A |
| POST | `/api/company/roles/` | A |
| DELETE | `/api/company/roles/:companyRoleUniqueId` | A |
| GET | `/api/company/roles/:companyRoleUniqueId` | A |
| PUT | `/api/company/roles/:companyRoleUniqueId` | A |

## `/api/companyAdmin`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/companyAdmin/account` | A |

## `/api/deliveryConfirmations`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/deliveryConfirmations/` | A |
| POST | `/api/deliveryConfirmations/` | A |
| DELETE | `/api/deliveryConfirmations/:deliveryConfirmationUniqueId` | A |
| PUT | `/api/deliveryConfirmations/:deliveryConfirmationUniqueId` | A |
| POST | `/api/deliveryConfirmations/:deliveryConfirmationUniqueId/request-sign-otp` | A |
| GET | `/api/deliveryConfirmations/:deliveryConfirmationUniqueId/verify-hash` | A |
| POST | `/api/deliveryConfirmations/receipt` | A |

## `/api/dispatcher`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/dispatcher/account` | A |

## `/api/documentTypes`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/documentTypes/` | A |
| POST | `/api/documentTypes/` | A |
| DELETE | `/api/documentTypes/:documentTypeUniqueId` | A |
| PUT | `/api/documentTypes/:documentTypeUniqueId` | A |

## `/api/driver`

| Method | Path | Auth |
|:---|:---|:---:|
| PUT | `/api/driver/acceptShipperRequest` | A |
| GET | `/api/driver/account` | A |
| PUT | `/api/driver/cancelDriverRequest` | A |
| PUT | `/api/driver/completeJourney` | A |
| POST | `/api/driver/createAndAcceptNewRequest` | A |
| GET | `/api/driver/getCancellationNotifications` | A |
| PUT | `/api/driver/goToLoadingPlace` | A |
| PUT | `/api/driver/loadCompleted` | A |
| PUT | `/api/driver/markNegativeStatusAsSeen` | A |
| POST | `/api/driver/request` | A |
| DELETE | `/api/driver/request/:driverRequestUniqueId` | A |
| PUT | `/api/driver/request/:driverRequestUniqueId` | A |
| PUT | `/api/driver/sendUpdatedLocation` | A |
| PUT | `/api/driver/startJourney` | A |
| PUT | `/api/driver/startLoading` | A |
| POST | `/api/driver/takeFromStreet` | A |
| GET | `/api/driver/verifyDriverJourneyStatus` | A |

## `/api/finance`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/finance/commission/` | A |
| POST | `/api/finance/commission/` | A |
| DELETE | `/api/finance/commission/:id` | A |
| PUT | `/api/finance/commission/:id` | A |
| GET | `/api/finance/commissionRates/` | A |
| POST | `/api/finance/commissionRates/` | A |
| DELETE | `/api/finance/commissionRates/:commissionRateUniqueId` | A |
| PUT | `/api/finance/commissionRates/:commissionRateUniqueId` | A |
| GET | `/api/finance/commissionStatus/admin/commission-statuses` | A |
| POST | `/api/finance/commissionStatus/admin/commission-statuses` | A |
| DELETE | `/api/finance/commissionStatus/admin/commission-statuses/:id` | A |
| PUT | `/api/finance/commissionStatus/admin/commission-statuses/:id` | A |
| GET | `/api/finance/depositSource/` | A |
| POST | `/api/finance/depositSource/` | A |
| DELETE | `/api/finance/depositSource/:depositSourceUniqueId` | A |
| GET | `/api/finance/depositSource/:depositSourceUniqueId` | A |
| PUT | `/api/finance/depositSource/:depositSourceUniqueId` | A |
| GET | `/api/finance/driverEarning/` | A |
| GET | `/api/finance/journeyPayments/` | A |
| POST | `/api/finance/journeyPayments/` | A |
| DELETE | `/api/finance/journeyPayments/:paymentUniqueId` | A |
| GET | `/api/finance/journeyPayments/:paymentUniqueId` | A |
| PUT | `/api/finance/journeyPayments/:paymentUniqueId` | A |
| GET | `/api/finance/paymentMethod/` | A |
| POST | `/api/finance/paymentMethod/` | A |
| DELETE | `/api/finance/paymentMethod/:paymentMethodUniqueId` | A |
| PUT | `/api/finance/paymentMethod/:paymentMethodUniqueId` | A |
| GET | `/api/finance/payments/` | A |
| POST | `/api/finance/payments/` | A |
| DELETE | `/api/finance/payments/:id` | A |
| GET | `/api/finance/payments/:id` | A |
| PUT | `/api/finance/payments/:id` | A |
| GET | `/api/finance/payments/:userUniqueId/:fromDate/:toDate` | A |
| GET | `/api/finance/paymentStatus/` | A |
| POST | `/api/finance/paymentStatus/` | A |
| DELETE | `/api/finance/paymentStatus/:paymentStatusUniqueId` | A |
| PUT | `/api/finance/paymentStatus/:paymentStatusUniqueId` | A |
| GET | `/api/finance/subscriptionPlan/` | A |
| POST | `/api/finance/subscriptionPlan/` | A |
| DELETE | `/api/finance/subscriptionPlan/:uniqueId` | A |
| PUT | `/api/finance/subscriptionPlan/:uniqueId` | A |
| GET | `/api/finance/tariffRate/` | A |
| POST | `/api/finance/tariffRate/` | A |
| DELETE | `/api/finance/tariffRate/:tariffRateUniqueId` | A |
| PUT | `/api/finance/tariffRate/:tariffRateUniqueId` | A |
| GET | `/api/finance/userBalance/` | A |
| POST | `/api/finance/userBalance/` | A |
| DELETE | `/api/finance/userBalance/:userBalanceUniqueId` | A |
| PUT | `/api/finance/userBalance/:userBalanceUniqueId` | A |
| GET | `/api/finance/userBalanceTransfer/` | A |
| DELETE | `/api/finance/userBalanceTransfer/:depositTransferUniqueId` | A |
| GET | `/api/finance/userBalanceTransfer/:depositTransferUniqueId` | A |
| PUT | `/api/finance/userBalanceTransfer/:depositTransferUniqueId` | A |
| POST | `/api/finance/userBalanceTransfer/:transferredBy` | A |
| GET | `/api/finance/userBalanceTransfer/from/:fromDriverUniqueId` | A |
| GET | `/api/finance/userBalanceTransfer/to/:toDriverUniqueId` | A |
| GET | `/api/finance/userDeposit/` | A |
| POST | `/api/finance/userDeposit/` | A |
| DELETE | `/api/finance/userDeposit/:userDepositUniqueId` | A |
| PUT | `/api/finance/userDeposit/:userDepositUniqueId` | A |
| POST | `/api/finance/userDeposit/initiateSantimPay` | A |
| POST | `/api/finance/userDeposit/santimPay/webhook` | P |
| GET | `/api/finance/userRefund/` | A |
| DELETE | `/api/finance/userRefund/:userRefundUniqueId` | A |
| PATCH | `/api/finance/userRefund/:userRefundUniqueId` | A |
| POST | `/api/finance/userRefund/:userUniqueId` | A |
| GET | `/api/finance/userSubscription/` | A |
| POST | `/api/finance/userSubscription/:driverUniqueId` | A |
| DELETE | `/api/finance/userSubscription/:userSubscriptionUniqueId` | A |
| PUT | `/api/finance/userSubscription/:userSubscriptionUniqueId` | A |

## `/api/health`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/health` | P |
| GET | `/api/health/database` | P |

## `/api/journeyDecisions`

| Method | Path | Auth |
|:---|:---|:---:|
| POST | `/api/journeyDecisions` | A |
| PUT | `/api/journeyDecisions` | A |
| DELETE | `/api/journeyDecisions/:id` | A |

## `/api/journeyRoutePoints`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/journeyRoutePoints/` | A |
| POST | `/api/journeyRoutePoints/` | A |
| DELETE | `/api/journeyRoutePoints/:pointId` | A |
| PUT | `/api/journeyRoutePoints/:pointId` | A |

## `/api/notifications`

| Method | Path | Auth |
|:---|:---|:---:|
| POST | `/api/notifications/send-to-tokens` | A |
| POST | `/api/notifications/send-to-user` | A |

## `/api/queueOrganization`

| Method | Path | Auth |
|:---|:---|:---:|
| POST | `/api/queueOrganization/createUserByQueueAdmin` | A |

## `/api/ratings`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/ratings/` | A |
| POST | `/api/ratings/` | A |
| DELETE | `/api/ratings/:id` | A |
| PUT | `/api/ratings/:id` | A |

## `/api/shipper`

| Method | Path | Auth |
|:---|:---|:---:|
| PUT | `/api/shipper/acceptDriverOffer` | A |
| GET | `/api/shipper/account` | A |
| PUT | `/api/shipper/noAnswerFromDriver` | A |

## `/api/shipperRequest`

| Method | Path | Auth |
|:---|:---|:---:|
| PUT | `/api/shipperRequest/cancelBatch/:shipperRequestBatchUniqueId` | A |
| PUT | `/api/shipperRequest/cancelShipperRequest/:userUniqueId` | A |
| POST | `/api/shipperRequest/createRequest` | A |
| DELETE | `/api/shipperRequest/getById/:id` | A |
| PUT | `/api/shipperRequest/getById/:id` | A |
| GET | `/api/shipperRequest/getCancellationNotifications` | A |
| PUT | `/api/shipperRequest/markCancellationAsSeen` | A |
| PUT | `/api/shipperRequest/markJourneyCompletionAsSeen` | A |
| GET | `/api/shipperRequest/verifyShipperStatus` | A |

## `/api/shipperRequestBatch`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/shipperRequestBatch/` | A |
| DELETE | `/api/shipperRequestBatch/:batchUniqueId` | A |
| PATCH | `/api/shipperRequestBatch/:batchUniqueId` | A |
| PUT | `/api/shipperRequestBatch/:batchUniqueId/cancel` | A |
| PUT | `/api/shipperRequestBatch/:batchUniqueId/partialCancel` | A |
| GET | `/api/shipperRequestBatch/:batchUniqueId/slots` | A |

## `/api/shippingRequest`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/shippingRequest/getAllActiveRequests` | A |
| GET | `/api/shippingRequest/getJobsAlongRoute` | A |

## `/api/user`

| Method | Path | Auth |
|:---|:---|:---:|
| POST | `/api/user/attachDocuments/:userUniqueId` | A |
| GET | `/api/user/attachedDocuments` | A |
| DELETE | `/api/user/attachedDocuments/:attachedDocumentUniqueId` | A |
| PUT | `/api/user/attachedDocuments/:attachedDocumentUniqueId` | A |
| POST | `/api/user/createUser` | P |
| DELETE | `/api/user/deleteFCMToken/:deviceTokenUniqueId` | A |
| GET | `/api/user/documentHistory` | A |
| GET | `/api/user/getDriverRequest` | A |
| GET | `/api/user/getFCMToken/:deviceTokenUniqueId` | A |
| GET | `/api/user/getFCMTokens` | A |
| GET | `/api/user/getJourneyDecision4AllOrSingleUser` | A |
| GET | `/api/user/getShipperRequest4allOrSingleUser` | A |
| POST | `/api/user/loginUser` | P |
| POST | `/api/user/logout` | P |
| GET | `/api/user/sessions` | A |
| DELETE | `/api/user/sessions` | A |
| DELETE | `/api/user/sessions/:sessionUniqueId` | A |
| PUT | `/api/user/rejectDriverOffer` | A |
| GET | `/api/user/report-wrong-email` | P |
| GET | `/api/user/self` | A |
| PUT | `/api/user/updateFCMToken/:deviceTokenUniqueId` | A |
| PUT | `/api/user/updateUser/:ownerUserUniqueId` | A |
| POST | `/api/user/upsertFCMToken` | A |
| DELETE | `/api/user/users/:userUniqueId` | A |
| GET | `/api/user/users/:userUniqueId/profileHistory` | A |
| DELETE | `/api/user/vehicles/:vehicleUniqueId` | A |
| PUT | `/api/user/vehicles/:vehicleUniqueId` | A |
| POST | `/api/user/vehicles/driverUserUniqueId/:driverUserUniqueId` | A |
| GET | `/api/user/verification-link` | A |
| GET | `/api/user/verify-email` | P |
| GET | `/api/user/verify-phone` | P |
| POST | `/api/user/verify-phone` | P |
| POST | `/api/user/verifyUserByOTP` | P |

## `/api/utils`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/utils/clear-cache` | P |

## `/api/vehicle`

| Method | Path | Auth |
|:---|:---|:---:|
| POST | `/api/vehicle/attachDocuments/:vehicleUniqueId` | A |
| GET | `/api/vehicle/attachedDocuments/:vehicleUniqueId` | A |
| GET | `/api/vehicle/documentHistory/:vehicleUniqueId` | A |

## `/api/vehicleDriver`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/vehicleDriver/` | A |
| POST | `/api/vehicleDriver/` | A |
| DELETE | `/api/vehicleDriver/:vehicleDriverUniqueId` | A |
| PUT | `/api/vehicleDriver/:vehicleDriverUniqueId` | A |

## `/api/vehicleStatus`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/vehicleStatus/` | A |
| POST | `/api/vehicleStatus/` | A |
| DELETE | `/api/vehicleStatus/:vehicleStatusUniqueId` | A |
| PUT | `/api/vehicleStatus/:vehicleStatusUniqueId` | A |

## `/api/vehicles`

| Method | Path | Auth |
|:---|:---|:---:|
| GET | `/api/vehicles` | A |
