"use strict";



const generateOTP = require("../../../Utils/GenerateOTP");

const {
  currentDate,
  addHours
} = require("../../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");



const AppError = require("../../../Utils/AppError");

const {
  getData,
  performJoinSelect
} = require("../../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../../CRUD/Update/Data.update");
const {
  insertData
} = require("../../../CRUD/Create/CreateData");
const {
  v4: uuidv4
} = require("uuid");

let manageService;
let registryService;




const handleExistingUser = async ({
  requestedFrom,
  user,
  roleId,
  statusId,
  userRoleStatusDescription = "no description"
}) => {
  if (!registryService) {
    registryService = require("../User.registry.service");
  }
  const userUniqueId = user.userUniqueId;
  if (!userUniqueId) {
    throw new AppError("wrong user data", 400);
  }

  // 3. Separate Identity Verification (OTP or Link Generation)
  const isPhoneVerified = !!user.isPhoneVerified;
  const isEmailVerified = !!user.isEmailVerified;

  // OPTIMIZATION: Skip redundant status updates if this is a standard login
  const pendingOperations = [getData({
    tableName: "usersCredential",
    conditions: {
      userUniqueId
    }
  })];

  // Manage User Role and Status initialization/updates
  // JUNIOR NOTE: We delegate this to a single point to ensure consistency.
  // handleUserRoleStatus performs its own existence checks to avoid redundant DB writes.
  pendingOperations.push(registryService.handleUserRoleStatus(userUniqueId, roleId, statusId, userRoleStatusDescription));
  const [savedCredentialRows] = await Promise.all(pendingOperations);
  const savedCredential = savedCredentialRows?.[0] || {};

  /**
   * HYBRID CHANNEL LOGIC:
   * To prevent "channel leakage", we ensure OTPs are dedicated to
   * their specific communication channels.
   *
   * 1. Phone Logic:
   *    - Unverified: Gets phoneVerificationOTP (SMS).
   *    - Verified: Gets shared login OTP (SMS).
   *
   * 2. Email Logic:
   *    - Unverified: Gets a Verification Link (UUID).
   *    - Verified: Gets shared login OTP (Email).
   *
   * 3. Admin Assignment:
   *    - Gets a specialized Welcome Message (SMS + Email).
   */
  // Rule 3: Use Legacy OTP if both verified, otherwise generate primary session OTP
  const OTP = generateOTP();

  /**
   * 1. Phone Logic: If phoneNumber is unverified, it gets a unique phoneVerificationOTP (SMS).
   *    If already verified, it uses the shared login OTP.
   */
  let phoneVerificationOTP = isPhoneVerified ? OTP : generateOTP();

  /**
   * 2. Email Logic: If email is unverified, it focuses on the Verification Link.
   *    If verified, it uses the shared login OTP.
   */
  let emailVerificationToken = savedCredential.emailVerificationToken;
  let emailVerificationExpiresAt = savedCredential.emailVerificationExpiresAt;
  if (!isEmailVerified) {
    // If link is missing or expired, generate a new one
    const parseDate = d => {
      if (d instanceof Date) {
        return d;
      }
      return new Date(String(d).replace(" ", "T") + "Z");
    };
    const isExpired = emailVerificationExpiresAt && parseDate(emailVerificationExpiresAt) < parseDate(currentDate());
    if (!emailVerificationToken || isExpired) {
      emailVerificationToken = uuidv4();
      emailVerificationExpiresAt = addHours(currentDate(), 2);
    }
  }

  // OPTIMIZATION: Parallelize CPU-intensive bcrypt hashing to unblock the event loop
  const hashingPromises = [bcrypt.hash(String(OTP), 10)];
  if (!isPhoneVerified) {
    hashingPromises.push(bcrypt.hash(String(phoneVerificationOTP), 10));
  }
  const hashedResults = await Promise.all(hashingPromises);
  const hashedOTP = hashedResults[0];
  const hashedPhoneVerificationOTP = isPhoneVerified ? hashedOTP : hashedResults[1];
  const hashedEmailVerificationOTP = isEmailVerified ? hashedOTP : null;
  const credentialValues = {
    phoneVerificationOTP: hashedPhoneVerificationOTP,
    emailVerificationOTP: hashedEmailVerificationOTP,
    sharedOTP: hashedOTP,
    // Legacy
    emailVerificationToken,
    emailVerificationExpiresAt
  };
  if (!savedCredential.credentialUniqueId) {
    await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId: uuidv4(),
        userUniqueId,
        ...credentialValues,
        hashedPassword: hashedPhoneVerificationOTP,
        usersCredentialCreatedAt: currentDate()
      }
    });
  } else {
    await updateData({
      tableName: "usersCredential",
      updateValues: credentialValues,
      conditions: {
        userUniqueId
      }
    });
  }
  const publicUserProfile = {
    userId: user.userId,
    userUniqueId: user.userUniqueId,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    isPhoneVerified,
    isEmailVerified,
    userCreatedAt: user.userCreatedAt
  };
  if (requestedFrom === "street") {
    // SECURITY: Still use explicit extraction even for street entry
    return {
      message: "success",
      data: publicUserProfile
    };
  }
  return {
    message: "success",
    data: publicUserProfile,
    messageDetail: "Verification data generated (Deferred)",
  };
};

