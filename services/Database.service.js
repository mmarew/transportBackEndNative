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
} = require("../Utils/listOfFixedData");
const {
  addCancilationReasons,
  addCancellationReason,
} = require("./Cancilation.service");
const { createDocumentType } = require("./documentTypes.service");
const { createJourneyStatus } = require("./journeyStatus.service");
const { createRole } = require("./Role.service");
const { createMapping } = require("./RoleDocumentRequirements.service");
const { createStatus } = require("./Status.service");
const { createVehicleType } = require("./VechleType.service");

const createTable = async (tableData) => {
  try {
    await pool.query(sqlQuery);

    return {
      message: "success",
      data: `Tables created successfully`,
    };
  } catch (error) {
    console.error("Error creating table:", error);
    return { message: "error", error: "Failed to create table" };
  }
};

const getAllTables = async () => {
  const sqlQuery = `SHOW TABLES`;

  try {
    const [tables] = await pool.query(sqlQuery);
    return { message: "success", data: tables };
  } catch (error) {
    console.error("Error fetching tables:", error);
    return { message: "error", error: "Failed to retrieve tables" };
  }
};

const dropTable = async (tableName) => {
  const sqlQuery = `DROP TABLE IF EXISTS ${tableName}`;
  try {
    const [result] = await pool.query(sqlQuery);
    if (result.affectedRows === 0) {
      return {
        message: "success",
        data: `Table ${tableName} dropped successfully`,
      };
    } else {
      return {
        message: "error",
        error: `Failed to drop table ${tableName}`,
      };
    }
  } catch (error) {
    console.error(`Error dropping table ${tableName}:`, error);
    return { message: "error", error: `Failed to drop table ${tableName}` };
  }
};

const dropAllTables = async () => {
  const sqlQuery = `
    SET FOREIGN_KEY_CHECKS = 0;   

    -- Select all table names into a variable
    SELECT GROUP_CONCAT(table_name) INTO @tables
    FROM information_schema.tables
    WHERE table_schema = 'transport';

    -- Check if @tables is not NULL, then prepare and execute drop statement
    SET @tables = IFNULL(@tables, 'None');
    SET @dropCommand = IF(@tables = 'None', 'SELECT "No tables to drop"', CONCAT('DROP TABLE ', @tables));

    -- Prepare and execute the drop statement if tables exist
    PREPARE stmt FROM @dropCommand;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

    SET FOREIGN_KEY_CHECKS = 1;
  `;

  try {
    // Execute the query
    await pool.query(sqlQuery);
    return {
      message: "success",
      data: "All tables dropped successfully",
    };
  } catch (error) {
    console.error("Error dropping all tables:", error);
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
    console.error(`Error updating table ${tableName}:`, error);
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
    console.error(`Error altering column in table ${tableName}:`, error);
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
    console.error(
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
    console.error(`Error fetching columns for table ${tableName}:`, error);
    return {
      message: "error",
      error: `Failed to fetch columns for table ${tableName}`,
    };
  }
};
const installPreDefinedData = async (req, res) => {
  try {
    const user = req?.user;

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
          const result = await createFunction({ ...item, user });
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
          console.error(`Error inserting ${label}:`, item, error);
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
      cancellationReasonsErrors = [];
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
      "VehicleType"
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
      (role) => createMapping({ body: role, userUniqueId: user.userUniqueId }),
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
      "CancellationReason"
    );
    // Final response
    return {
      message: "success",
      data: {
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
      },
    };
  } catch (error) {
    console.error("Error installing predefined data:", error);
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
