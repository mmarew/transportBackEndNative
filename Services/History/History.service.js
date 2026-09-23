"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { getData } = require("../../CRUD/Read/ReadData");
const { insertData } = require("../../CRUD/Create/CreateData");
const { transactionStorage } = require("../../Utils/TransactionContext");
const AppError = require("../../Utils/AppError");

// Registry of audit-trail entities.
// entityPrefix -> column-name prefix used by the generated <Source>History
// tables (<prefix>HistoryId, <prefix>HistoryUniqueId, <prefix>Version).
// sourcePk -> PK column of the source table (used to partition versions).
const HISTORY_REGISTRY = {
  Roles: { entityPrefix: "role", sourcePk: "roleId" },
  JourneyStatus: { entityPrefix: "journeyStatus", sourcePk: "journeyStatusId" },
  VehicleStatus: { entityPrefix: "vehicleStatus", sourcePk: "vehicleStatusId" },
  VehicleStatusTypes: { entityPrefix: "vehicleStatusType", sourcePk: "VehicleStatusTypeId" },
  Statuses: { entityPrefix: "status", sourcePk: "statusId" },
  DelinquencyTypes: { entityPrefix: "delinquencyType", sourcePk: "delinquencyTypeId" },
  CancellationReasonsType: { entityPrefix: "cancellationReasonsType", sourcePk: "cancellationReasonsTypeId" },
  PaymentMethod: { entityPrefix: "paymentMethod", sourcePk: "paymentMethodId" },
  PaymentStatus: { entityPrefix: "paymentStatus", sourcePk: "paymentStatusId" },
  DepositSource: { entityPrefix: "depositSource", sourcePk: "depositSourceId" },
  CommissionRates: { entityPrefix: "commissionRate", sourcePk: "commissionRateId" },
  CompanyRoles: { entityPrefix: "companyRole", sourcePk: "companyRoleId" },
  Vehicle: { entityPrefix: "vehicle", sourcePk: "vehicleId" },
  CompanyVehicle: { entityPrefix: "companyVehicle", sourcePk: "companyVehicleId" },
  VehicleDriver: { entityPrefix: "vehicleDriver", sourcePk: "vehicleDriverId" },
  CompanyMembership: { entityPrefix: "companyMembership", sourcePk: "membershipId" },
  TariffRateForVehicleTypes: { entityPrefix: "tariffRateForVehicleType", sourcePk: "tariffRateForVehicleTypeId" },
  TariffRate: { entityPrefix: "tariffRate", sourcePk: "tariffRateId" },
  SubscriptionPlan: { entityPrefix: "subscriptionPlan", sourcePk: "subscriptionPlanId" },
  SubscriptionPlanPricing: { entityPrefix: "subscriptionPlanPricing", sourcePk: "pricingId" },
  UserSubscription: { entityPrefix: "userSubscription", sourcePk: "userSubscriptionId" },
  Commission: { entityPrefix: "commission", sourcePk: "commissionId" },
  CompanyCommission: { entityPrefix: "companyCommission", sourcePk: "companyCommissionId" },
  UserBalance: { entityPrefix: "userBalance", sourcePk: "userBalanceId" },
};

// Snapshot the current source row into its <Source>History table BEFORE a
// mutation. changeType: 'UPDATE' | 'DELETE'. Runs on the same executor as the
// caller (transaction-aware via transactionStorage) and writes each source
// column verbatim plus the history bookkeeping columns.
const insertHistoryRecord = async ({
  sourceTable,
  conditions,
  changeType,
  changedByUserId = null,
}) => {
  const cfg = HISTORY_REGISTRY[sourceTable];
  if (!cfg) {
    throw new AppError(`No history configuration for ${sourceTable}`, AppError.INTERNAL_SERVER_ERROR);
  }

  const historyTable = `${sourceTable}History`;
  const current = await getData({ tableName: sourceTable, conditions });

  if (current.length === 0) {
    throw new AppError(`${sourceTable} row not found for history record`, AppError.NOT_FOUND);
  }

  const row = current[0];
  const executor = transactionStorage.getStore() || pool;

  const [[{ maxVersion }]] = await executor.query(
    `SELECT COALESCE(MAX(${cfg.entityPrefix}Version), 0) AS maxVersion
     FROM ${historyTable}
     WHERE ${cfg.sourcePk} = ?`,
    [row[cfg.sourcePk]],
  );

  const insertDataValues = {
    [`${cfg.entityPrefix}HistoryUniqueId`]: uuidv4(),
    ...row,
    changeType,
    changedByUserId: changedByUserId || row[`${cfg.entityPrefix}CreatedBy`] || null,
    [`${cfg.entityPrefix}Version`]: Number(maxVersion) + 1,
  };

  delete insertDataValues[`${cfg.entityPrefix}HistoryId`];

  await insertData({
    tableName: historyTable,
    colAndVal: insertDataValues,
  });
};

module.exports = { insertHistoryRecord, HISTORY_REGISTRY };