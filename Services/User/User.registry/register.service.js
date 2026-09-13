"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../../Middleware/Database.config");
const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const {
  getPlaceholderEmail,
  isPlaceholderEmail,
} = require("../../../Utils/GetPlaceholderEmail");
const {
  normalizePhoneNumber,
  phoneNumberVariants,
  areSamePhone,
} = require("../../../Utils/PhoneNumber");
const { sendRegistrationAlert } = require("../../../Utils/TelegramNotifier");
const { ensureCredentialForUser } = require("./credentials.service");

// Circular dependency handling
let authService;

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
  let createdUser = null;
  const result = await executeInTransaction(async () => {
    const userUniqueId = uuidv4();
    const userCreatedAt = currentDate();
    const userCreatedByParam = createdBy || userUniqueId;

    // Use provided email if it exists (even if it's a placeholder we just carefully generated)
    // Store the canonical (+251…, national, or 0… as given) normalized to +251… so
    // future phone lookups agree on a single identity regardless of input format.
    const canonicalPhone = normalizePhoneNumber(phoneNumber);
    const cleanEmail = email ? email : getPlaceholderEmail(canonicalPhone);

    const executor = transactionStorage.getStore() || pool;
    const [userIns] = await executor.query(
      "INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy,isEmailVerified,isPhoneVerified) VALUES (?, ?, ?, ?, ?, ?,?,?)",
      [
        userUniqueId,
        fullName,
        canonicalPhone,
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
      phoneNumber: canonicalPhone,
      email: cleanEmail,
      userCreatedAt,
      userCreatedBy: userCreatedByParam,
      isEmailVerified: false,
      isPhoneVerified: false,
    };
    createdUser = userData;

    await ensureCredentialForUser({ userUniqueId, rawPassword });

    if (!authService) {
      authService = require("../auth");
    }
    return await authService.handleExistingUser({
      requestedFrom,
      user: userData,
      roleId,
      statusId,
    });
  });

  // Best-effort Telegram alert AFTER the transaction commits so a successful
  // registration is never rolled back by a failed notification. System-boot
  // seed users (createdBy is a literal "system"/"Supper Admin" here) are skipped.
  const isSystemBootstrap = createdBy === "system" || createdBy === "Supper Admin";
  if (createdUser && !isSystemBootstrap) {
    void sendRegistrationAlert({
      fullName: createdUser.fullName,
      phoneNumber: createdUser.phoneNumber,
      email: createdUser.email,
      roleId,
      userCreatedAt: createdUser.userCreatedAt,
      userUniqueId: createdUser.userUniqueId,
    });
  }

  return result;
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
   * 1. Always look up by Phone (Primary Identity). The lookup matches ANY stored
   *    format of the number (canonical +251…, national 251…, or local 0…) so an
   *    already-existing user is found regardless of how they were stored — this
   *    prevents duplicate rows and spurious "New user registered" alerts.
   * 2. Only look up by Email if it's NOT a system-generated placeholder.
   *    This avoids identifying different users who might happen to have
   *    placeholder emails (though placeholders are designed to be unique
   *    per phone, this is a safety measure).
   */
  const conditions = {
    phoneNumber: phoneNumberVariants(cleanPhone),
  };
  // if email is NOT a placeholder, add it to OR conditions for account lookup
  if (cleanEmail && !isPlaceholderEmail(cleanEmail)) {
    conditions.email = cleanEmail;
  }
  // 2. Check if EITHER identity is already taken to prevent separate accounts
  const { performJoinSelect } = require("../../../CRUD/Read/ReadData");
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
    // Compare numbers canonically so format differences (+251x vs 251x vs 0x)
    // do not falsely flag the SAME person as a different phone number.
    if (user?.phoneNumber && !areSamePhone(user?.phoneNumber, cleanPhone)) {
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
      authService = require("../auth");
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
    phoneNumber: normalizePhoneNumber(phoneNumber),
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom: "user",
  });
};

module.exports.registerNewUser = registerNewUser;
module.exports.createUser = createUser;
