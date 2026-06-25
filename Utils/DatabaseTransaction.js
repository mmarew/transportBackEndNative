const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("./CurrentDate");
const logger = require("./logger");
const { transactionStorage } = require("./TransactionContext");

/**
 * Execute a callback within a database transaction
 *
 * PURPOSE: Ensures atomic database operations - either all operations succeed or all are rolled back.
 * This prevents data inconsistency issues where partial updates could leave the database in an invalid state.
 *
 * PROBLEM SOLVED: Previously, multi-step operations (e.g., creating a user and their credentials)
 * were not atomic. If one step failed, partial data could be left in the database, causing:
 * - Orphaned records (user created but credential missing)
 * - Data inconsistency (user updated but role not updated)
 * - Integrity violations (foreign key constraints)
 *
 * WHEN TO USE:
 * - Multi-step operations that must be atomic (user creation, vehicle registration, payment processing)
 * - Operations where partial updates would cause data integrity issues
 * - Complex business logic involving multiple related database operations
 *
 * Automatically handles commit/rollback and connection management. If any operation fails,
 * all changes are automatically rolled back and the connection is released.
 *
 * @param {Function} callback - Async function that receives a connection and returns a result.
 *                              Use this connection for all database operations within the transaction.
 * @param {Object} [options] - Transaction options
 * @param {number} [options.timeout=30000] - Transaction timeout in milliseconds (default: 30 seconds)
 * @param {boolean} [options.logging=true] - Whether to log transaction operations (start, commit, rollback)
 * @returns {Promise<*>} The result of the callback function
 * @throws {Error} If transaction fails, the error is thrown after rollback
 *
 * @example
 * // Create user and credential atomically
 * const result = await executeInTransaction(async (connection) => {
 *   // Insert user
 *   const [userResult] = await connection.query(
 *     'INSERT INTO Users (userUniqueId, fullName, phoneNumber) VALUES (?, ?, ?)',
 *     [userUniqueId, fullName, phoneNumber]
 *   );
 *
 *   // Insert credential (only if user insert succeeds)
 *   await connection.query(
 *     'INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP) VALUES (?, ?, ?)',
 *     [credentialUniqueId, userUniqueId, hashedOTP]
 *   );
 *
 *   return userResult;
 * });
 * // If either operation fails, both are rolled back automatically
 */
const executeInTransaction = async (callback, options = {}) => {
  const { timeout = 30000, logging = true } = options;

  // Check if we are already in an active transaction context
  const existingConnection = transactionStorage.getStore();
  if (existingConnection) {
    if (logging) {
      logger.debug("Using existing transaction connection");
    }
    return await callback(existingConnection);
  }

  const connection = await pool.getConnection();
  const startTime = currentDate();
  let transactionId = null;
  let timer;

  try {
    // Generate transaction ID for logging
    transactionId = `txn_${currentDate()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    if (logging) {
      logger.debug("Transaction started", { transactionId });
    }

    // Align session lock wait timeout (seconds) with JS timeout
    if (timeout) {
      const lockWait = Math.max(1, Math.floor(timeout / 1000));
      await connection.query(`SET SESSION innodb_lock_wait_timeout = ?`, [
        lockWait,
      ]);
    }

    // Begin transaction
    await connection.beginTransaction();

    // JS-level timeout: reject if callback takes too long to avoid held locks
    const timeoutPromise = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Transaction timed out (JS-level)"));
      }, timeout);
    });

    // Run the callback inside the AsyncLocalStorage context
    const result = await transactionStorage.run(connection, async () => {
      // Execute the callback and enforce timeout
      return await Promise.race([callback(connection), timeoutPromise]);
    });

    // Commit transaction
    await connection.commit();

    clearTimeout(timer);
    const duration = currentDate() - startTime;
    if (logging) {
      logger.info("Transaction committed", {
        transactionId,
        duration: `${duration}ms`,
      });
    }

    return result;
  } catch (error) {
    // Rollback on any error
    try {
      await connection.rollback();
      const duration = currentDate() - startTime;
      if (logging) {
        logger.error("Transaction rolled back", {
          transactionId,
          duration: `${duration}ms`,
          error: error.message,
          stack: error.stack,
        });
      }
    } catch (rollbackError) {
      logger.error("Failed to rollback transaction", {
        transactionId,
        rollbackError: rollbackError.message,
        originalError: error.message,
      });
    }

    // Re-throw the original error
    throw error;
  } finally {
    clearTimeout(timer);
    // Always release the connection back to the pool
    try {
      connection.release();
    } catch (e) {
      logger.warn("Failed to release connection", {
        transactionId,
        error: e.message,
      });
    }
  }
};

/**
 * Execute multiple operations in a single transaction
 *
 * PURPOSE: Execute a batch of operations atomically. All operations succeed or all fail together.
 *
 * PROBLEM SOLVED: When processing multiple items (e.g., bulk user creation, batch updates),
 * you need all items to be processed successfully or none at all. This prevents partial batch processing.
 *
 * WHEN TO USE:
 * - Batch operations that must be atomic (bulk imports, batch updates)
 * - Processing multiple related records that must all succeed together
 * - Operations where partial success would cause data inconsistency
 *
 * @param {Array<Function>} operations - Array of async functions that receive a connection.
 *                                       Each function should perform one operation using the connection.
 * @param {Object} [options] - Transaction options (same as executeInTransaction)
 * @returns {Promise<Array>} Array of results from each operation, in the same order as input
 *
 * @example
 * // Process multiple payments atomically
 * const results = await executeBatchInTransaction([
 *   async (connection) => await connection.query('INSERT INTO Payment1 ...'),
 *   async (connection) => await connection.query('INSERT INTO Payment2 ...'),
 *   async (connection) => await connection.query('INSERT INTO Payment3 ...'),
 * ]);
 * // All payments are created or none are created
 */
const executeBatchInTransaction = async (operations, options = {}) => {
  return executeInTransaction(async (connection) => {
    const results = [];
    for (const operation of operations) {
      const result = await operation(connection);
      results.push(result);
    }
    return results;
  }, options);
};

module.exports = {
  executeInTransaction,
  executeBatchInTransaction,
};
