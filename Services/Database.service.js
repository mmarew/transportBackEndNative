const Config = require("../Utils/Config");
const { sqlQuery } = require("../Database/Database");
const { pool, config: dbConfig } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
const { transactionStorage } = require("../Utils/TransactionContext");
const {
  vehicleTypes,
  driversDocumentRequirement,
  statusList,
  roleList,
  listOfDocuments,
  journeyStatus,
  cancellationReasons,
  paymentStatus,
  paymentMethod,
  CommissionRates,
  TariffRateList,
  listOfVehicleStatusTypes,
  financialInstitutionAccount,
  subscriptionPlanLists,
  depositSources,
  passengerDocumentRequirement,
  listOfDelinquenciesTypes,
  subscriptionPlanPricingLists,
  commissionStatusList,
} = require("../Utils/ListOfSeedData");
const { createDelinquencyType } = require("./DelinquencyTypes.service");
const { createCommissionStatus } = require("./CommissionStatus.service");
const { createVehicleStatusType } = require("./VehicleStatusType.service");
const { addCancellationReason } = require("./Cancellation.service");
const { createCommissionRate } = require("./CommissionRates.service");
const { createDocumentType } = require("./DocumentTypes.service");
const { createJourneyStatus } = require("./JourneyStatus.service");
const { createPaymentMethod } = require("./PaymentMethod.service");
const { createPaymentStatus } = require("./PaymentStatus.service");
const { createMapping } = require("./RoleDocumentRequirements.service");
const { createTariffRate } = require("./TariffRate.service");
const { createUserSystem, ensureCredentialForUser } = require("./User.service");
const { createVehicleType } = require("./VehicleType.service");
const {
  createFinancialInstitutionAccount,
} = require("./FinancialInstitutionAccount.service");
const {
  createSubscriptionPlan,
  getSubscriptionPlans,
} = require("./SubscriptionPlan.service");
const { createDepositSource } = require("./DepositSource.service");
const { createPricing } = require("./SubscriptionPlanPricing.service");

