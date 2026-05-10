const { pool } = require("../Middleware/Database.config");
const logger = require("./logger");

/**
 * Create an index on a table
 *
 * PURPOSE: Creates a database index to speed up queries on the specified column(s).
 * Indexes allow the database to quickly locate rows without scanning the entire table.
 *
 * PROBLEM SOLVED: Queries on non-indexed columns require full table scans, which become
 * exponentially slower as data grows. Indexes reduce query time from O(n) to O(log n).
 *
 * WHEN TO USE:
 * - Columns frequently used in WHERE clauses (userUniqueId, phoneNumber, email)
 * - Columns used in JOIN conditions
 * - Composite indexes for multi-column queries (userUniqueId + roleId)
 * - Unique indexes to enforce uniqueness constraints
 *
 * @param {string} tableName - Name of the table to create index on
 * @param {string|Array<string>} columns - Column name(s) to index.
 *                                         Use array for composite indexes: ['userUniqueId', 'roleId']
 * @param {Object} [options] - Index options
 * @param {string} [options.indexName] - Custom index name (auto-generated if not provided)
 *                                       Format: idx_{tableName}_{columns}
 * @param {boolean} [options.unique=false] - Whether the index should be unique (enforces uniqueness)
 * @param {string} [options.indexType='BTREE'] - Index type (BTREE, HASH, etc.). BTREE is most common.
 * @param {boolean} [options.ifNotExists=true] - Only create if index doesn't exist (prevents errors)
 * @returns {Promise<Object>} Result object with success status and index name
 *
 * @example
 * // Single column index
 * await createIndex('Users', 'phoneNumber', { unique: false });
 *
 * // Composite index (multiple columns)
 * await createIndex('UserRole', ['userUniqueId', 'roleId'], { unique: false });
 *
 * // Unique index
 * await createIndex('Users', 'userUniqueId', { unique: true });
 */
const createIndex = async (tableName, columns, options = {}) => {
  const {
    indexName = null,
    unique = false,
    indexType = "BTREE",
    ifNotExists = true,
  } = options;

  try {
    // Generate index name if not provided
    const columnList = Array.isArray(columns) ? columns.join("_") : columns;
    const finalIndexName = indexName || `idx_${tableName}_${columnList}`;

    // Build column list for index
    const columnListSql = Array.isArray(columns) ? columns.join(", ") : columns;

    // Check if index already exists
    if (ifNotExists) {
      const [existingIndexes] = await pool.query(
        `SHOW INDEXES FROM ?? WHERE Key_name = ?`,
        [tableName, finalIndexName],
      );

      if (existingIndexes.length > 0) {
        logger.info("Index already exists, skipping creation", {
          tableName,
          indexName: finalIndexName,
        });
        return {
          success: true,
          message: "Index already exists",
          indexName: finalIndexName,
        };
      }
    }

    // Build CREATE INDEX SQL
    const uniqueKeyword = unique ? "UNIQUE" : "";
    const sql = `
      CREATE ${uniqueKeyword} INDEX ${finalIndexName}
      ON ?? (${columnListSql})
      USING ${indexType}
    `;

    await pool.query(sql, [tableName]);

    logger.info("Index created successfully", {
      tableName,
      indexName: finalIndexName,
      columns: columnListSql,
      unique,
    });

    return {
      success: true,
      message: "Index created successfully",
      indexName: finalIndexName,
    };
  } catch (error) {
    logger.error("Failed to create index", {
      tableName,
      columns,
      error: error.message,
      code: error.code,
    });
    throw error;
  }
};

/**
 * Drop an index from a table
 *
 * PURPOSE: Removes an index that is no longer needed or was created incorrectly.
 *
 * WHEN TO USE:
 * - Removing unused indexes (indexes take up space and slow down INSERT/UPDATE operations)
 * - Recreating an index with different options
 * - Cleaning up test/development indexes
 *
 * @param {string} tableName - Name of the table containing the index
 * @param {string} indexName - Name of the index to drop
 * @returns {Promise<Object>} Result object with success status
 *
 * @example
 * await dropIndex('Users', 'idx_users_old_column');
 */
const dropIndex = async (tableName, indexName) => {
  try {
    await pool.query(`DROP INDEX ?? ON ??`, [indexName, tableName]);

    logger.info("Index dropped successfully", {
      tableName,
      indexName,
    });

    return {
      success: true,
      message: "Index dropped successfully",
    };
  } catch (error) {
    logger.error("Failed to drop index", {
      tableName,
      indexName,
      error: error.message,
      code: error.code,
    });
    throw error;
  }
};

/**
 * Get all indexes for a table
 *
 * PURPOSE: Lists all indexes on a table to verify index creation or analyze existing indexes.
 *
 * WHEN TO USE:
 * - Verifying that indexes were created successfully
 * - Analyzing which indexes exist before creating new ones
 * - Debugging query performance issues
 *
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array>} Array of index information objects with columns, uniqueness, etc.
 *
 * @example
 * const indexes = await getTableIndexes('Users');
 * console.log(`Users table has ${indexes.length} indexes`);
 */
