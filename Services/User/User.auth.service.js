"use strict";

const Config = require("../../Utils/Config");

const jwt = require("jsonwebtoken");
const generateOTP = require("../../Utils/GenerateOTP");
const createJWT = require("../../Utils/CreateJWT");
const { currentDate, addHours } = require("../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const verifyPassword = require("../../Utils/VerifyPassword");
const logger = require("../../Utils/logger");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const {
  sendSocketIONotificationToAdmin,
} = require("../../Utils/Notifications");
const { getData, performJoinSelect } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { insertData } = require("../../CRUD/Create/CreateData");
const { v4: uuidv4 } = require("uuid");
const { getSocket } = require("../../Utils/WsConnectionStore");
const { emitMessage } = require("../../Utils/WsServerResponder");
const messageTypes = require("../../Utils/MessageTypes");

const {
  driversDocumentVehicleRequirement,
} = require("../RoleDocumentRequirements.service");

let manageService;
let registryService;

const handleExistingUser = async ({
  requestedFrom,
  user,

  roleId,
  statusId,
  userRoleStatusDescription = "no description",
}) => {
  if (!registryService) {
    registryService = require("./User.registry.service");
  }

  const userUniqueId = user.userUniqueId;
  if (!userUniqueId) {
    throw new AppError("wrong user data", 400);
  }

  // 3. Separate Identity Verification (OTP or Link Generation)
  const isPhoneVerified = !!user.isPhoneVerified;
  const isEmailVerified = !!user.isEmailVerified;

  // OPTIMIZATION: Skip redundant status updates if this is a standard login
  const pendingOperations = [
    getData({ tableName: "usersCredential", conditions: { userUniqueId } }),
  ];

  // Manage User Role and Status initialization/updates
  // JUNIOR NOTE: We delegate this to a single point to ensure consistency.
  // handleUserRoleStatus performs its own existence checks to avoid redundant DB writes.
  pendingOperations.push(
    registryService.handleUserRoleStatus(
      userUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription,
    ),
  );

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
  let emailVerificationOTP = isEmailVerified ? OTP : null;
  let emailVerificationToken = savedCredential.emailVerificationToken;
  let emailVerificationExpiresAt = savedCredential.emailVerificationExpiresAt;

  if (!isEmailVerified) {
    // If link is missing or expired, generate a new one
    const parseDate = (d) => {
      if (d instanceof Date) {
        return d;
      }
      return new Date(String(d).replace(" ", "T") + "Z");
    };

    const isExpired =
      emailVerificationExpiresAt &&
      parseDate(emailVerificationExpiresAt) < parseDate(currentDate());

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
  const hashedPhoneVerificationOTP = isPhoneVerified
    ? hashedOTP
    : hashedResults[1];
  const hashedEmailVerificationOTP = isEmailVerified ? hashedOTP : null;

  const credentialValues = {
    phoneVerificationOTP: hashedPhoneVerificationOTP,
    emailVerificationOTP: hashedEmailVerificationOTP,
    sharedOTP: hashedOTP, // Legacy
    emailVerificationToken,
    emailVerificationExpiresAt,
  };

  if (!savedCredential.credentialUniqueId) {
    await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId: uuidv4(),
        userUniqueId,
        ...credentialValues,
        hashedPassword: hashedPhoneVerificationOTP,
        usersCredentialCreatedAt: currentDate(),
      },
    });
  } else {
    await updateData({
      tableName: "usersCredential",
      updateValues: credentialValues,
      conditions: { userUniqueId },
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
    userCreatedAt: user.userCreatedAt,
  };

  if (requestedFrom === "street") {
    // SECURITY: Still use explicit extraction even for street entry
    return { message: "success", data: publicUserProfile };
  }

  let otpDetail = "";
  let deferredOTP = null;

  // JUNIOR NOTE: We now default to deferredOTP (non-blocking) for all calls
  // to dramatically improve API latency.
  otpDetail = "Verification data generated (Deferred)";
  deferredOTP = {
    phoneVerificationOTP,
    emailVerificationOTP,
    emailVerificationToken,
  };

  return {
    message: "success",
    data: publicUserProfile,
    messageDetail: otpDetail,
    deferredOTP,
  };
};

const loginUser = async (phoneNumber, roleId, email = null) => {
  if (!manageService) {
    manageService = require("./User.manage.service");
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
    joins: [
      {
        table: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL",
      },
      {
        table: "UserRoleStatusCurrent",
        on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
      },
    ],
    conditions: phoneNumber
      ? { "Users.phoneNumber": phoneNumber, "UserRole.roleId": roleId }
      : { "Users.email": email, "UserRole.roleId": roleId },
  });

  if (!userDataResult || userDataResult.length === 0) {
    throw new AppError(
      "User not found at this phone/email address. Please sign up first.",
      404,
    );
  }

  // Group roles for the found user
  const userData = userDataResult[0]; // Core user info is same for all rows
  if (userData?.isDeleted || userData?.userDeletedAt) {
    throw new AppError("Account has been deleted", 403);
  }

  // Find the specific role the user is trying to log into
  const roleEntry = userDataResult.find((row) => row.roleId === roleId);
  if (!roleEntry) {
    throw new AppError(
      "User not found at this role. Please sign up for this role first.",
      404,
    );
  }

  return await handleExistingUser({
    requestedFrom: "user",
    user: userData,
    email: email || userData.email, // Use provided email to potentially upgrade placeholder
    roleId,
    statusId: roleEntry.statusId,
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
const verifyUserByOTP = async (req) => {
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
      conditions: { userUniqueId: userRow.userUniqueId },
    });
  }

  const userInRoleId = await getData({
    tableName: "UserRole",
    conditions: { roleId, userUniqueId: userRow.userUniqueId },
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
      sendSocketIONotificationToAdmin({ message: { ...docReq } });
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
const verifyEmailByToken = async (token) => {
  if (!token) {
    throw new AppError("Invalid or missing token", 400);
  }

  const [credential] = await getData({
    tableName: "usersCredential",
    conditions: { emailVerificationToken: token },
  });

  if (!credential) {
    throw new AppError("Verification link is invalid or has expired.", 400);
  }
  // Use the EAT string from currentDate() and parse it as a local date (without "Z")
  // to ensure it is on the same scale as the database values.
  const now = new Date(currentDate().replace(" ", "T"));
  const expiry =
    typeof credential.emailVerificationExpiresAt === "string"
      ? new Date(credential.emailVerificationExpiresAt.replace(" ", "T"))
      : new Date(credential.emailVerificationExpiresAt);

  if (now > expiry) {
    throw new AppError(
      "Verification link has expired. Please log in again to receive a new one.",
      400,
    );
  }

  const userUniqueId = credential.userUniqueId;

  // Mark as verified in the main Users table
  await updateData({
    tableName: "Users",
    updateValues: { isEmailVerified: true },
    conditions: { userUniqueId },
  });

  // Fetch the user to get their email and phone verification status
  const [userRow] = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  const isPhoneVerified = !!userRow?.isPhoneVerified;

  const credentialUpdateValues = {
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
  };

  await updateData({
    tableName: "usersCredential",
    updateValues: credentialUpdateValues,
    conditions: { userUniqueId },
  });

  // BROADCAST: Send updated token via WebSocket to any active connections
  // JUNIOR NOTE: This is the "Magic" part. We find out if the user is currently
  // online (using their phone number). If they are, we calculate a new security
  // token (JWT) and send it over the websocket. The app receives this and
  // automatically unlocks verified features.
  try {
    const userRoles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId },
    });

    if (userRow.phoneNumber && userRoles.length > 0) {
      const cleanedPhone = userRow.phoneNumber
        .replace(/\//g, "")
        .replace(/\+/g, "");

      for (const ur of userRoles) {
        const roleId = Number(ur.roleId);
        let userType = "passenger";
        if (roleId === usersRoles.driverRoleId) {
          userType = "driver";
        } else if (roleId === usersRoles.adminRoleId) {
          userType = "admin";
        } else if (roleId === usersRoles.supperAdminRoleId) {
          userType = "admin";
        }

        const socketId = await getSocket(userType, cleanedPhone);
        if (socketId) {
          const tokenData = createJWT({
            userUniqueId,
            fullName: userRow.fullName,
            phoneNumber: userRow.phoneNumber,
            email: userRow.email,
            roleId,
            isPhoneVerified: !!userRow.isPhoneVerified,
            isEmailVerified: true,
          });

          emitMessage({
            socketId,
            eventName: "messages",
            messageDetails: JSON.stringify({
              messageTypes: messageTypes.email_verified_token_update,
              token: tokenData.token,
              userType,
            }),
          });
        }
      }
    }
  } catch (wsError) {
    logger.warn("Failed to broadcast updated token after email verification", {
      userUniqueId,
      error: wsError.message,
    });
  }

  //let users get the status immediately as they are verified
  return {
    message: "success",
    data: {
      phoneVerified: isPhoneVerified,
      emailVerified: true,
    },
  };
};

/**
 * Handles reporting of misdirected verification emails.
 *
 * JUNIOR NOTE: This is a "Disavowal" flow. If someone receives an email they didn't
 * request, we let them revoke the link. This prevents malicious sign-ups and
 * notifies the original requester (via WebSocket) that their email was rejected.
 *
 * @param {string} token - The token to revoke.
 */
const reportMisdirectedEmail = async (token) => {
  if (!token) {
    throw new AppError("Token is required.", 400);
  }

  // Find the credential by token
  const [credential] = await getData({
    tableName: "usersCredential",
    conditions: { emailVerificationToken: token },
  });

  if (!credential) {
    throw new AppError(
      "This report link has already been processed or is invalid.",
      400,
    );
  }

  const { userUniqueId } = credential;

  // 1. Immediately revoke the token to stop further attempts
  await updateData({
    tableName: "usersCredential",
    updateValues: {
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
    conditions: { userUniqueId },
  });

  // 2. Notify the originator via WebSocket if they are online
  const [user] = await getData({
    tableName: "users",
    conditions: { userUniqueId },
  });

  if (user && user.phoneNumber) {
    const cleanedPhone = user.phoneNumber.replace(/\+/g, "");
    const roles = ["passenger", "driver", "admin"];

    for (const role of roles) {
      const socketId = await getSocket(role, cleanedPhone);
      if (socketId) {
        try {
          emitMessage({
            socketId,
            eventName: "messages",
            messageDetails: JSON.stringify({
              messageTypes: messageTypes.wrong_email_reported,
              phoneNumber: user.phoneNumber,
              message:
                "The email address you provided was reported as incorrect by the recipient. Please check for typos and try again.",
            }),
          });
        } catch (wsError) {
          logger.warn(
            "Failed to send WebSocket notification for misdirected email",
            {
              userUniqueId,
              error: wsError.message,
            },
          );
        }
      }
    }
  }

  return {
    status: "success",
    message: "Report processed successfully. The link has been revoked.",
  };
};

/**
 * Generates a short-lived JWT for phone verification.
 *
 * JUNIOR NOTE: Using a JWT for verification links is safe because it's
 * cryptographically signed and self-contained (no extra DB columns needed).
 *
 * @param {string} userUniqueId
 * @param {string} phoneNumber
 * @returns {string} Signed JWT.
 */
const generatePhoneVerificationToken = (userUniqueId, phoneNumber) => {
  return jwt.sign(
    {
      userUniqueId,
      phoneNumber,
      purpose: "phone_verification",
    },
    Config.SECRET_KEY,
    { expiresIn: "15m" },
  );
};

/**
 * Verifies a user's phone number using a JWT token.
 *
 * JUNIOR NOTE: This function decodes the token, checks the user identity,
 * and marks them as verified. Unlike email verification, we don't send
 * a new login token here because the user was forced to logout for security.
 *
 * @param {string} token - The signed JWT from the SMS link.
 */
const verifyPhoneByToken = async (token) => {
  if (!token) {
    throw new AppError("Verification token is required", 400);
  }

  try {
    const decoded = jwt.verify(token, Config.SECRET_KEY);
    if (decoded.purpose !== "phone_verification") {
      throw new AppError("Invalid token purpose", 400);
    }

    const { userUniqueId, phoneNumber } = decoded;

    // 1. Mark as verified in the main Users table
    await updateData({
      tableName: "Users",
      updateValues: { isPhoneVerified: true },
      conditions: { userUniqueId },
    });

    // 2. Clear out any old OTPs for this user
    await updateData({
      tableName: "usersCredential",
      updateValues: {
        phoneVerificationOTP: null,
      },
      conditions: { userUniqueId },
    });

    // 3. Get Full User Data for JWT (Industry UX - Auto Login)
    // JUNIOR NOTE: To log the user in automatically after verification, we need
    // to fetch their role and identity to generate a fresh security token (JWT).
    const userDataRows = await performJoinSelect({
      tableName: "Users",
      joinConditions: [
        {
          tableName: "UserRole",
          on: "Users.userUniqueId = UserRole.userUniqueId",
        },
      ],
      conditions: { "Users.userUniqueId": userUniqueId },
    });

    if (!userDataRows || userDataRows.length === 0) {
      throw new AppError("User not found after verification", 404);
    }

    const userData = userDataRows[0];
    const { token: loginToken } = createJWT(userData);

    return {
      message: "success",
      data: {
        phoneNumber,
        isPhoneVerified: true,
        user: userData,
      },
      token: loginToken,
    };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new AppError(
        "Verification link has expired. Please try again.",
        400,
      );
    }
    throw new AppError("Invalid verification link.", 400);
  }
};

module.exports = {
  loginUser,
  verifyUserByOTP,
  handleExistingUser,
  verifyEmailByToken,
  reportMisdirectedEmail,
  generatePhoneVerificationToken,
  verifyPhoneByToken,
};