const createTable = async () => {
  // Use a dedicated connection with multiple statements enabled for schema setup
  const adminConnection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  });
  await adminConnection.query(sqlQuery);
  await adminConnection.end();

  // Insert Super Admin user first (minimal Users row) to use as createdBy for seeding
  const superAdminId = uuidv4();
  const superAdminFullName = Config.SUPER_ADMIN.FULL_NAME;
  const superAdminPhone = Config.SUPER_ADMIN.PHONE;
  const superAdminEmail = Config.SUPER_ADMIN.EMAIL;

  await pool.query(
    `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fullName=VALUES(fullName), phoneNumber=VALUES(phoneNumber), email=VALUES(email)`,
    [
      superAdminId,
      superAdminFullName,
      superAdminPhone,
      superAdminEmail,
      currentDate(),
      superAdminId,
    ],
  );
  // Resolve the actual super admin userUniqueId in DB (handles duplicates on phone/email)
  const [superRows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE email = ? OR phoneNumber = ? LIMIT 1`,
    [superAdminEmail, superAdminPhone],
  );
  const effectiveSuperAdminId = superRows?.[0]?.userUniqueId || superAdminId;

  await ensureCredentialForUser({
    userUniqueId: effectiveSuperAdminId,
    rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
  });

  // Seed Statuses first to satisfy FK constraints for UserRoleStatusCurrent
  for (const status of statusList) {
    const { statusId, statusUniqueId, statusName, statusDescription } = status;
    const seedStatusSql = `
      INSERT INTO Statuses (statusId, statusUniqueId, statusName, statusDescription, statusCreatedBy, statusCreatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE statusName = VALUES(statusName), statusDescription = VALUES(statusDescription);
    `;
    await pool.query(seedStatusSql, [
      statusId,
      statusUniqueId,
      statusName,
      statusDescription,
      effectiveSuperAdminId,
      currentDate(),
    ]);
  }

  // Seed Roles to satisfy FK constraints for UserRole
  for (const role of roleList) {
    const { roleId, roleUniqueId, roleName, roleDescription } = role;
    const seedSql = `
      INSERT INTO Roles (roleId, roleUniqueId, roleName, roleDescription, roleCreatedBy, roleCreatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE roleName = VALUES(roleName), roleDescription = VALUES(roleDescription);
    `;
    await pool.query(seedSql, [
      roleId,
      roleUniqueId,
      roleName,
      roleDescription,
      effectiveSuperAdminId,
      currentDate(),
    ]);
  }

  // Seed VehicleStatusTypes (e.g. for VehicleStatus FK)
  for (const row of listOfVehicleStatusTypes) {
    const {
      VehicleStatusTypeId,
      VehicleStatusTypeName,
      statusTypeDescription,
    } = row;
    const seedSql = `
      INSERT INTO VehicleStatusTypes (VehicleStatusTypeId, VehicleStatusTypeName, VehicleStatusTypeDescription, VehicleStatusTypeCreatedBy, VehicleStatusTypeCreatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE VehicleStatusTypeName = VALUES(VehicleStatusTypeName), VehicleStatusTypeDescription = VALUES(VehicleStatusTypeDescription);
    `;
    await pool.query(seedSql, [
      VehicleStatusTypeId,
      VehicleStatusTypeName,
      statusTypeDescription ?? null,
      effectiveSuperAdminId,
      currentDate(),
    ]);
  }

  // Now create system and super admin users (relies on Roles existing)
  await createUserSystem();
  return {
    message: "success",
    data: `Tables created successfully`,
  };
};

const getAllTables = async () => {
  const sqlQuery = `SHOW TABLES`;
  const [tables] = await pool.query(sqlQuery);
  return { message: "success", data: tables, numberOfTables: tables.length };
};

const checkTableExists = async (tableName) => {
  const sqlQuery = `
    SELECT COUNT(*) AS tableExists 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = ?;
  `;
  const [rows] = await pool.query(sqlQuery, [tableName]);
  return rows[0].tableExists > 0;
};

const dropTable = async (tableName) => {
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const sqlQuery = `DROP TABLE IF EXISTS \`${tableName}\`;`;
  const executor = transactionStorage.getStore() || pool;

  try {
    await executor.query(disableForeignKeyChecks);
    await executor.query(sqlQuery);

    const tableExists = await checkTableExists(tableName);
    if (tableExists) {
      throw new Error(`Table ${tableName} still exists after drop attempt.`);
    }

    return {
      tableExists: false,
      message: "success",
      data: `Table ${tableName} dropped successfully`,
    };
  } finally {
    await executor.query(enableForeignKeyChecks);
  }
};

const dropAllTables = async () => {
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const maxRetries = 3;
  const executor = transactionStorage.getStore() || pool;

  try {
    await executor.query(disableForeignKeyChecks);

    const sqlQuery = `SHOW TABLES`;
    const [tables] = await executor.query(sqlQuery);
    const tableNames = tables.map((table) => Object.values(table)[0]);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const remainingTables = [];

      for (const tableName of tableNames) {
        const sqlToDropTable = `DROP TABLE IF EXISTS \`${tableName}\``;
        try {
          await executor.query(sqlToDropTable);
        } catch (error) {
          if (error.code === "ER_ROW_IS_REFERENCED_2") {
            remainingTables.push(tableName);
          } else {
            logger.error("Error dropping table", {
              tableName,
              error: error.message,
            });
          }
        }
      }

      if (remainingTables.length === 0) {
        break;
      }

      if (attempt === maxRetries && remainingTables.length > 0) {
        throw new AppError("Failed to drop all tables after 3 attempts", 500);
      }
    }

    return { message: "success", data: "All tables dropped successfully" };
  } finally {
    await executor.query(enableForeignKeyChecks);
  }
};

const updateTable = async (tableName, updateData) => {
  const { columnName, columnType, defaultValue } = updateData;
  const sqlQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} DEFAULT ${defaultValue}`;
  const executor = transactionStorage.getStore() || pool;

  await executor.query(sqlQuery);
  return {
    message: "success",
    data: `Table ${tableName} updated successfully`,
  };
};

const changeColumnProperty = async (
  tableName,
  { oldColumnName, newColumnName, newColumnType },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} CHANGE ${oldColumnName} ${newColumnName} ${newColumnType}`;
  const executor = transactionStorage.getStore() || pool;

  await executor.query(sqlQuery);
  return {
    message: "success",
    data: `Column ${oldColumnName} changed to ${newColumnName} with type ${newColumnType}`,
  };
};

const dropColumn = async (tableName, columnName) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
  const executor = transactionStorage.getStore() || pool;

  await executor.query(sqlQuery);
  return {
    message: "success",
    data: `Column ${columnName} dropped from table ${tableName}`,
  };
};

const getTableColumns = async (tableName) => {
  const sqlQuery = `SHOW COLUMNS FROM ${tableName}`;
  const [columns] = await pool.query(sqlQuery);
  return { message: "success", data: columns };
};