const getTableIndexes = async (tableName) => {
  try {
    const [indexes] = await pool.query(`SHOW INDEXES FROM ??`, [tableName]);
    return indexes;
  } catch (error) {
    logger.error("Failed to get table indexes", {
      tableName,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Analyze table to update index statistics
 *
 * PURPOSE: Updates MySQL's internal statistics about table data distribution.
 * This helps the query optimizer choose the best indexes for queries.
 *
 * WHEN TO USE:
 * - After bulk data inserts/updates (statistics become stale)
 * - After creating new indexes (update statistics for optimizer)
 * - Periodically to maintain optimal query performance
 *
 * @param {string} tableName - Name of the table to analyze
 * @returns {Promise<Object>} Result object with success status
 *
 * @example
 * await analyzeTable('Users'); // Updates statistics for query optimizer
 */
const analyzeTable = async (tableName) => {
  try {
    await pool.query(`ANALYZE TABLE ??`, [tableName]);
    logger.info("Table analyzed successfully", { tableName });
    return { success: true, message: "Table analyzed successfully" };
  } catch (error) {
    logger.error("Failed to analyze table", {
      tableName,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Create common indexes for frequently queried columns
 *
 * PURPOSE: Creates a comprehensive set of indexes for the most frequently queried columns
 * across the entire application. This is a one-stop function for initial database optimization.
 *
 * PROBLEM SOLVED: Manually creating indexes for each table is time-consuming and error-prone.
 * This function creates all essential indexes in one call, ensuring consistent optimization.
 *
 * WHEN TO USE:
 * - Initial database setup (run once after creating tables)
 * - After database migration that creates new tables
 * - Performance optimization (ensure all common queries are indexed)
 *
 * Creates indexes on:
 * - Users: userUniqueId, phoneNumber, email
 * - UserRole: userUniqueId+roleId composite, userRoleUniqueId
 * - AttachedDocuments: userUniqueId+documentTypeId composite
 * - VehicleDriver: driverUserUniqueId+assignmentStatus composite
 * - PassengerRequest: userUniqueId+journeyStatusId composite
 * - And more...
 *
 * @returns {Promise<Object>} Result object with:
 *   - success: boolean (true if all indexes created successfully)
 *   - created: number of indexes created
 *   - errors: number of errors encountered
 *   - results: array of creation results
 *   - errors: array of error details (if any)
 *
 * @example
 * const result = await createCommonIndexes();
 * console.log(`Created ${result.created} indexes`);
 * if (result.errors.length > 0) {
 *   console.error('Errors:', result.errors);
 * }
 */
const createCommonIndexes = async () => {
  const commonIndexes = [
    // Users table
    { table: "Users", columns: "userUniqueId", unique: true },
    { table: "Users", columns: "phoneNumber", unique: false },
    { table: "Users", columns: "email", unique: false },

    // UserRole table
    { table: "UserRole", columns: ["userUniqueId", "roleId"], unique: false },
    { table: "UserRole", columns: "userRoleUniqueId", unique: true },

    // UserRoleStatusCurrent table
    {
      table: "UserRoleStatusCurrent",
      columns: ["userRoleId", "statusId"],
      unique: false,
    },
    {
      table: "UserRoleStatusCurrent",
      columns: "userRoleStatusUniqueId",
      unique: true,
    },

    // AttachedDocuments table
    {
      table: "AttachedDocuments",
      columns: ["userUniqueId", "documentTypeId"],
      unique: false,
    },
    {
      table: "AttachedDocuments",
      columns: "attachedDocumentUniqueId",
      unique: true,
    },

    // VehicleDriver table
    {
      table: "VehicleDriver",
      columns: ["driverUserUniqueId", "assignmentStatus"],
      unique: false,
    },
    { table: "VehicleDriver", columns: "vehicleDriverUniqueId", unique: true },

    // VehicleOwnership table
    {
      table: "VehicleOwnership",
      columns: ["vehicleUniqueId", "userUniqueId"],
      unique: false,
    },
    { table: "VehicleOwnership", columns: "ownershipUniqueId", unique: true },

    // PassengerRequest table
    {
      table: "PassengerRequest",
      columns: "shipperRequestUniqueId",
      unique: true,
    },
    {
      table: "PassengerRequest",
      columns: ["userUniqueId", "journeyStatusId"],
      unique: false,
    },

    // DriverRequest table
    { table: "DriverRequest", columns: "driverRequestUniqueId", unique: true },
    {
      table: "DriverRequest",
      columns: ["userUniqueId", "journeyStatusId"],
      unique: false,
    },

    // JourneyDecisions table
    {
      table: "JourneyDecisions",
      columns: "journeyDecisionUniqueId",
      unique: true,
    },
    {
      table: "JourneyDecisions",
      columns: ["shipperRequestId", "driverRequestId"],
      unique: false,
    },

    // Journey table
    { table: "Journey", columns: "journeyUniqueId", unique: true },
    {
      table: "Journey",
      columns: ["journeyDecisionUniqueId", "journeyStatusId"],
      unique: false,
    },
  ];

  const results = [];
  const errors = [];

  for (const indexConfig of commonIndexes) {
    try {
      const result = await createIndex(indexConfig.table, indexConfig.columns, {
        unique: indexConfig.unique || false,
        ifNotExists: true,
      });
      results.push(result);
    } catch (error) {
      errors.push({
        table: indexConfig.table,
        columns: indexConfig.columns,
        error: error.message,
      });
    }
  }

  logger.info("Common indexes creation completed", {
    created: results.length,
    errors: errors.length,
  });

  return {
    success: errors.length === 0,
    created: results.length,
    errors: errors.length,
    results,
    errors,
  };
};

module.exports = {
  createIndex,
  dropIndex,
  getTableIndexes,
  analyzeTable,
  createCommonIndexes,
};
