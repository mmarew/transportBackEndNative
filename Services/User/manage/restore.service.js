"use strict";

/**
 * Restore a SOFT-DELETED account, found by phone number.
 *
 * `deleteUser` (./delete.service.js) blocks an account in three places:
 *   1. Users.isDeleted / userDeletedAt / userDeletedBy   → every request 403s
 *      (Middleware/VerifyToken.js) and login refuses (auth/login.service.js)
 *   2. UserRoleStatusCurrent.statusId = 8 (ACCOUNT_DELETED) → the app shows
 *      the account as deleted/blocked
 *   3. nothing else — role links, credentials, documents, vehicles, journeys
 *      and balances are all untouched
 *
 * Restoring therefore has to undo (1) and (2), and this service does exactly
 * that — nothing more. It deliberately does NOT guess a single status for all
 * roles:
 *   - the last real status the role had before deletion (UserRoleStatusHistory)
 *     is the best source of truth and is used first;
 *   - only when no history exists does it derive one: an active ban wins (6),
 *     the driver role is recomputed from its vehicle/documents/subscription,
 *     and every other role is restored to ACTIVE (1), which is what those roles
 *     look like when nothing is wrong with them.
 *
 * Two safety rules:
 *   - a live ban is never cleared by a restore (`BannedUsers` is a separate
 *     decision made by the delinquency flow);
 *   - the sessions that survived the deletion are revoked after commit, so a
 *     token minted before the deletion cannot be used against the restored
 *     account.
 */

const { v4: uuidv4 } = require("uuid");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const { currentDate } = require("../../../Utils/CurrentDate");
const { phoneNumberVariants } = require("../../../Utils/PhoneNumber");
const {
  revokeAllSessions,
  SESSION_REVOKE_REASONS,
} = require("../../../Utils/SessionRegistry");
const { recordUserEvent } = require("../../../Utils/UserProfileHistory");
const {
  findStatusByVehicleAndDocuments,
} = require("../../../Utils/StatusOfUsersByVehiclesAndDocs");
const {
  USER_STATUS,
  usersRoles,
} = require("../../../Utils/ListOfSeedData");
const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");

const DELETED_STATUS_ID = USER_STATUS.ACCOUNT_DELETED;
const RESTORE_DESCRIPTION = "Restored: account deleted by mistake";

// ── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Resolve the target by phone number, format-tolerantly: +251…, 251… and 0…
 * all point at the single canonical identity stored in Users.
 */
const findTargetUser = async (executor, phoneNumber) => {
  const variants = phoneNumberVariants(phoneNumber);
  const candidates = variants.length > 0 ? variants : [phoneNumber];
  const [rows] = await executor.query(
    `SELECT userUniqueId, fullName, phoneNumber, email,
            isDeleted, userDeletedAt, userDeletedBy
       FROM Users
      WHERE phoneNumber IN (${candidates.map(() => "?").join(", ")})
      LIMIT 1`,
    candidates,
  );
  return rows?.[0] || null;
};

const listUserRoles = async (executor, userUniqueId) => {
  const [rows] = await executor.query(
    `SELECT ur.userRoleId, ur.roleId, cur.*
       FROM UserRole ur
       LEFT JOIN UserRoleStatusCurrent cur ON cur.userRoleId = ur.userRoleId
      WHERE ur.userUniqueId = ?
        AND ur.userRoleDeletedAt IS NULL
      ORDER BY ur.userRoleId`,
    [userUniqueId],
  );
  return rows || [];
};

const listActiveBanRoleIds = async (executor, userUniqueId) => {
  const [rows] = await executor.query(
    `SELECT DISTINCT roleId FROM BannedUsers
      WHERE userUniqueId = ?
        AND isActive = 1
        AND banExpiresAt > ?`,
    [userUniqueId, currentDate()],
  );
  return new Set((rows || []).map(row => row.roleId));
};

