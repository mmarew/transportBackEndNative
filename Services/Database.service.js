const { sqlQuery } = require("../Database/Database");
const { pool } = require("../Middleware/Database.config");
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
  vehicleStatusTypes,
  financialInstitutionAccount,
  subscriptionPlanLists,
} = require("../Utils/ListOfFixedData");
const { createVehicleStatusType } = require("./VehicleStatusType.service");
const { addCancellationReason } = require("./Cancilation.service");
const { createCommissionRate } = require("./CommissionRates.service");
const { createDocumentType } = require("./DocumentTypes.service");
const { createJourneyStatus } = require("./JourneyStatus.service");
const { createPaymentMethod } = require("./PaymentMethod.service");
const { createPaymentStatus } = require("./PaymentStatus.service");
const { createRole } = require("./Role.service");
const { createMapping } = require("./RoleDocumentRequirements.service");
const { createStatus } = require("./Status.service");
const { createTariffRate } = require("./TariffRate.service");
const {
  createTariffRateForVehicleType,
} = require("./TariffRateForVehicleTypes.service");
const { createUserSystem } = require("./User.service");
const { createVehicleType } = require("./VehicleType.service");
const {
  createFinancialInstitutionAccount,
} = require("./FinancialInstitutionAccount.service");
const { createSubscriptionPlan } = require("./SubscriptionPlan.service");

const createTable = async () => {
  try {
    await pool.query(sqlQuery);
    const userResult = await createUserSystem();
    console.log("@createTable userResult", userResult);
    return {
      message: "success",
      data: `Tables created successfully`,
    };
  } catch (error) {
    console.log("Error creating table:", error);
    return { message: "error", error: "Failed to create table" };
  }
};

const getAllTables = async () => {
  const sqlQuery = `SHOW TABLES`;

  try {
    const [tables] = await pool.query(sqlQuery);
    return { message: "success", data: tables, numberOfTables: tables.length };
  } catch (error) {
    console.log("Error fetching tables:", error);
    return { message: "error", error: "Failed to retrieve tables" };
  }
};
const checkTableExists = async (tableName) => {
  console.log("tableName", tableName);
  const sqlQuery = `
    SELECT COUNT(*) AS tableExists 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = ?;
  `;
  const [rows] = await pool.query(sqlQuery, [tableName]);
  console.log("rows", rows);
  return rows[0].tableExists > 0;
};

const dropTable = async (tableName) => {
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const sqlQuery = `DROP TABLE IF EXISTS \`${tableName}\`;`;

  try {
    // Disable foreign key checks
    await pool.query(disableForeignKeyChecks);

    // Attempt to drop the table
    await pool.query(sqlQuery);

    // Check if the table still exists
    const tableExists = await checkTableExists(tableName);

    if (tableExists) {
      throw new Error(`Table ${tableName} still exists after drop attempt.`);
    }

    return {
      tableExists,
      message: "success",
      data: `Table ${tableName} dropped successfully`,
    };
  } catch (error) {
    console.log(`Error dropping table ${tableName}:`, error);
    return { message: "error", error: `Failed to drop table ${tableName}` };
  } finally {
    // Re-enable foreign key checks
    await pool.query(enableForeignKeyChecks);
  }
};

const dropAllTables = async () => {
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const maxRetries = 3;

  try {
    // Disable foreign key checks
    await pool.query(disableForeignKeyChecks);

    // Get all tables
    const sqlQuery = `SHOW TABLES`;
    const [tables] = await pool.query(sqlQuery);

    // Extract table names into an array
    const tableNames = tables.map((table) => Object.values(table)[0]);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const remainingTables = [];

      // Attempt to drop each table
      for (const tableName of tableNames) {
        const sqlToDropTable = `DROP TABLE IF EXISTS \`${tableName}\``;
        try {
          await pool.query(sqlToDropTable);
          console.log(
            `Table ${tableName} dropped successfully on attempt ${attempt}`
          );
        } catch (error) {
          if (error.code === "ER_ROW_IS_REFERENCED_2") {
            remainingTables.push(tableName); // Re-try tables with foreign key constraints
          } else {
            console.log(`Error dropping table ${tableName}:`, error);
          }
        }
      }

      // If no tables are left to drop, break out of the loop
      if (remainingTables.length === 0) break;

      // If there are still tables left after max retries, log an error
      if (attempt === maxRetries && remainingTables.length > 0) {
        console.log(
          `Unable to drop tables after ${maxRetries} attempts:`,
          remainingTables
        );
        return {
          message: "error",
          data: `Failed to drop all tables after ${maxRetries} attempts`,
          remainingTables,
        };
      }
    }

    return { message: "success", data: "All tables dropped successfully" };
  } catch (error) {
    console.log("Error dropping all tables:", error);
    return {
      message: "error",
      data: "Failed to drop all tables, please try again.",
      error: error.message,
    };
  } finally {
    // Re-enable foreign key checks
    await pool.query(enableForeignKeyChecks);
  }
};

const updateTable = async (tableName, updateData) => {
  const { columnName, columnType } = updateData;
  const sqlQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;

  try {
    await pool.query(sqlQuery);
    return {
      message: "success",
      data: `Table ${tableName} updated successfully`,
    };
  } catch (error) {
    console.log(`Error updating table ${tableName}:`, error);
    return { message: "error", error: `Failed to update table ${tableName}` };
  }
};

// New: Change a column's properties (data type, rename, etc.)
const changeColumnProperty = async (
  tableName,
  { oldColumnName, newColumnName, newColumnType }
) => {
  const sqlQuery = `ALTER TABLE ${tableName} CHANGE ${oldColumnName} ${newColumnName} ${newColumnType}`;

  try {
    await pool.query(sqlQuery);
    return {
      message: "success",
      data: `Column ${oldColumnName} changed to ${newColumnName} with type ${newColumnType}`,
    };
  } catch (error) {
    console.log(`Error altering column in table ${tableName}:`, error);
    return {
      message: "error",
      error: `Failed to change column in table ${tableName}`,
    };
  }
};

