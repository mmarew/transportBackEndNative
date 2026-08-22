"use strict";

const {
  pool
} = require("../../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");
const logger = require("../../Utils/logger");
const {
  currentDate
} = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const createUserDelinquency = async data => {
  /**
   * createUserDelinquency
   * 1) Destructure request payload (user IDs, type IDs, description, severity/points overrides, creator, journey link, role, duplicate-skip flag).
   * 2) Generate userDelinquencyUniqueId for this record.
   * 3) Load delinquency type (must be active) to fetch defaults (severity/points, duplicate window, etc.). Return error if invalid.
   * 4) Unless skipDuplicateCheck=true, build duplicateFilters with ids/role and a 24h (or type-configured) window using currentDate() for time-zone consistency. Optionally scope by journeyDecisionUniqueId. Query existing delinquencies; if found, return a duplicate error with time-ago info.
   * 5) Build INSERT columns/placeholders/values, applying defaults when overrides are absent, and include journeyDecisionUniqueId if provided.
   * 6) Execute insert; then call checkAndApplyAutomaticBan to enforce point-based bans.
   * 7) If deliveryConfirmationUniqueId is provided, auto-dispute the linked delivery confirmation (status → DISPUTED). Cannot dispute a CONFIRMED delivery.
   * 8) Return success with record id, any automatic action, and whether a delivery confirmation was disputed.
   * 9) On errors: log; if MySQL duplicate key, fetch the existing record for context; otherwise return generic failure with details.
   *
   * @param {Object} data
   * @param {string} data.userUniqueId - UUID of the user receiving the delinquency.
   * @param {string} data.delinquencyTypeUniqueId - UUID of the delinquency type.
   * @param {number} data.roleId - Role ID of the user.
   * @param {string} [data.delinquencyDescription] - Free-text description of the violation.
   * @param {string} [data.delinquencySeverity] - Override severity (LOW/MEDIUM/HIGH/CRITICAL).
   * @param {number} [data.delinquencyPoints] - Override point value.
   * @param {string} data.delinquencyCreatedBy - UUID of the admin creating the delinquency.
   * @param {string} [data.journeyDecisionUniqueId] - Link to the journey decision.
   * @param {boolean} [data.skipDuplicateCheck=false] - Skip duplicate detection.
   * @param {string} [data.deliveryConfirmationUniqueId] - When provided, the linked delivery confirmation is auto-disputed (status → DISPUTED).
   * @returns {Promise<{message: string, data: null, userDelinquencyUniqueId: string, automaticAction: Object, deliveryConfirmationDisputed: boolean}>}
   */
  const {
    userUniqueId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencySeverity,
    delinquencyPoints,
    delinquencyCreatedBy,
    journeyDecisionUniqueId,
    roleId,
    skipDuplicateCheck = false,
    deliveryConfirmationUniqueId,
  } = data;
  const userDelinquencyUniqueId = uuidv4();

  // Validate that userUniqueId exists in Users table
  const userCheckQuery = `
    SELECT userUniqueId, fullName 
    FROM Users 
    WHERE userUniqueId = ?
  `;
  const [userResult] = await (transactionStorage.getStore() || pool).query(userCheckQuery, [userUniqueId]);
  if (userResult.length === 0) {
    throw new AppError(`Invalid userUniqueId: ${userUniqueId} does not exist in Users table`, AppError.BAD_REQUEST);
  }

  // Get default values from delinquency type if not provided
  const typeQuery = `
    SELECT * 
    FROM DelinquencyTypes 
    WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE
  `;
  const [typeResult] = await (transactionStorage.getStore() || pool).query(typeQuery, [delinquencyTypeUniqueId]);
  if (typeResult.length === 0) {
    throw new AppError("Invalid delinquency type", AppError.NOT_FOUND);
  }
  const defaultType = typeResult[0];

  // Only perform duplicate check if not explicitly skipped
  if (!skipDuplicateCheck) {
    // Check for duplicates using existing getUserDelinquencies method
    const duplicateFilters = {
      userUniqueId,
      delinquencyTypeUniqueId,
      roleId,
      limit: 1,
      // We only need to check if any exist
      summary: false,
      stat: false
    };

    // Calculate time window for duplicate check
    const duplicateWindowHours = defaultType?.duplicateCheckWindowHours || 24; // eslint-disable-line no-magic-numbers -- default 24h window
    // Use standard date helper, but convert to Date for arithmetic
    const nowStr = currentDate();
    const now = new Date(nowStr);
    const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
    const startDate = new Date(safeNow.getTime() - duplicateWindowHours * TIME.HOUR_MS);
    duplicateFilters.startDate = startDate.toISOString().split("T")[0] + " 00:00:00";
    duplicateFilters.endDate = safeNow.toISOString().split("T")[0] + " 23:59:59";

    // If journey decision is provided, add it to filters
    if (journeyDecisionUniqueId) {
      duplicateFilters.journeyDecisionUniqueId = journeyDecisionUniqueId;
    }
    logger.debug("@duplicateFilters", duplicateFilters);

    // Use Promise.all to check for duplicates and get delinquency type
    const [duplicateCheckResult] = await Promise.all([getUserDelinquencies(duplicateFilters), (transactionStorage.getStore() || pool).query(typeQuery, [delinquencyTypeUniqueId])]);
    if (duplicateCheckResult.message === "success" && duplicateCheckResult.data && duplicateCheckResult.data.length > 0) {
      const duplicate = duplicateCheckResult.data[0];
      return {
        message: "User delinquency created",
        data: null,
        userDelinquencyUniqueId: duplicate.userDelinquencyUniqueId,
      };
    }
  }

  // Start building SQL and values
  let columns = `userDelinquencyUniqueId, userUniqueId, roleId, delinquencyTypeUniqueId, 
    delinquencyDescription, delinquencySeverity, delinquencyPoints, delinquencyCreatedBy`;
  let values = [userDelinquencyUniqueId, userUniqueId, roleId, delinquencyTypeUniqueId, delinquencyDescription, delinquencySeverity || defaultType.defaultSeverity, delinquencyPoints || defaultType.defaultPoints, delinquencyCreatedBy];
  let placeholders = `?, ?, ?, ?, ?, ?, ?, ?`;

  // Add journeyDecisionUniqueId if provided
  if (journeyDecisionUniqueId) {
    // Validate that journeyDecisionUniqueId exists in JourneyDecisions table
    const journeyCheckQuery = `
      SELECT journeyDecisionUniqueId 
      FROM JourneyDecisions 
      WHERE journeyDecisionUniqueId = ?
    `;
    const [journeyResult] = await (transactionStorage.getStore() || pool).query(journeyCheckQuery, [journeyDecisionUniqueId]);
    if (journeyResult.length === 0) {
      throw new AppError(`Invalid journeyDecisionUniqueId: ${journeyDecisionUniqueId} does not exist in JourneyDecisions table`, AppError.BAD_REQUEST);
    }
    columns += `, journeyDecisionUniqueId`;
    placeholders += `, ?`;
    values.push(journeyDecisionUniqueId);
  }
  const sql = `
    INSERT INTO UserDelinquency (${columns}) 
    VALUES (${placeholders})
  `;
  try {
    await (transactionStorage.getStore() || pool).query(sql, values);

    // Check for automatic ban
    const banResult = await checkAndApplyAutomaticBan(userUniqueId, roleId);

    // Auto-dispute linked delivery confirmation (if provided)
    let deliveryConfirmationDisputed = false;
    if (deliveryConfirmationUniqueId) {
      const executor = transactionStorage.getStore() || pool;
      const [dcRows] = await executor.query(
        `SELECT deliveryConfirmationUniqueId, deliveryConfirmationStatus
         FROM DeliveryConfirmations
         WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
        [deliveryConfirmationUniqueId],
      );
      if (dcRows.length === 0) {
        throw new AppError(
          `Delivery confirmation ${deliveryConfirmationUniqueId} not found`,
          AppError.NOT_FOUND,
        );
      }
      const dc = dcRows[0];
      if (dc.deliveryConfirmationStatus === "CONFIRMED") {
        throw new AppError(
          "Cannot dispute a confirmed delivery confirmation",
          AppError.FORBIDDEN,
        );
      }
      if (dc.deliveryConfirmationStatus !== "DISPUTED") {
        const now = currentDate();
        await executor.query(
          `UPDATE DeliveryConfirmations
           SET deliveryConfirmationStatus = 'DISPUTED',
               confirmedByUserUniqueId = ?,
               deliveryConfirmationConfirmedAt = ?,
               deliveryConfirmationNotes = CONCAT(
                 COALESCE(deliveryConfirmationNotes, ''),
                 CHAR(10), '[Dispute] ', ?
               )
           WHERE deliveryConfirmationUniqueId = ?`,
          [
            delinquencyCreatedBy,
            now,
            delinquencyDescription || "Disputed via delinquency",
            deliveryConfirmationUniqueId,
          ],
        );
        deliveryConfirmationDisputed = true;
      }
    }

    return {
      message: "User delinquency created",
      data: null,
      userDelinquencyUniqueId,
      automaticAction: banResult,
      deliveryConfirmationDisputed,
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const duplicateFilters = {
        userUniqueId,
        delinquencyTypeUniqueId,
        roleId,
        limit: 1
      };
      if (journeyDecisionUniqueId) {
        duplicateFilters.journeyDecisionUniqueId = journeyDecisionUniqueId;
      }
      const duplicateCheckResult = await getUserDelinquencies(duplicateFilters);
      return {
        message: "User delinquency created",
        data: null,
        userDelinquencyUniqueId: duplicateCheckResult.data?.[0]?.userDelinquencyUniqueId,
      };
    }
    throw new AppError(error.message || "Failed to create user delinquency record", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  createUserDelinquency
};


const { getUserDelinquencies } = require("./read.service");
const { checkAndApplyAutomaticBan } = require("./ban.service");
const { TIME } = require("../../Utils/Constants");