"use strict";

const { v4: uuidv4 } = require("uuid");
const Config = require("../../Utils/Config");
const { DOMAIN } = require("../../Utils/Constants");
const { pool } = require("../../Middleware/Database.config");
const { getData } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { insertData } = require("../../CRUD/Create/CreateData");
const { currentDate, addHours } = require("../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const { usersRoles, USER_STATUS } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { transactionStorage } = require("../../Utils/TransactionContext");
const generateOTP = require("../../Utils/GenerateOTP");
const {
  getPlaceholderEmail,
  isPlaceholderEmail,
} = require("../../Utils/GetPlaceholderEmail");

// Circular dependency handling
let authService;

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

const registerNewUser = async ({
  fullName,
  phoneNumber,
  email,
  roleId,
  statusId,
  requestedFrom,
  createdBy,
  rawPassword,
}) => {
  // Atomic registration: the Users row, its credential, and its initial role
  // must commit together. Nested calls (ensureCredentialForUser and
  // authService.handleExistingUser) join the same transaction through
  // transactionStorage, so a mid-flow failure rolls back instead of leaving an
  // orphaned user row without credentials/role. Nested-safe: if a caller is
  // already inside a transaction, executeInTransaction reuses that connection.
  return executeInTransaction(async () => {
    const userUniqueId = uuidv4();
    const userCreatedAt = currentDate();
    const userCreatedByParam = createdBy || userUniqueId;

    // Use provided email if it exists (even if it's a placeholder we just carefully generated)
    const cleanEmail = email ? email : getPlaceholderEmail(phoneNumber);

    const executor = transactionStorage.getStore() || pool;
    const [userIns] = await executor.query(
      "INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy,isEmailVerified,isPhoneVerified) VALUES (?, ?, ?, ?, ?, ?,?,?)",
      [
        userUniqueId,
        fullName,
        phoneNumber,
        cleanEmail,
        userCreatedAt,
        userCreatedByParam,
        false,
        false,
      ],
    );

    if (userIns.affectedRows === 0) {
      throw new AppError("User registration failed", AppError.INTERNAL_SERVER_ERROR);
    }

    // OPTIMIZATION: Construct userData locally using insertId to avoid a redundant SELECT query
    const userData = {
      userId: userIns.insertId,
      userUniqueId,
      fullName,
      phoneNumber,
      email: cleanEmail,
      userCreatedAt,
      userCreatedBy: userCreatedByParam,
      isEmailVerified: false,
      isPhoneVerified: false,
    };

    await ensureCredentialForUser({ userUniqueId, rawPassword });

    if (!authService) {
      authService = require("./auth");
    }
    return await authService.handleExistingUser({
      requestedFrom,
      user: userData,
      roleId,
      statusId,
    });
  });
};

/**
 * Public (self-service) user creation / OTP login.
 *
 * Creates a brand-new account, or for an existing phone/email turns the request
 * into an OTP-login for the requested role. Registration is atomic (see
 * registerNewUser). Includes identity-hijacking guards: a phone tied to a
 * different real email is blocked unless explicitly a street entry.
 */
const createUser = async (body) => {
  const {
    fullName,
    phoneNumber,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom,
  } = body;

  // Reject invalid statuses up-front (only when explicitly provided) so a
  // client cannot silently register a role in an impossible/nonexistent state.
  // When omitted, the default behavior is preserved (no status row until the
  // account-status evaluation establishes one).
  if (statusId !== undefined && (!Number.isInteger(statusId) || statusId < 1)) {
    throw new AppError(
      "statusId must be a positive integer when provided",
      AppError.BAD_REQUEST,
    );
  }

  let email = body?.email?.trim();
  //if there is no email, generate placeholder email
  if (!email) {
    email = getPlaceholderEmail(phoneNumber);
  }

  // 1. Enforce   phoneNumber
  if (!phoneNumber?.trim()) {
    throw new AppError("Phone number is mandatory for registration.", AppError.BAD_REQUEST);
  }

  const cleanPhone = String(phoneNumber).trim().replace(/\s/g, "");
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;

  /**
   * IDENTITY LOOKUP STRATEGY:
   * 1. Always look up by Phone (Primary Identity).
   * 2. Only look up by Email if it's NOT a system-generated placeholder.
   *    This avoids identifying different users who might happen to have
   *    placeholder emails (though placeholders are designed to be unique
   *    per phone, this is a safety measure).
   */
  const conditions = {
    phoneNumber: cleanPhone,
  };
  // if email is NOT a placeholder, add it to OR conditions for account lookup
  if (cleanEmail && !isPlaceholderEmail(cleanEmail)) {
    conditions.email = cleanEmail;
  }
  // 2. Check if EITHER identity is already taken to prevent separate accounts
  const { performJoinSelect } = require("../../CRUD/Read/ReadData");
  const existing = await performJoinSelect({
    baseTable: "Users",
    conditions,
    operator: "OR",
    limit: 1,
  });

  if (existing?.length > 0) {
    const user = existing[0];

    /**
     * SECURITY CHECK: Prevent "Identity Hijacking"
     *
     * If the phone number exists but is tied to a DIFFERENT real email,
     * we block the request to prevent account takeover.
     *
     * SPECIAL CASE: "Street Hailing" (takeFromStreet)
     * If a driver is registering a shipper from the street, we allow
     * using the existing phone record even if it has a different email.
     * This ensures the driver isn't blocked by the shipper's app privacy
     * settings while on the road.
     */
    const isSavedEmailPlaceholder = isPlaceholderEmail(user?.email);
    const isInputEmailPlaceholder = isPlaceholderEmail(cleanEmail);
    const isStreetEntry = requestedFrom === "street";

    if (
      !isStreetEntry &&
      user?.email &&
      !isSavedEmailPlaceholder &&
      !isInputEmailPlaceholder &&
      user?.email !== cleanEmail
    ) {
      throw new AppError(
        "This phone number is already registered with a different email address.",
        AppError.FORBIDDEN,
      );
    }
    //phone dont have placeholder
    if (user?.phoneNumber && user?.phoneNumber !== cleanPhone) {
      throw new AppError(
        "This email address is already registered with a different phone number.",
        AppError.FORBIDDEN,
      );
    }
    //check if user is deleted
    if (user?.isDeleted || user?.userDeletedAt) {
      throw new AppError("Account has been deleted", AppError.FORBIDDEN);
    }
    // User already has an account, handle OTP login
    if (!authService) {
      authService = require("./auth");
    }
    const userData = {
      requestedFrom,
      user,
      roleId,
      statusId,
      userRoleStatusDescription,
    };

    return await authService.handleExistingUser(userData);
  }

  return await registerNewUser({
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom: "user",
  });
};

/**
 * Ensure an EXISTING user can act in a role: refresh their credential hash and
 * assign the role (with an initial status) if it isn't already held. Shared by
 * the admin/super-admin creation path so the credential + role pair is not
 * duplicated across its email-hit and phone-hit branches.
 *
 * @param {object} params
 * @param {string} params.userUniqueId - Target user.
 * @param {number} params.roleId - Role to ensure.
 * @param {number} [params.statusId] - Initial status when the role is new.
 * @param {string} [params.description] - Reason for the status when created.
 * @param {string} [params.rawPassword] - OTP/password to store for verification.
 * @returns {Promise<void>}
 */
const prepareUserForRole = async ({
  userUniqueId,
  roleId,
  statusId,
  description = "",
  rawPassword,
}) => {
  await ensureCredentialForUser({ userUniqueId, rawPassword });
  await handleUserRoleStatus(userUniqueId, roleId, statusId, description);
};

/**
 * Admin / super-admin user creation.
 *
 * Resolves the target by real email, then by phone, creating the user when
 * unknown and otherwise ensuring the requested role + refreshed credentials.
 * All mutations run inside ONE transaction so a conflict (phone/email mismatch)
 * rolls back every partial change instead of leaving a half-prepared account.
 */
const createUserByAdminOrSuperAdmin = async ({
  body,
  userUniqueId,
  userRoleStatusDescription,
}) => {
  return executeInTransaction(async () => {
    const { fullName, phoneNumber, roleId, statusId } = body;
    let email = body?.email?.trim();

    //if email is not provided create placeholder email
    if (!email) {
      email = getPlaceholderEmail(phoneNumber);
    }
    const userDataByEmail = await getData({
      tableName: "Users",
      conditions: { email },
    });

    if (userDataByEmail?.[0]) {
      await prepareUserForRole({
        userUniqueId: userDataByEmail[0].userUniqueId,
        roleId,
        statusId,
        description: "",
        rawPassword: body?.rawPassword || body?.OTP,
      });
      //
      if (
        !isPlaceholderEmail(email) &&
        phoneNumber &&
        userDataByEmail[0].phoneNumber !== phoneNumber
      ) {
        throw new AppError("There is a difference in phone number", AppError.CONFLICT);
      }
      if (!isPlaceholderEmail(email)) {
        return {
          message: "User operation completed",
          data: null,
        };
      }

      if (isPlaceholderEmail(email)) {
        // If we found a user by this placeholder email but their phone number doesn't match,
        // we generate a unique one for the NEW user we are about to create.
        if (userDataByEmail[0].phoneNumber !== phoneNumber) {
          email = getPlaceholderEmail(
            // eslint-disable-next-line no-magic-numbers -- random 6-digit suffix for placeholder
            phoneNumber + Math.floor(Math.random() * 1000000),
          );
        } else {
          // Same phone + Same placeholder = Same user. We're done.
          return {
            message: "User operation completed",
            data: null,
          };
        }
      }
    }

    const userDataByPhoneNumber = await getData({
      tableName: "Users",
      conditions: { phoneNumber },
    });

    if (userDataByPhoneNumber?.[0]) {
      const existingUser = userDataByPhoneNumber[0];
      const existingUserUniqueId = existingUser.userUniqueId;

      // Update fullName if user.fullName is not provided before, but now fullName is provided and different
      if (
        !existingUser.fullName &&
        fullName &&
        existingUser.fullName !== fullName
      ) {
        await updateData({
          tableName: "Users",
          updateValues: { fullName },
          conditions: { userUniqueId: existingUserUniqueId },
        });
      }

      // Ensure the user is registered for the new role and status, and refresh
      // the credential hash for verification
      await prepareUserForRole({
        userUniqueId: existingUserUniqueId,
        roleId,
        statusId,
        description: userRoleStatusDescription,
        rawPassword: body?.rawPassword || body?.OTP,
      });

      // Only check for email difference if the PROVIDED email is a real email (not a placeholder)
      if (
        email &&
        !isPlaceholderEmail(email) &&
        existingUser.email &&
        existingUser.email !== email
      ) {
        throw new AppError("There is a difference in email address", AppError.CONFLICT);
      }

      return {
        message: "User operation completed",
        data: null,
      };
    }

    return await registerNewUser({
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription,
      requestedFrom: "Supper Admin/Admin",
      createdBy: userUniqueId,
      rawPassword: body?.rawPassword || body?.OTP,
    });
  });
};
//some jobs can be done by system itself by written codes not by admin or supper admin or users
const createUserSystem = async () => {
  const fullName = Config.SUPER_ADMIN.SYSTEM_FULL_NAME || "system";
  const phoneNumber = Config.SUPER_ADMIN.SYSTEM_PHONE || "+251922112480";
  const email = Config.SUPER_ADMIN.SYSTEM_EMAIL || "system@system.com";
  const roleId = usersRoles.systemRoleId;
  const statusId = USER_STATUS.ACTIVE;

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription:
        "this can manage things by itself based on written programs",
      rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
    },
    userUniqueId: "system",
  });

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName: Config.SUPER_ADMIN.FULL_NAME || "Supper Admin",
      phoneNumber: Config.SUPER_ADMIN.PHONE || "+251983222221",
      email: Config.SUPER_ADMIN.EMAIL || "supperAdmin@supperAdmin.com",
      roleId: usersRoles.supperAdminRoleId,
      statusId: USER_STATUS.ACTIVE,
      userRoleStatusDescription:
        "Supper Admin can manage drivers shippers and admin using api requests",
      rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
    },
    userUniqueId: "Supper Admin",
  });
};

module.exports = {
  createUser,
  createUserSystem,
  createUserByAdminOrSuperAdmin,
  registerNewUser,
  ensureCredentialForUser,
  handleUserRoleStatus,
};