/** The last status this role held BEFORE it was set to account-deleted. */
const lastKnownStatusFromHistory = async (executor, userRoleId) => {
  const [rows] = await executor.query(
    `SELECT statusId FROM UserRoleStatusHistory
      WHERE userRoleId = ?
        AND statusId <> ?
        AND userRoleStatusDeletedAt IS NULL
      ORDER BY userRoleStatusHistoryId DESC
      LIMIT 1`,
    [userRoleId, DELETED_STATUS_ID],
  );
  return rows?.[0]?.statusId ?? null;
};

// ── Status derivation (only used when the role has no history) ───────────────

/**
 * Recompute a driver's real status from what actually exists today (vehicle,
 * documents, subscription) — the same precedence the document-review flow uses
 * via findStatusByVehicleAndDocuments. Never assume ACTIVE: status 1 claims a
 * registered vehicle and accepted documents.
 */
const computeLiveDriverStatus = async (executor, userUniqueId) => {
  const [vehicleRows] = await executor.query(
    `SELECT vehicleUniqueId FROM VehicleDriver
      WHERE driverUserUniqueId = ?
        AND assignmentStatus = 'active'
        AND vehicleDriverDeletedAt IS NULL
      LIMIT 1`,
    [userUniqueId],
  );
  const vehicleUniqueId = vehicleRows?.[0]?.vehicleUniqueId || null;

  const [driverDocuments] = await executor.query(
    `SELECT ad.documentTypeId, ad.attachedDocumentAcceptance
       FROM AttachedDocuments ad
       JOIN RoleDocumentRequirements rdr ON rdr.documentTypeId = ad.documentTypeId
      WHERE ad.ownerType = 'user'
        AND ad.ownerUniqueId = ?
        AND rdr.roleId = ?`,
    [userUniqueId, usersRoles.driverRoleId],
  );

  let vehicleDocuments = [];
  if (vehicleUniqueId) {
    [vehicleDocuments] = await executor.query(
      `SELECT ad.documentTypeId, ad.attachedDocumentAcceptance
         FROM AttachedDocuments ad
         JOIN RoleDocumentRequirements rdr ON rdr.documentTypeId = ad.documentTypeId
        WHERE ad.ownerType = 'vehicle'
          AND ad.ownerUniqueId = ?
          AND rdr.roleId = ?`,
      [vehicleUniqueId, usersRoles.vehicleRoleId],
    );
  }

  const [requiredRows] = await executor.query(
    `SELECT DISTINCT documentTypeId FROM RoleDocumentRequirements
      WHERE roleId IN (?, ?)`,
    [usersRoles.driverRoleId, usersRoles.vehicleRoleId],
  );

  const attachedDocuments = [...(driverDocuments || []), ...(vehicleDocuments || [])];
  const attachedDocumentsByStatus = { PENDING: [], ACCEPTED: [], REJECTED: [] };
  attachedDocuments.forEach(document => {
    const bucket = attachedDocumentsByStatus[document.attachedDocumentAcceptance];
    if (bucket) {
      bucket.push(document);
    }
  });

  const requiredDocuments = requiredRows || [];
  const unAttachedDocumentTypes = requiredDocuments.filter(
    required =>
      !attachedDocuments.some(
        attached => attached.documentTypeId === required.documentTypeId,
      ),
  );

  let hasActiveSubscription = false;
  try {
    const { getUserSubscriptionsWithFilters } = require("../../UserSubscription");
    const subscriptions = await getUserSubscriptionsWithFilters({
      driverUniqueId: userUniqueId,
      page: 1,
      limit: 1,
      isActive: true,
    });
    hasActiveSubscription = (subscriptions?.data || []).length > 0;
  } catch (error) {
    // A failed subscription lookup must not block the restore — treat it as
    // "no active subscription", the conservative answer.
    logger.error("restoreUser: subscription lookup failed", {
      userUniqueId,
      error: error.message,
    });
    hasActiveSubscription = false;
  }

  const result = findStatusByVehicleAndDocuments({
    vehicleRegistered: Boolean(vehicleUniqueId),
    attachedDocumentsByStatus,
    requiredDocuments,
    unAttachedDocumentTypes,
    hasActiveSubscription,
  });

  return result?.finalStatusId ?? USER_STATUS.INACTIVE_VEHICLE_NOT_REGISTERED;
};