// New: Drop a column from a table
const dropColumn = async (tableName, columnName) => {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;

  try {
    await pool.query(sqlQuery);
    return {
      message: "success",
      data: `Column ${columnName} dropped from table ${tableName}`,
    };
  } catch (error) {
    console.log(
      `Error dropping column ${columnName} from table ${tableName}:`,
      error
    );
    return {
      message: "error",
      error: `Failed to drop column ${columnName} from table ${tableName}`,
    };
  }
};
const getTableColumns = async (tableName) => {
  const sqlQuery = `SHOW COLUMNS FROM ${tableName}`;
  try {
    const [columns] = await pool.query(sqlQuery);
    return { message: "success", data: columns };
  } catch (error) {
    console.log(`Error fetching columns for table ${tableName}:`, error);
    return {
      message: "error",
      error: `Failed to fetch columns for table ${tableName}`,
    };
  }
};
const installPreDefinedData = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;

    // Helper function to insert data sequentially
    const processDataSequentially = async (
      list,
      createFunction,
      successArray,
      errorArray,
      label
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
          console.log(`Error inserting ${label}:`, item, error);
          errorArray.push({
            label,
            item,
            error: "Failed to create item due to server error",
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
      subscriptionPlanListsErrors = [];
    // preocess data of vehicleStatusTypes

    await processDataSequentially(
      vehicleStatusTypes,
      (vehicleStatusType) =>
        createVehicleStatusType({
          ...vehicleStatusType,
          user,
        }),
      successVehicleStatusTypes,
      failedVehicleStatusTypes,
      "VehicleStatusType"
    );
    // Process predefined data in order
    await processDataSequentially(
      journeyStatus,
      (status) => createJourneyStatus({ ...status, user }),
      successJourneyStatus,
      failedJourneyStatus,
      "JourneyStatus"
    );
    // 1. Process statuses
    await processDataSequentially(
      statusList,
      createStatus,
      statusSuccess,
      statusErrors,
      "Status"
    );

    // 2. Process roles
    await processDataSequentially(
      roleList,
      createRole,
      successRoles,
      failedRoles,
      "Role"
    );

    // 3. Process vehicle types
    await processDataSequentially(
      vehicleTypes,
      (VehicleType) => createVehicleType({ ...VehicleType }, user.userUniqueId),
      successVehicleTypes,
      failedVehicleTypes,
      "VehicleTypes"
    );

    // 4. Process document types
    await processDataSequentially(
      listOfDocuments,
      (document) =>
        createDocumentType({
          body: { ...document, user },
        }),
      successDocumentTypes,
      failedDocumentTypes,
      "DocumentType"
    );

    // 5. Process document requirements
    await processDataSequentially(
      driversDocumentRequirement,
      (document) => {
        console.log(
          "@processDataSequentially driversDocumentRequirement",
          document
        );
        return createMapping({
          body: document,
          userUniqueId: user.userUniqueId,
        });
      },
      successOnDocumentRequirement,
      failedOnDocumentRequirement,
      "DocumentRequirement"
    );
    // 6 . Process journeyStatus stages
    await processDataSequentially(
      journeyStatus,
      createJourneyStatus,
      successJourneyStatus,
      failedJourneyStatus,
      "JourneyStatus"
    );
    // 7. Process cancellationReasons
    await processDataSequentially(
      cancellationReasons,
      addCancellationReason,
      cancellationReasonsSuccess,
      cancellationReasonsErrors,
      "CancellationReasonsType"
    );
    // 8. Process paymentStatus
    await processDataSequentially(
      paymentStatus,
      createPaymentStatus,
      paymentStatusSuccess,
      paymentStatusErrors,
      "PaymentStatus"
    );
    //  9. Process paymentMethod
    await processDataSequentially(
      paymentMethod,
      createPaymentMethod,
      createPaymentMethodSuccess,
      createPaymentMethodErrors,
      "PaymentMethod"
    );
    //10. CommissionRates,
    let updatedCommissionRates = CommissionRates.map((item) => {
      return { ...item, commissionRateCreatedBy: user.userUniqueId };
    });
    await processDataSequentially(
      updatedCommissionRates,
      createCommissionRate,
      successCommissionRates,
      failedCommissionRates,
      "CommissionRates"
    );

    // 11.TariffRateList,
    await processDataSequentially(
      TariffRateList,
      createTariffRate,
      successTariffRate,
      failedTariffRate,
      "TariffRateList"
    );
    // 12. financialInstitutionAccount,
    await processDataSequentially(
      financialInstitutionAccount,
      createFinancialInstitutionAccount,
      financialInstitutionAccountSuccess,
      financialInstitutionAccountErrors,
      "financialInstitutionAccount"
    );
    // 13. subscriptionPlanLists
    await processDataSequentially(
      subscriptionPlanLists,
      createSubscriptionPlan,
      subscriptionPlanListsSuccess,
      subscriptionPlanListsErrors,
      "subscriptionPlanLists"
    );
    return {
      message: "success",
      data: {
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
      },
    };
  } catch (error) {
    console.log("Error installing predefined data:", error);
    return {
      message: "error",
      error: "Failed to install predefined data",
    };
  }
};

module.exports = {
  installPreDefinedData,
  getTableColumns,
  createTable,
  getAllTables,
  dropTable,
  dropAllTables,
  updateTable,
  changeColumnProperty, // New
  dropColumn, // New
};
