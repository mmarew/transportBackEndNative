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
   * 7) If deliveryConfirmationUniqueId is provided:
   *    - If DC exists and is PENDING → dispute it (status → DISPUTED).
   *    - If DC exists and is CONFIRMED → dispute it (status → DISPUTED).
   *    - If DC exists and is already DISPUTED → idempotent, no change.
   *    - If DC does NOT exist (driver never submitted POD) → create a new DISPUTED
   *      DC with source 'DELINQUENCY_DISPUTE'. Requires journeyDecisionUniqueId
   *      to resolve the journey. The shipper is set as receiver.
   * 8) Return success with record id, any automatic action, whether a DC was
   *    disputed, and whether a new DC was created.
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
   * @param {string} [data.deliveryConfirmationUniqueId] - When provided, the linked delivery confirmation is auto-disputed (status → DISPUTED). If the DC does not exist, a new DISPUTED DC is created (requires journeyDecisionUniqueId).
   * @returns {Promise<{message: string, data: null, userDelinquencyUniqueId: string, automaticAction: Object, deliveryConfirmationDisputed: boolean, deliveryConfirmationCreated: boolean}>}
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

    // Auto-dispute linked delivery confirmation (if provided).
    // If the DC exists, dispute it. If it doesn't exist (driver never submitted
    // POD), create a DISPUTED DC so the shipper's complaint is on record.
    let deliveryConfirmationDisputed = false;
    let deliveryConfirmationCreated = false;
    if (deliveryConfirmationUniqueId) {
      const executor = transactionStorage.getStore() || pool;
      const [dcRows] = await executor.query(
        `SELECT deliveryConfirmationUniqueId, deliveryConfirmationStatus
         FROM DeliveryConfirmations
         WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
        [deliveryConfirmationUniqueId],
      );

      if (dcRows.length === 0) {
        // DC doesn't exist — driver never submitted POD. Create DISPUTED DC.
        if (!journeyDecisionUniqueId) {
          throw new AppError(
            "journeyDecisionUniqueId is required when creating a delivery confirmation via delinquency",
            AppError.BAD_REQUEST,
          );
        }

        // Resolve journeyUniqueId from JourneyDecisions
        const [jdRows] = await executor.query(
          `SELECT j.journeyUniqueId
           FROM JourneyDecisions jd
           JOIN Journey j ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
           WHERE jd.journeyDecisionUniqueId = ? AND j.journeyDeletedAt IS NULL`,
          [journeyDecisionUniqueId],
        );
        if (jdRows.length === 0) {
          throw new AppError(
            "No journey found for the provided journeyDecisionUniqueId",
            AppError.NOT_FOUND,
          );
        }
        const journeyUniqueId = jdRows[0].journeyUniqueId;

        // Idempotent: check if a DISPUTED DC already exists for this journey
        const [existingDc] = await executor.query(
          `SELECT deliveryConfirmationUniqueId FROM DeliveryConfirmations
           WHERE journeyUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
          [journeyUniqueId],
        );
        if (existingDc.length > 0) {
          // DC already exists for this journey — dispute it if not already
          const existing = existingDc[0];
          const [statusCheck] = await executor.query(
            `SELECT deliveryConfirmationStatus FROM DeliveryConfirmations
             WHERE deliveryConfirmationUniqueId = ?`,
            [existing.deliveryConfirmationUniqueId],
          );
          if (statusCheck[0]?.deliveryConfirmationStatus !== "DISPUTED") {
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
                existing.deliveryConfirmationUniqueId,
              ],
            );
          }
          deliveryConfirmationDisputed = true;
        } else {
          // No DC at all — create one as DISPUTED
          const now = currentDate();
          // Resolve the shipper as receiver (the aggrieved party)
          const [srRows] = await executor.query(
            `SELECT sr.userUniqueId AS shipperUserUniqueId
             FROM ShipperRequest sr
             JOIN JourneyDecisions jd ON jd.shipperRequestId = sr.shipperRequestId
             WHERE jd.journeyDecisionUniqueId = ?`,
            [journeyDecisionUniqueId],
          );
          const receiverUserUniqueId =
            srRows[0]?.shipperUserUniqueId || delinquencyCreatedBy;

          await executor.query(
            `INSERT INTO DeliveryConfirmations (
              deliveryConfirmationUniqueId,
              journeyUniqueId,
              receiverUserUniqueId,
              confirmedByUserUniqueId,
              deliveryConfirmationStatus,
              deliveryConfirmationSource,
              deliveryConfirmationCondition,
              deliveryConfirmationNotes,
              deliveryConfirmationSubmittedAt,
              deliveryConfirmationConfirmedAt,
              deliveryConfirmationCreatedBy,
              deliveryConfirmationCreatedAt
            ) VALUES (?, ?, ?, ?, 'DISPUTED', 'DELINQUENCY_DISPUTE', 'GOOD', ?, ?, ?, ?, ?)`,
            [
              deliveryConfirmationUniqueId,
              journeyUniqueId,
              receiverUserUniqueId,
              delinquencyCreatedBy,
              delinquencyDescription || "Disputed via delinquency — no POD submitted by driver",
              now,
              now,
              delinquencyCreatedBy,
              now,
            ],
          );
          deliveryConfirmationCreated = true;
          deliveryConfirmationDisputed = true;
        }
      } else {
        // DC exists — dispute it if not already DISPUTED
        const dc = dcRows[0];
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
    }

    return {
      message: "User delinquency created",
      data: null,
      userDelinquencyUniqueId,
      automaticAction: banResult,
      deliveryConfirmationDisputed,
      deliveryConfirmationCreated,
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