const resolveRestoreStatus = async (executor, role, { userUniqueId, bannedRoleIds }) => {
  // A ban is an admin/delinquency decision — restoring an account must never
  // lift it.
  if (bannedRoleIds.has(role.roleId)) {
    return USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN;
  }
  const historicalStatusId = await lastKnownStatusFromHistory(executor, role.userRoleId);
  if (historicalStatusId) {
    return historicalStatusId;
  }
  if (role.roleId === usersRoles.driverRoleId) {
    return await computeLiveDriverStatus(executor, userUniqueId);
  }
  return USER_STATUS.ACTIVE;
};

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Put one role back on `statusId`, keeping the audit trail complete: the
 * account-deleted row is copied to UserRoleStatusHistory before the current
 * row changes (same shape as Services/UserRoleStatus.service.js).
 */
const applyStatus = async (executor, { role, statusId, restoredBy }) => {
  const now = currentDate();

  if (!role.userRoleStatusId) {
    await executor.query(
      `INSERT INTO UserRoleStatusCurrent
         (userRoleStatusUniqueId, userRoleId, statusId, userRoleStatusDescription,
          userRoleStatusCreatedBy, userRoleStatusCreatedAt, userRoleStatusCurrentVersion)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [uuidv4(), role.userRoleId, statusId, RESTORE_DESCRIPTION, restoredBy, now],
    );
    return;
  }

  await executor.query(
    `INSERT INTO UserRoleStatusHistory
       (userRoleStatusId, userRoleStatusUniqueId, statusId, userRoleId,
        userRoleStatusDescription, userRoleStatusCreatedBy, userRoleStatusCreatedAt,
        userRoleStatusUpdatedBy, userRoleStatusUpdatedAt, userRoleStatusCurrentVersion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      role.userRoleStatusId,
      role.userRoleStatusUniqueId,
      role.statusId,
      role.userRoleId,
      role.userRoleStatusDescription,
      role.userRoleStatusCreatedBy,
      role.userRoleStatusCreatedAt,
      restoredBy,
      now,
      role.userRoleStatusCurrentVersion,
    ],
  );

  await executor.query(
    `UPDATE UserRoleStatusCurrent
        SET statusId = ?,
            userRoleStatusDescription = ?,
            userRoleStatusCurrentVersion = userRoleStatusCurrentVersion + 1
      WHERE userRoleStatusId = ?`,
    [statusId, RESTORE_DESCRIPTION, role.userRoleStatusId],
  );
};

const describeStatus = async (executor, statusId) => {
  const [rows] = await executor.query(
    "SELECT statusName FROM Statuses WHERE statusId = ? LIMIT 1",
    [statusId],
  );
  return rows?.[0]?.statusName || null;
};

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Restore a deleted account by phone number.
 *
 * @param {Object} params
 * @param {string} params.phoneNumber - Phone of the deleted account (any format).
 * @param {string} [params.restoredBy] - userUniqueId of the admin performing it.
 * @returns {Promise<{message: string, data: Object}>}
 */
const restoreUser = async ({ phoneNumber, restoredBy = null }) => {
  const normalizedPhone = typeof phoneNumber === "string" ? phoneNumber.trim() : "";
  if (!normalizedPhone) {
    throw new AppError("phoneNumber is required to restore a user", AppError.BAD_REQUEST);
  }

  const restored = await executeInTransaction(async () => {
    const executor = transactionStorage.getStore();
    if (!executor) {
      throw new AppError("Restore requires a database transaction", AppError.INTERNAL_SERVER_ERROR);
    }

    const target = await findTargetUser(executor, normalizedPhone);
    if (!target) {
      throw new AppError("No account found with this phone number", AppError.NOT_FOUND);
    }
    if (!target.isDeleted && !target.userDeletedAt) {
      throw new AppError(
        "This account is not deleted — nothing to restore",
        AppError.CONFLICT,
      );
    }

    const actor = restoredBy || target.userUniqueId;
    const [flagUpdate] = await executor.query(
      `UPDATE Users
          SET userDeletedAt = NULL,
              userDeletedBy = NULL,
              isDeleted = 0
        WHERE userUniqueId = ?
          AND (isDeleted = 1 OR userDeletedAt IS NOT NULL)`,
      [target.userUniqueId],
    );
    if (flagUpdate.affectedRows !== 1) {
      throw new AppError(
        "Could not restore the account (it may have been restored concurrently)",
        AppError.CONFLICT,
      );
    }

    const roles = await listUserRoles(executor, target.userUniqueId);
    if (roles.length === 0) {
      throw new AppError(
        "Account has no active role to restore — assign a role first",
        AppError.CONFLICT,
      );
    }

    const bannedRoleIds = await listActiveBanRoleIds(executor, target.userUniqueId);
    const restoredRoles = [];

    for (const role of roles) {
      const needsRestore =
        role.statusId === null ||
        role.statusId === undefined ||
        Number(role.statusId) === DELETED_STATUS_ID;

      if (!needsRestore) {
        restoredRoles.push({
          userRoleId: role.userRoleId,
          roleId: role.roleId,
          statusId: role.statusId,
          statusName: await describeStatus(executor, role.statusId),
          changed: false,
        });
        continue;
      }

      const statusId = await resolveRestoreStatus(executor, role, {
        userUniqueId: target.userUniqueId,
        bannedRoleIds,
      });
      await applyStatus(executor, { role, statusId, restoredBy: actor });
      restoredRoles.push({
        userRoleId: role.userRoleId,
        roleId: role.roleId,
        statusId,
        statusName: await describeStatus(executor, statusId),
        changed: true,
      });
    }

    // Audit: profile history is the only trail that survives a soft delete —
    // deleteUser writes nothing to UsersHistory / UserProfileHistory.
    await recordUserEvent({
      userUniqueId: target.userUniqueId,
      changedBy: actor,
      fieldName: "isDeleted",
      oldValue: 1,
      newValue: 0,
      reason: "Account deleted by mistake; restored by admin",
      // ENUM('registration','profile_update','status_change','ban','unban','manual')
      // — a restore is a direct admin override.
      source: "manual",
      referenceUniqueId: null,
    });

    return {
      userUniqueId: target.userUniqueId,
      fullName: target.fullName,
      phoneNumber: target.phoneNumber,
      email: target.email,
      deletedAt: target.userDeletedAt,
      roles: restoredRoles,
    };
  }, { timeout: 15000 });

  // Post-commit: tokens minted before the deletion are still live session rows,
  // so force a fresh sign-in on every device.
  const sessionsRevoked = await revokeAllSessions({
    userUniqueId: restored.userUniqueId,
    reason: SESSION_REVOKE_REASONS.ADMIN_REVOKE,
  }).catch(error => {
    logger.error("restoreUser: session revoke failed (account still restored)", {
      userUniqueId: restored.userUniqueId,
      error: error.message,
    });
    return 0;
  });

  logger.info("User restored", {
    userUniqueId: restored.userUniqueId,
    phoneNumber: restored.phoneNumber,
    restoredBy,
    roles: restored.roles,
    sessionsRevoked,
  });

  return {
    message: "User restored successfully",
    data: { ...restored, sessionsRevoked },
  };
};

module.exports = {
  restoreUser,
};
