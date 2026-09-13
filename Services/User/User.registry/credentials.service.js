"use strict";

const { v4: uuidv4 } = require("uuid");
const { DOMAIN } = require("../../../Utils/Constants");
const { pool } = require("../../../Middleware/Database.config");
const { getData } = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const { insertData } = require("../../../CRUD/Create/CreateData");
const { currentDate, addHours } = require("../../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const AppError = require("../../../Utils/AppError");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const generateOTP = require("../../../Utils/GenerateOTP");

const ensureCredentialForUser = async ({ userUniqueId, rawPassword }) => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId required", AppError.BAD_REQUEST);
  }
  const OTP = rawPassword || generateOTP();
  const phoneOTP = rawPassword || generateOTP();
  const emailOTP = rawPassword || generateOTP();

  // OPTIMIZATION: Parallelize CPU-intensive bcrypt hashing to unblock the event loop
  const [hashedOTP, hashedPhoneVerificationOTP, hashedEmailVerificationOTP] =
    await Promise.all([
      bcrypt.hash(String(OTP), DOMAIN.BCRYPT_SALT_ROUNDS),
      bcrypt.hash(String(phoneOTP), DOMAIN.BCRYPT_SALT_ROUNDS),
      bcrypt.hash(String(emailOTP), DOMAIN.BCRYPT_SALT_ROUNDS),
    ]);

  const conditions = { userUniqueId };
  const existing = await getData({
    tableName: "usersCredential",
    conditions,
  });

  const emailVerificationToken = uuidv4();
  // SECURITY: Standardize expiry to 2 hours as per docs and auth service
  const emailVerificationExpiresAt = addHours(currentDate(), DOMAIN.EMAIL_VERIFICATION_EXPIRY_HOURS);

  if (existing && existing.length > 0) {
    const credentialColAndValues = {
      sharedOTP: hashedOTP,
      hashedPassword: hashedOTP,
    };
    const user = existing?.[0];
    const isPhoneVerified = user?.isPhoneVerified;
    const isEmailVerified = user?.isEmailVerified;
    //if phone is verified update phoneVerificationOTP to hashedOTP
    if (isPhoneVerified) {
      credentialColAndValues.phoneVerificationOTP = hashedOTP;
    } else {
      credentialColAndValues.phoneVerificationOTP = hashedPhoneVerificationOTP;
    }
    //if email is verified update emailVerificationOTP to hashedOTP
    if (isEmailVerified) {
      credentialColAndValues.emailVerificationOTP = hashedOTP;
    } else {
      credentialColAndValues.emailVerificationToken = emailVerificationToken;
      credentialColAndValues.emailVerificationExpiresAt =
        emailVerificationExpiresAt;
      credentialColAndValues.emailVerificationOTP = hashedEmailVerificationOTP;
    }

    const upd = await updateData({
      tableName: "usersCredential",
      updateValues: { ...credentialColAndValues },
      conditions: { userUniqueId },
    });
    if (upd?.affectedRows === 0) {
      throw new AppError("Unable to update credential", AppError.INTERNAL_SERVER_ERROR);
    }
    return { message: "User operation completed" };
  }

  const credentialColAndVal = {
    userUniqueId,
    credentialUniqueId: uuidv4(),
    phoneVerificationOTP: hashedPhoneVerificationOTP,
    emailVerificationOTP: hashedEmailVerificationOTP,
    sharedOTP: hashedOTP, // Legacy
    emailVerificationToken,
    emailVerificationExpiresAt,
    hashedPassword: hashedOTP,
    usersCredentialCreatedBy: userUniqueId,
    usersCredentialCreatedAt: currentDate(),
  };
  const ins = await insertData({
    tableName: "usersCredential",
    colAndVal: {
      ...credentialColAndVal,
    },
  });

  if (ins?.affectedRows === 0) {
    throw new AppError("Unable to create credential", AppError.INTERNAL_SERVER_ERROR);
  }
  return { message: "User operation completed" };
};
/**
 * Assign a role to a user, creating the UserRole row and an initial
 * UserRoleStatusCurrent when the role has not been assigned yet.
 *
 * SECURITY / INTEGRITY NOTE: This is intentionally INSERT-ONLY for the status.
 * When the role already exists and already has a status, the status is left
 * untouched. Status transitions are owned by `updateUserRoleStatus` (which
 * moves the current row to history before changing it) and by the
 * account-status evaluation. If this helper overwrote an existing status it
 * would let a (re)registration silently change an account's lifecycle state —
 * e.g. un-ban an admin-suspended user or pop an account back to a setup state
 * on every public create/login call — which is why callers pass the same
 * status back on re-use without effect.
 *
 * @param {string} userUniqueId - Owner of the role being assigned.
 * @param {number} roleId - Role to ensure (Roles.roleId).
 * @param {number} [statusId] - Initial status for the role; only applied when
 *   the role's status row is created now (no effect on an existing status).
 * @param {string} [description] - Reason stored with a newly created status.
 * @returns {Promise<void>}
 */
const handleUserRoleStatus = async (
  userUniqueId,
  roleId,
  statusId,
  description = "",
) => {
  const executor = transactionStorage.getStore() || pool;
  //get users role if it was already assigned
  const [existingRoles] = await executor.query(
    "SELECT userRoleId FROM UserRole WHERE userUniqueId = ? AND roleId = ?",
    [userUniqueId, roleId],
  );

  let userRoleId;
  //if user role is not assigned, assign it
  if (existingRoles.length === 0) {
    const userRoleUniqueId = uuidv4();
    const [roleIns] = await executor.query(
      "INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy) VALUES (?, ?, ?, ?, ?)",
      [userRoleUniqueId, userUniqueId, roleId, currentDate(), userUniqueId],
    );
    userRoleId = roleIns.insertId;
  } else {
    userRoleId = existingRoles[0].userRoleId;
  }
  //get users role status if it was already assigned
  const [existingStatus] = await executor.query(
    "SELECT userRoleStatusId FROM UserRoleStatusCurrent WHERE userRoleId = ?",
    [userRoleId],
  );
  //if user role status is not assigned, assign it
  if (existingStatus.length === 0) {
    await executor.query(
      "INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleId, statusId, userRoleStatusDescription, userRoleStatusCreatedAt, userRoleStatusCreatedBy) VALUES (?, ?, ?, ?, ?, ?)",
      [
        uuidv4(),
        userRoleId,
        statusId,
        description,
        currentDate(),
        userUniqueId,
      ],
    );
  }
  // NOTE: Deliberately insert-only — never overwrite an existing status here.
  // See the JSDoc above for the security rationale.
};

module.exports.ensureCredentialForUser = ensureCredentialForUser;
module.exports.handleUserRoleStatus = handleUserRoleStatus;