const loginUser = async (phoneNumber, roleId, email = null) => {
  if (!manageService) {
    manageService = require("../manage");
  }
  if (!roleId) {
    throw new AppError("Role ID is required.", 400);
  }

  // Check if at least one identity is provided
  if (!phoneNumber?.trim() && !email?.trim()) {
    throw new AppError("Phone number or email address is required.", 400);
  }

  // PERFORMANCE FIX: Use exact match on indexed columns instead of wildcard search
  const userDataResult = await performJoinSelect({
    baseTable: "Users",
    joins: [{
      table: "UserRole",
      on: "Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL"
    }, {
      table: "UserRoleStatusCurrent",
      on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId"
    }],
    conditions: phoneNumber ? {
      "Users.phoneNumber": phoneNumber,
      "UserRole.roleId": roleId
    } : {
      "Users.email": email,
      "UserRole.roleId": roleId
    }
  });
  if (!userDataResult || userDataResult.length === 0) {
    throw new AppError("Invalid credentials", 404);
  }

  // Group roles for the found user
  const userData = userDataResult[0]; // Core user info is same for all rows
  if (userData?.isDeleted || userData?.userDeletedAt) {
    throw new AppError("Account has been deleted", 403);
  }

  // Find the specific role the user is trying to log into
  const roleEntry = userDataResult.find(row => row.roleId === roleId);
  if (!roleEntry) {
    throw new AppError("Invalid credentials", 404);
  }
  return await handleExistingUser({
    requestedFrom: "user",
    user: userData,
    email: email || userData.email,
    // Use provided email to potentially upgrade placeholder
    roleId,
    statusId: roleEntry.statusId
  });
};

/**
 * Core business logic for verifying a user's OTP and issuing an authentication token.
 *
 * ### Hybrid Verification Logic:
 * - **Channel Specific:** Checks the specific OTP tied to the channel the user initiated.
 *   If the channel is fully verified (`isPhoneVerified=1` or `isEmailVerified=1`), it compares
 *   against the unified `savedOTP`. If unverified, it compares against the channel-specific
 *   `phoneOTP` or `emailOTP`.
 * - **Multi-channel Request:** If the user payload contains BOTH phone and email, it sequentially
 *   checks the phone block first. If phone matches, it skips the email check to securely only mark
 *   the explicitly proven channel as verified.
 * - **Legacy Fallback:** If specific channel OTPs are missing but the legacy `OTP` column exists,
 *   it gracefully falls back, assigning the match to the submitted identity (preferring SMS).
 *
 * @param {Object} req - The Express request object.
 * @param {Object} req.body - The request payload containing authentication parameters.
 * @param {string} [req.body.phoneNumber] - The user's phone number.
 * @param {string} [req.body.email] - The user's email address.
 * @param {string} req.body.OTP - The user-provided 6-digit code.
 * @param {number} req.body.roleId - The requested role to log into.
 * @returns {Promise<Object>} An object containing the JWT token, success message, and exact `verificationStatus` flags.
 * @throws {AppError} 401 Unauthorized if OTP doesn't match; 404 if user not found; 403 if deleted.
 */

module.exports = {
  handleExistingUser,
  loginUser
};
