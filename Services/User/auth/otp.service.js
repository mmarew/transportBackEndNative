"use strict";

const createJWT = require("../../../Utils/CreateJWT");

const verifyPassword = require("../../../Utils/VerifyPassword");
const logger = require("../../../Utils/logger");
const { usersRoles } = require("../../../Utils/ListOfSeedData");
const AppError = require("../../../Utils/AppError");
const {
  sendSocketIONotificationToAdmin,
} = require("../../../Utils/Notifications");
const { getData, performJoinSelect } = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");

const {
  driversDocumentVehicleRequirement,
} = require("../../RoleDocumentRequirements");

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
const verifyUserByOTP = async (req) => {
  console.log("🚀 ~ verifyUserByOTP ~ req.body:", req.body);
  const { phoneNumber, email, OTP, roleId } = req.body;
  if (!OTP || (!phoneNumber && !email)) {
    throw new AppError("OTP and identity (phone/email) are required", 400);
  }
  const conditions = {};
  if (phoneNumber) {
    conditions.phoneNumber = phoneNumber;
  }
  if (email) {
    conditions.email = email;
  }
  const verifyUserExistence = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "usersCredential",
        on: "Users.userUniqueId = usersCredential.userUniqueId",
      },
    ],
    conditions,
    limit: 1,
  });
  if (!verifyUserExistence || verifyUserExistence.length === 0) {
    throw new AppError("user not found", 404);
  }
  const userRow = verifyUserExistence?.[0];
  if (userRow?.isDeleted || userRow?.userDeletedAt) {
    throw new AppError("Account has been deleted", 403);
  }

  //check if phone from user and phone from database is same
  if (phoneNumber && userRow?.phoneNumber !== phoneNumber) {
    throw new AppError("Phone number does not match", 401);
  }

  //check if email from user and email from database is same
  if (email && userRow?.email !== email) {
    throw new AppError("Email does not match", 401);
  }
  const isPhoneVerified = userRow?.isPhoneVerified;
  const isEmailVerified = userRow?.isEmailVerified;
  const savedOTP = userRow?.sharedOTP;
  const phoneVerificationOTP = userRow?.phoneVerificationOTP;
  const emailVerificationOTP = userRow?.emailVerificationOTP;

  /**
   * CHANNEL VALIDATION LOGIC:
   * 1. If an identity (Phone/Email) is ALREADY verified, it matches against the unified 'sharedOTP' (savedOTP).
   * 2. If it is UNVERIFIED, it MUST match its specific verification OTP column.
   * 3. This prevents a user from using an Email OTP to verify an unverified Phone (security integrity).
   */

  // 1. Check which identity the OTP matches
  let phoneMatched = false;
  let emailMatched = false;

  // Verify Phone OTP (if phone is provided)
  if (phoneNumber) {
    const hashToCheck = isPhoneVerified ? savedOTP : phoneVerificationOTP;
    if (hashToCheck) {
      try {
        await verifyPassword({
          hashedPassword: hashToCheck,
          notHashedPassword: String(OTP),
        });
        phoneMatched = true;
      } catch {
        // Log mismatch but don't stop the flow if email might still match
        logger.debug("Phone OTP mismatch");
      }
    }
  }

  // Verify Email OTP (if email is provided AND phone didn't match)
  if (email && !phoneMatched) {
    const hashToCheck = isEmailVerified ? savedOTP : emailVerificationOTP;
    if (hashToCheck) {
      try {
        await verifyPassword({
          hashedPassword: hashToCheck,
          notHashedPassword: String(OTP),
        });
        emailMatched = true;
      } catch {
        logger.debug("Email OTP mismatch");
      }
    }
  }

  // Final check: Throws 401 if neither channel matched
  if (!phoneMatched && !emailMatched) {
    throw new AppError(
      "Invalid OTP. Please check the code and try again.",
      401,
    );
  }

  // 2. Update verification status in the database
  const updateValues = {};
  if (phoneMatched) {
    updateValues.isPhoneVerified = true;
  }
  if (emailMatched) {
    updateValues.isEmailVerified = true;
  }
  if (Object.keys(updateValues).length > 0) {
    await updateData({
      tableName: "Users",
      updateValues,
      conditions: {
        userUniqueId: userRow.userUniqueId,
      },
    });
  }
  const userInRoleId = await getData({
    tableName: "UserRole",
    conditions: {
      roleId,
      userUniqueId: userRow.userUniqueId,
    },
  });
  if (userInRoleId.length === 0) {
    throw new AppError("user not found in this role", 401);
  }
  const tokenData = createJWT({
    userUniqueId: userRow.userUniqueId,
    fullName: userRow.fullName,
    phoneNumber: userRow.phoneNumber,
    email: userRow.email,
    roleId,
    isPhoneVerified: phoneMatched || !!userRow.isPhoneVerified,
    isEmailVerified: emailMatched || !!userRow.isEmailVerified,
  });
  const resData = {
    message: "success",
    token: tokenData.token,
    data: "OTP verified successfully",
    // verificationStatus: {
    //   phoneVerified: phoneMatched || !!userRow.isPhoneVerified,
    //   emailVerified: emailMatched || !!userRow.isEmailVerified,
    // },
    userData: {
      userId: userRow.userId,
      userUniqueId: userRow.userUniqueId,
      fullName: userRow.fullName,
      phoneNumber: userRow.phoneNumber,
      email: userRow.email,
      isPhoneVerified: phoneMatched || !!userRow.isPhoneVerified,
      isEmailVerified: emailMatched || !!userRow.isEmailVerified,
      userCreatedAt: userRow.userCreatedAt,
      roleId: Number(roleId),
      // SECURITY: Ensure credentials are NEVER leaked
    },
  };
  //if user is driver send PENDING, REJECTED or NOT_SUBMITTED document and vehicle requirement to admin in web socket to communicate driver.
  if (Number(roleId) === usersRoles.driverRoleId) {
    const docReq = await driversDocumentVehicleRequirement({
      ownerUserUniqueId: userRow.userUniqueId,
      user: userRow,
    });
    if (docReq?.message === "error") {
      throw new AppError(docReq.error || "Failed to check requirements", 500);
    }
    const { unAttachedDocumentTypes, attachedDocumentsByStatus } = docReq;
    if (
      attachedDocumentsByStatus?.PENDING?.length > 0 ||
      attachedDocumentsByStatus?.REJECTED?.length > 0 ||
      unAttachedDocumentTypes?.length > 0
    ) {
      sendSocketIONotificationToAdmin({
        message: {
          ...docReq,
        },
      });
    }
    resData.documentAndVehicleOfDriver = docReq;
  }
  return resData;
};

/**
 * Verifies a user's email using a unique UUID token.
 *
 * JUNIOR NOTE: This function does 3 main things:
 * 1. Security Check: Validates the token exists and hasn't expired.
 * 2. Database Update: Marks `isEmailVerified = true` in the `Users` table.
 * 3. Real-time UX: Generates a new JWT with the "Verified" status and pushes it
 *    to the user's phone/web app via Socket.io so they don't have to log in again.
 *
 * @param {string} token - The unique verification token from the email link.
 */

module.exports = {
  verifyUserByOTP,
};