const installPreDefinedData = async (req) => {
  const user = req?.user;
  const userUniqueId = user?.userUniqueId;

  // Helper function to insert data sequentially
  const processDataSequentially = async (
    list,
    createFunction,
    successArray,
    errorArray,
    label,
  ) => {
    for (const item of list) {
      try {
        const result = await createFunction({ ...item, user, userUniqueId });
        if (result.message === "success") {
          successArray.push({ label, item });
        } else {
          errorArray.push({
            label,
            item,
            error: result.error || "Failed to create item",
          });
        }
      } catch (error) {
        logger.error("Error creating item in predefined data", {
          label,
          item,
          error: error.message,
        });
        errorArray.push({
          label,
          item,
          error: error.message || "Failed to create item due to server error",
        });
      }
    }
  };

  // Arrays to store success and error data
  const statusSuccess = [],
    statusErrors = [],
    successRoles = [],
    failedRoles = [],
    successVehicleTypes = [],
    failedVehicleTypes = [],
    successDocumentTypes = [],
    failedDocumentTypes = [],
    successOnDocumentRequirement = [],
    failedOnDocumentRequirement = [],
    failedJourneyStatus = [],
    successJourneyStatus = [],
    cancellationReasonsSuccess = [],
    cancellationReasonsErrors = [],
    paymentStatusSuccess = [],
    paymentStatusErrors = [],
    createPaymentMethodSuccess = [],
    createPaymentMethodErrors = [],
    successCommissionRates = [],
    failedCommissionRates = [],
    successTariffRateForVehicleType = [],
    failedTariffRateForVehicleType = [],
    successTariffRate = [],
    failedTariffRate = [],
    successVehicleStatusTypes = [],
    failedVehicleStatusTypes = [],
    financialInstitutionAccountSuccess = [],
    financialInstitutionAccountErrors = [],
    subscriptionPlanListsSuccess = [],
    subscriptionPlanListsErrors = [],
    depositSourcesSuccess = [],
    depositSourcesErrors = [],
    successPassengerDocumentRequirement = [],
    failedPassengerDocumentRequirement = [],
    listOfDelinquenciesTypesSuccess = [],
    listOfDelinquenciesTypesErrors = [],
    commissionStatusSuccess = [],
    commissionStatusErrors = [],
    subscriptionPlanPricingSuccess = [],
    subscriptionPlanPricingErrors = [];

  await processDataSequentially(
    listOfVehicleStatusTypes,
    (vehicleStatusType) =>
      createVehicleStatusType({
        ...vehicleStatusType,
        user,
      }),
    successVehicleStatusTypes,
    failedVehicleStatusTypes,
    "VehicleStatusType",
  );

  await processDataSequentially(
    journeyStatus,
    (status) => createJourneyStatus(status, user),
    successJourneyStatus,
    failedJourneyStatus,
    "JourneyStatus",
  );

  // await processDataSequentially(
  //   statusList,
  //   createStatus,
  //   statusSuccess,
  //   statusErrors,
  //   "Status",
  // );

  // await processDataSequentially(
  //   roleList,
  //   (role) => createRole({ ...role, user }),
  //   successRoles,
  //   failedRoles,
  //   "Role",
  // );

  await processDataSequentially(
    vehicleTypes,
    (VehicleType) => createVehicleType({ ...VehicleType }, user.userUniqueId),
    successVehicleTypes,
    failedVehicleTypes,
    "VehicleTypes",
  );

  await processDataSequentially(
    listOfDocuments,
    (document) =>
      createDocumentType({
        body: { ...document, user },
      }),
    successDocumentTypes,
    failedDocumentTypes,
    "DocumentType",
  );

  await processDataSequentially(
    driversDocumentRequirement,
    (document) => {
      return createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      });
    },
    successOnDocumentRequirement,
    failedOnDocumentRequirement,
    "DocumentRequirement",
  );

  await processDataSequentially(
    passengerDocumentRequirement,
    (document) =>
      createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      }),
    successPassengerDocumentRequirement,
    failedPassengerDocumentRequirement,
    "ShipperDocumentRequirement",
  );

  await processDataSequentially(
    cancellationReasons,
    (reason) => addCancellationReason(reason, user),
    cancellationReasonsSuccess,
    cancellationReasonsErrors,
    "CancellationReasonsType",
  );

  await processDataSequentially(
    paymentStatus,
    createPaymentStatus,
    paymentStatusSuccess,
    paymentStatusErrors,
    "PaymentStatus",
  );

  await processDataSequentially(
    paymentMethod,
    (method) =>
      createPaymentMethod({ paymentMethod: method.paymentMethod, user }),
    createPaymentMethodSuccess,
    createPaymentMethodErrors,
    "PaymentMethod",
  );

  let updatedCommissionRates = CommissionRates.map((item) => {
    return { ...item, commissionRateCreatedBy: user.userUniqueId };
  });
  await processDataSequentially(
    updatedCommissionRates,
    createCommissionRate,
    successCommissionRates,
    failedCommissionRates,
    "CommissionRates",
  );

  await processDataSequentially(
    TariffRateList,
    createTariffRate,
    successTariffRate,
    failedTariffRate,
    "TariffRateList",
  );

  await processDataSequentially(
    financialInstitutionAccount,
    (account) => createFinancialInstitutionAccount({ ...account, user }),
    financialInstitutionAccountSuccess,
    financialInstitutionAccountErrors,
    "financialInstitutionAccount",
  );

  await processDataSequentially(
    subscriptionPlanLists,
    (plan) => createSubscriptionPlan({ ...plan, user }),
    subscriptionPlanListsSuccess,
    subscriptionPlanListsErrors,
    "subscriptionPlanLists",
  );

  await processDataSequentially(
    depositSources,
    (source) => createDepositSource({ ...source, user }),
    depositSourcesSuccess,
    depositSourcesErrors,
    "depositSources",
  );

  await processDataSequentially(
    listOfDelinquenciesTypes,
    createDelinquencyType,
    listOfDelinquenciesTypesSuccess,
    listOfDelinquenciesTypesErrors,
    "listOfDelinquenciesTypes",
  );

  await processDataSequentially(
    commissionStatusList,
    (status) => createCommissionStatus({ ...status, user }),
    commissionStatusSuccess,
    commissionStatusErrors,
    "commissionStatusList",
  );

  const plansResult = await getSubscriptionPlans({ limit: 100 });
  const savedSubscriptionPlanLists =
    plansResult?.data?.plans || plansResult?.data || [];

  const planMapping = [
    "One month Free",
    "One month",
    "Three Months",
    "One Year",
  ];

  const updatedSubscriptionPlanPricingLists = subscriptionPlanPricingLists?.map(
    (item, index) => {
      const planName = planMapping[index];
      const matchedPlan = savedSubscriptionPlanLists?.find(
        (p) => p.planName === planName,
      );

      return {
        ...item,
        subscriptionPlanUniqueId: matchedPlan?.subscriptionPlanUniqueId,
      };
    },
  );

  await processDataSequentially(
    updatedSubscriptionPlanPricingLists,
    (pricing) => createPricing({ ...pricing, user }),
    subscriptionPlanPricingSuccess,
    subscriptionPlanPricingErrors,
    "subscriptionPlanPricing",
  );

  return {
    message: "success",
    data: {
      subscriptionPlanPricing: {
        success: subscriptionPlanPricingSuccess,
        errors: subscriptionPlanPricingErrors,
      },
      DelinquencyTypes: {
        success: listOfDelinquenciesTypesSuccess,
        errors: listOfDelinquenciesTypesErrors,
      },
      CommissionStatus: {
        success: commissionStatusSuccess,
        errors: commissionStatusErrors,
      },
      passengerDocumentRequirement: {
        success: successPassengerDocumentRequirement,
        errors: failedPassengerDocumentRequirement,
      },
      VehicleTypes: { successVehicleStatusTypes, failedVehicleStatusTypes },
      CommissionRates: { successCommissionRates, failedCommissionRates },
      TariffRateForVehcleTypes: {
        successTariffRateForVehicleType,
        failedTariffRateForVehicleType,
      },
      TariffRateList: { successTariffRate, failedTariffRate },
      paymentStatus: {
        success: paymentStatusSuccess,
        errors: paymentStatusErrors,
      },
      statuses: { success: statusSuccess, errors: statusErrors },
      roles: { success: successRoles, errors: failedRoles },
      vehicleTypes: {
        success: successVehicleTypes,
        errors: failedVehicleTypes,
      },
      documentTypes: {
        success: successDocumentTypes,
        errors: failedDocumentTypes,
      },
      documentRequirements: {
        success: successOnDocumentRequirement,
        errors: failedOnDocumentRequirement,
      },
      journeyStatus: {
        success: successJourneyStatus,
        errors: failedJourneyStatus,
      },
      cancellationReasons: {
        success: cancellationReasonsSuccess,
        errors: cancellationReasonsErrors,
      },
      financialInstitutionAccount: {
        success: financialInstitutionAccountSuccess,
        errors: financialInstitutionAccountErrors,
      },
      depositSources: {
        success: depositSourcesSuccess,
        errors: depositSourcesErrors,
      },
      subscriptionPlanLists: {
        success: subscriptionPlanListsSuccess,
        errors: subscriptionPlanListsErrors,
      },
    },
  };
};

module.exports = {
  installPreDefinedData,
  getTableColumns,
  createTable,
  getAllTables,
  dropTable,
  dropAllTables,
  updateTable,
  changeColumnProperty,
  dropColumn,
};
