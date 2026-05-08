const Config = require("../Utils/Config");
const { sqlQuery } = require("../Database/Database");
const { pool, config: dbConfig } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

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
  companyDocumentRequirement,
  vehicleDocumentRequirement,
  companyAdminDocumentRequirement,
  dispatcherDocumentRequirement,
  listOfDelinquenciesTypes,
  subscriptionPlanPricingLists,
  companyRoleList,
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
const { createStatus } = require("./Status.service");
const { createRole } = require("./Role.service");
const { createRole: createCompanyRole } = require("./CompanyRole.service");
const { createPricing } = require("./SubscriptionPlanPricing.service");

const createTable = async () => {
  // Connect WITHOUT specifying the database so we can create it if it doesn't exist.
  const { database: dbName, ...configWithoutDb } = dbConfig;

  const adminConnection = await mysql.createConnection({
    ...configWithoutDb,
    multipleStatements: true,
  });

  try {
    // Create the database if it doesn't already exist
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.info(`Database '${dbName}' ensured (created if not existed)`);

    // Select the database before running the schema DDL
    await adminConnection.query(`USE \`${dbName}\``);

    // Run the full schema (all CREATE TABLE IF NOT EXISTS statements)
    await adminConnection.query(sqlQuery);
  } finally {
    await adminConnection.end();
  }

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

  const adminUser = { userUniqueId: effectiveSuperAdminId };

  // Seed Statuses first to satisfy FK constraints for UserRoleStatusCurrent
  for (const status of statusList) {
    try {
      await createStatus({ ...status, user: adminUser });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        console.error(`Error seeding status ${status.statusName}:`, error);
      }
    }
  }

  // Seed Roles to satisfy FK constraints for UserRole
  for (const role of roleList) {
    try {
      await createRole({ ...role, user: adminUser });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        console.error(`Error seeding role ${role.roleName}:`, error);
      }
    }
  }

  // Seed VehicleStatusTypes (e.g. for VehicleStatus FK)
  for (const vehicleStatusType of listOfVehicleStatusTypes) {
    try {
      await createVehicleStatusType({ ...vehicleStatusType, user: adminUser });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        console.error(
          `Error seeding vehicle status type ${vehicleStatusType.VehicleStatusTypeName}:`,
          error,
        );
      }
    }
  }

  // Seed CompanyRoles (Required for company creation)
  for (const companyRole of companyRoleList) {
    try {
      await createCompanyRole({
        ...companyRole,
        userUniqueId: effectiveSuperAdminId,
      });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        console.error(
          `Error seeding company role ${companyRole.companyRoleName}:`,
          error,
        );
      }
    }
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
  
  const [rows] = await executor.query(sqlQuery, [tableName]);
  return rows[0].tableExists > 0;
};

const dropTable = async (tables) => {
  const tableList = Array.isArray(tables) ? tables : [tables];
  

  try {
    await executor.query(`SET FOREIGN_KEY_CHECKS = 0;`);
    for (const table of tableList) {
      const sqlQuery = `DROP TABLE IF EXISTS \`${table}\`;`;
      await executor.query(sqlQuery);

      const tableExists = await checkTableExists(table);
      if (tableExists) {
        throw new Error(`Table ${table} still exists after drop attempt.`);
      }
    }
    return {
      message: "success",
      data: `Table(s) [${tableList.join(", ")}] dropped successfully`,
    };
  } finally {
    await executor.query(`SET FOREIGN_KEY_CHECKS = 1;`);
  }
};

const dropAllTables = async () => {
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const maxRetries = 3;
  

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
          logger.info(`Table dropped: ${tableName}`);
        } catch (error) {
          if (error.code === "ER_ROW_IS_REFERENCED_2") {
            remainingTables.push(tableName);
            logger.warn(`Table referenced, skipping for now: ${tableName}`);
          } else {
            logger.error(`Error dropping table ${tableName}: ${error.message}`);
          }
        }
      }

      if (remainingTables.length === 0) {
        logger.info("All tables dropped successfully");
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
  const { columnName, columnType, defaultValue, foreignKey } = updateData;
  

  // 1. Add the column itself
  const addColumnSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnType} DEFAULT ${defaultValue}`;
  await pool.query(addColumnSql);

  /**
   * 2. Optionally add a Foreign Key constraint.
   * We run this as a SEPARATE ALTER TABLE because MySQL does not allow
   * ADD COLUMN and ADD FOREIGN KEY in a single statement reliably.
   *
   * Expected foreignKey shape:
   * {
   *   "references": {
   *     "table": "CompanyBidRequest",
   *     "column": "companyBidRequestUniqueId"
   *   }
   * }
   * Note: the FK column is always the same as columnName — no need to repeat it.
   */
  if (foreignKey && foreignKey.references) {
    const { references } = foreignKey;
    const constraintName = `fk_${tableName}_${columnName}`.substring(0, 64);
    const addFkSql = `ALTER TABLE \`${tableName}\`
      ADD CONSTRAINT \`${constraintName}\`
      FOREIGN KEY (\`${columnName}\`)
      REFERENCES \`${references.table}\` (\`${references.column}\`)`;
    await pool.query(addFkSql);
  }

  return {
    message: "success",
    data: `Table ${tableName} updated successfully${
      foreignKey ? ` with FK on ${columnName}` : ""
    }`,
  };
};

