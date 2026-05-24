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
   * 6) Execute insert; then call checkAndApplyAutomaticBan to enforce point-based bans. Return success with record id and any automatic action.
   * 7) On errors: log; if MySQL duplicate key, fetch the existing record for context; otherwise return generic failure with details.
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
    skipDuplicateCheck = false
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
    throw new AppError(`Invalid userUniqueId: ${userUniqueId} does not exist in Users table`, 400);
  }

  // Get default values from delinquency type if not provided
  const typeQuery = `
    SELECT * 
    FROM DelinquencyTypes 
    WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE
  `;
  const [typeResult] = await (transactionStorage.getStore() || pool).query(typeQuery, [delinquencyTypeUniqueId]);
  if (typeResult.length === 0) {
    throw new AppError("Invalid delinquency type", 404);
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
    const duplicateWindowHours = defaultType?.duplicateCheckWindowHours || 24;
    // Use standard date helper, but convert to Date for arithmetic
    const nowStr = currentDate();
    const now = new Date(nowStr);
    const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
    const startDate = new Date(safeNow.getTime() - duplicateWindowHours * 60 * 60 * 1000);
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
      const timeAgo = Math.round((now - new Date(duplicate.delinquencyCreatedAt)) / (1000 * 60 * 60));
      const error = new AppError(`Duplicate delinquency detected. A similar delinquency was registered ${timeAgo} hours ago.`, 400);
      error.duplicateId = duplicate.userDelinquencyUniqueId;
      error.timeSinceDuplicate = `${timeAgo} hours`;
      error.duplicateDetails = {
        description: duplicate.delinquencyDescription,
        createdAt: duplicate.delinquencyCreatedAt,
        createdBy: duplicate.createdByName
      };
      throw error;
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
      throw new AppError(`Invalid journeyDecisionUniqueId: ${journeyDecisionUniqueId} does not exist in JourneyDecisions table`, 400);
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
    await query(sql, values);

    // Check for automatic ban
    const banResult = await checkAndApplyAutomaticBan(userUniqueId, roleId);
    return {
      message: "success",
      data: "User delinquency record created successfully",
      userDelinquencyUniqueId,
      automaticAction: banResult
    };
  } catch (error) {
    // Check for MySQL duplicate entry error
    if (error.code === "ER_DUP_ENTRY") {
      // Use existing method to find the duplicate
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
      const appError = new AppError("Duplicate entry detected. A similar delinquency already exists.", 400);
      appError.duplicateId = duplicateCheckResult.data?.[0]?.userDelinquencyUniqueId;
      appError.details = error.message;
      throw appError;
    }
    throw new AppError(error.message || "Failed to create user delinquency record", error.statusCode || 500);
  }
};

module.exports = {
  createUserDelinquency
};


const { getUserDelinquencies } = require("./read.service");
const { checkAndApplyAutomaticBan } = require("./ban.service");