const changeColumnProperty = async (
  tableName,
  { oldColumnName, newColumnName, newColumnType },
) => {
  const sqlQuery = `ALTER TABLE ${tableName} CHANGE ${oldColumnName} ${newColumnName} ${newColumnType}`;
  

  await pool.query(sqlQuery);
  return {
    message: "success",
    data: `Column ${oldColumnName} changed to ${newColumnName} with type ${newColumnType}`,
  };
};

const dropColumn = async (tableName, columnName) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
  

  await pool.query(sqlQuery);
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

  logger.info("Starting installPreDefinedData", {
    hasUser: !!user,
    userUniqueId,
    counts: {
      listOfVehicleStatusTypes: listOfVehicleStatusTypes?.length,
      journeyStatus: journeyStatus?.length,
      statusList: statusList?.length,
      roleList: roleList?.length,
      companyRoleList: companyRoleList?.length,
      vehicleTypes: vehicleTypes?.length,
    },
  });

  // Helper function to insert data sequentially
  const processDataSequentially = async (
    list,
    createFunction,
    successArray,
    errorArray,
    label,
  ) => {
    if (!list || !Array.isArray(list) || list.length === 0) {
      logger.warn(`No data found for ${label} to seed`);
      return;
    }
    for (const item of list) {
      try {
        const result = await createFunction({ ...item, user, userUniqueId });
        logger.info(`Seeded ${label}:`, {
          item:
            item.statusName ||
            item.roleName ||
            item.VehicleStatusTypeName ||
            item.journeyStatusName,
        });
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
    roleSuccess = [],
    roleErrors = [],
    companyRoleSuccess = [],
    companyRoleErrors = [],
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
    successCompanyDocumentRequirement = [],
    failedCompanyDocumentRequirement = [],
    successVehicleDocumentRequirement = [],
    failedVehicleDocumentRequirement = [],
    successCompanyAdminDocumentRequirement = [],
    failedCompanyAdminDocumentRequirement = [],
    successDispatcherDocumentRequirement = [],
    failedDispatcherDocumentRequirement = [],
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

  

  await processDataSequentially(
    statusList,
    async (status) => {
      try {
        return await createStatus({ ...status, user });
      } catch (error) {
        if (error.message && error.message.includes("already exists")) {
          return {
            message: "success",
            data: "Status already exists, skipping",
          };
        }
        throw error;
      }
    },
    statusSuccess,
    statusErrors,
    "Status",
  );

  await processDataSequentially(
    roleList,
    async (role) => {
      try {
        return await createRole({ ...role, user });
      } catch (error) {
        if (error.message && error.message.includes("already exists")) {
          return { message: "success", data: "Role already exists, skipping" };
        }
        throw error;
      }
    },
    roleSuccess,
    roleErrors,
    "Role",
  );

  await processDataSequentially(
    companyRoleList,
    async (companyRole) => {
      try {
        return await createCompanyRole({ ...companyRole, userUniqueId });
      } catch (error) {
        if (error.message && error.message.includes("already exists")) {
          return {
            message: "success",
            data: "Company role already exists, skipping",
          };
        }
        throw error;
      }
    },
    companyRoleSuccess,
    companyRoleErrors,
    "CompanyRoles",
  );

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
    companyDocumentRequirement,
    (document) =>
      createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      }),
    successCompanyDocumentRequirement,
    failedCompanyDocumentRequirement,
    "CompanyDocumentRequirement",
  );

  await processDataSequentially(
    vehicleDocumentRequirement,
    (document) =>
      createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      }),
    successVehicleDocumentRequirement,
    failedVehicleDocumentRequirement,
    "VehicleDocumentRequirement",
  );

  await processDataSequentially(
    companyAdminDocumentRequirement,
    (document) =>
      createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      }),
    successCompanyAdminDocumentRequirement,
    failedCompanyAdminDocumentRequirement,
    "CompanyAdminDocumentRequirement",
  );

  await processDataSequentially(
    dispatcherDocumentRequirement,
    (document) =>
      createMapping({
        body: document,
        userUniqueId: user.userUniqueId,
      }),
    successDispatcherDocumentRequirement,
    failedDispatcherDocumentRequirement,
    "DispatcherDocumentRequirement",
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
      companyDocumentRequirement: {
        success: successCompanyDocumentRequirement,
        errors: failedCompanyDocumentRequirement,
      },
      vehicleDocumentRequirement: {
        success: successVehicleDocumentRequirement,
        errors: failedVehicleDocumentRequirement,
      },
      companyAdminDocumentRequirement: {
        success: successCompanyAdminDocumentRequirement,
        errors: failedCompanyAdminDocumentRequirement,
      },
      dispatcherDocumentRequirement: {
        success: successDispatcherDocumentRequirement,
        errors: failedDispatcherDocumentRequirement,
      },
      VehicleStatusTypes: {
        success: successVehicleStatusTypes,
        errors: failedVehicleStatusTypes,
      },
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
      roles: {
        success: roleSuccess,
        errors: roleErrors,
      },
      CompanyRoles: {
        success: companyRoleSuccess,
        errors: companyRoleErrors,
      },
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
