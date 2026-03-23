"use strict";

const { sendSms } = require("../../Utils/smsSender");
const { sendEmail } = require("../../Utils/emailSender");
const {
  getOtpMessage,
  getEmailVerificationLinkMessage,
  getAdminAssignmentMessage,
} = require("../../Utils/MessageTemplates");
const generateOTP = require("../../Utils/GenerateOTP");
const createJWT = require("../../Utils/CreateJWT");
const { currentDate } = require("../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const verifyPassword = require("../../Utils/VerifyPassword");
const logger = require("../../Utils/logger");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
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
const { createUserSubscription } = require("../UserSubscription.service");
const { getPricingWithFilters } = require("../SubscriptionPlanPricing.service");
const {
  getPlaceholderEmail,
  isPlaceholderEmail,
} = require("../../Utils/GetPlaceholderEmail");

let manageService;
let registryService;

const handleExistingUser = async ({
  requestedFrom,
  user,
  phoneNumber,
  fullName,
  email,
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

  // 1. Update fullName if it's a new or missing name
  if ((!user.fullName || user.fullName !== fullName) && fullName) {
    await updateData({
      tableName: "Users",
      updateValues: { fullName },
      conditions: { userUniqueId },
    });
    user.fullName = fullName;
  }

  /**
   * IDENTITY UPDATE STRATEGY:
   * We only update the user's email if the current record is missing
   * OR if it's a system-level placeholder (@dynamics.com).
   * This allows "upgrading" a phone-only account to a full account
   * when the user finally joins the app and provides a real email.
   */
  // 2. Update email if it's currently missing OR it's a placeholder
  const isEmailMissing = !user.email || isPlaceholderEmail(user.email);
  const placeholderEmail = getPlaceholderEmail(user.phoneNumber);
  if (
    isEmailMissing &&
    email &&
    email !== placeholderEmail &&
    !isPlaceholderEmail(email)
  ) {
    await updateData({
      tableName: "Users",
      updateValues: { email },
      conditions: { userUniqueId },
    });
    user.email = email;
  }

  // 3. Update phoneNumber if it's currently missing
  const isPhoneMissing = !user.phoneNumber;
  if (isPhoneMissing && phoneNumber) {
    await updateData({
      tableName: "Users",
      updateValues: { phoneNumber },
      conditions: { userUniqueId },
    });
    user.phoneNumber = phoneNumber;
  }

  // 3. Separate Identity Verification (OTP or Link Generation)
  const isPhoneVerified = !!user.isPhoneVerified;
  const isEmailVerified = !!user.isEmailVerified;

  const [savedCredentialRows] = await Promise.all([
    getData({ tableName: "usersCredential", conditions: { userUniqueId } }),
    registryService.handleUserRoleStatus(
      userUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription,
    ),
  ]);
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
    const isExpired =
      emailVerificationExpiresAt &&
      new Date(emailVerificationExpiresAt) < new Date();
    if (!emailVerificationToken || isExpired) {
      emailVerificationToken = uuidv4();
      emailVerificationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    }
  }

  const hashedOTP = await bcrypt.hash(String(OTP), 10);
  const hashedPhoneVerificationOTP = isPhoneVerified
    ? hashedOTP
    : await bcrypt.hash(String(phoneVerificationOTP), 10);
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

  if (requestedFrom === "street") {
    return { message: "success", data: { ...user } };
  }

  let otpDetail = "";
  let deferredOTP = null;

  if (transactionStorage.getStore()) {
    otpDetail = "Verification data generated (Sent deferred)";
    deferredOTP = {
      phoneVerificationOTP,
      emailVerificationOTP,
      emailVerificationToken,
    };
  } else {
    try {
      // 1. Determine message type (Standard OTP vs Admin Assignment)
      const isAdminAssignment = requestedFrom === "Supper Admin/Admin";

      let phoneMsg, emailMsg;

      if (isAdminAssignment) {
        const roleNameMap = {
          [usersRoles.passengerRoleId]: "Passenger",
          [usersRoles.driverRoleId]: "Driver",
          [usersRoles.adminRoleId]: "Admin",
          [usersRoles.vehicleOwnerRoleId]: "Vehicle Owner",
          [usersRoles.systemRoleId]: "System",
          [usersRoles.supperAdminRoleId]: "Supper Admin",
        };
        const roleName = roleNameMap[roleId] || "Admin";

        const assignmentMsg = getAdminAssignmentMessage(
          phoneVerificationOTP,
          roleName,
        );
        phoneMsg = assignmentMsg;
        emailMsg = assignmentMsg;
      } else {
        phoneMsg = getOtpMessage(
          phoneVerificationOTP,
          requestedFrom === "user" ? "login" : "registration",
        );
      }

      // 2. Send SMS
      try {
        await sendSms(user.phoneNumber, phoneMsg.sms);
        otpDetail = "OTP sent to phone";
      } catch (smsError) {
        logger.warn("SMS sending failed inline", { error: smsError.message });
        otpDetail = `SMS failed (${smsError.message})`;
      }

      // 3. Send Email (OTP, Assignment, or Link)
      if (user.email) {
        try {
          if (isEmailVerified || isAdminAssignment) {
            // Send either Assignment or Unified OTP
            if (!isAdminAssignment) {
              emailMsg = getOtpMessage(
                emailVerificationOTP,
                requestedFrom === "user" ? "login" : "registration",
              );
            }
            await sendEmail(
              user.email,
              emailMsg.emailSubject,
              emailMsg.sms,
              emailMsg.emailHtml,
            );
            otpDetail += isAdminAssignment
              ? " and Admin assignment notification sent to email"
              : " and Unified OTP sent to email";
          } else {
            // Send Verification Link
            const baseUrl =
              process.env.APP_API_URL || "https://dynamicsroute.tech";
            const link = `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`;
            const linkMsg = getEmailVerificationLinkMessage(link);
            logger.debug("Sending Email Verification Link", {
              to: user.email,
              subject: linkMsg.emailSubject,
            });
            await sendEmail(
              user.email,
              linkMsg.emailSubject,
              "Verify your email",
              linkMsg.emailHtml,
            );
            otpDetail += ", Verification Link sent to email";
          }
        } catch (emailError) {
          logger.warn("Email sending failed inline", {
            error: emailError.message,
          });
          otpDetail += `, Email failed (${emailError.message})`;
        }
      } else {
        otpDetail += " (No email provided)";
      }
    } catch (error) {
      logger.warn("Verification setup failed", { error: error.message });
      otpDetail = `Failed to process verification: ${error.message}`;
    }
  }

  // Driver gift logic
  try {
    if (Number(roleId) === usersRoles.driverRoleId) {
      const plansRes = await getPricingWithFilters();
      const freePlan = (plansRes?.data || []).find(
        (p) => p?.isFree === true || p?.isFree === 1,
      );
      if (freePlan?.subscriptionPlanPricingUniqueId) {
        await createUserSubscription({
          driverUniqueId: userUniqueId,
          subscriptionPlanPricingUniqueId:
            freePlan.subscriptionPlanPricingUniqueId,
          userSubscriptionCreatedBy: userUniqueId,
        });
      }
    }
  } catch (e) {
    logger.warn("Error creating free gift during sign-up for existing user", {
      error: e.message,
    });
  }

  return {
    message: "success",
    data: user,
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

  const identity = (phoneNumber || email).trim();
  const userDataResult = await manageService.getUserByFilterDetailed({
    search: identity,
    includeDeleted: true,
  });

  if (!userDataResult?.data?.[0]?.user) {
    throw new AppError(
      "User not found at this phone/email address. Please sign up first.",
      404,
    );
  }

  const userEntry = userDataResult.data[0];
  const userData = userEntry.user;
  if (userData?.isDeleted || userData?.userDeletedAt) {
    throw new AppError("Account has been deleted", 403);
  }

  const roleEntry = userEntry.rolesAndStatuses?.find(
    (rs) => rs?.userRoles?.roleId === roleId,
  );
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
    statusId: roleEntry.userRoleStatuses?.statusId,
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
    verificationStatus: {
      phoneVerified: phoneMatched || !!userRow.isPhoneVerified,
      emailVerified: emailMatched || !!userRow.isEmailVerified,
    },
  };

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
  const expiry = typeof credential.emailVerificationExpiresAt === 'string'
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

  const email = userRow?.email;
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
      const cleanedPhone = userRow.phoneNumber.replace(/\//g, "").replace(/\+/g, "");
      
      for (const ur of userRoles) {
        const roleId = Number(ur.roleId);
        let userType = "passenger";
        if (roleId === usersRoles.driverRoleId) userType = "driver";
        else if (roleId === usersRoles.adminRoleId) userType = "admin";
        else if (roleId === usersRoles.supperAdminRoleId) userType = "admin";

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
    throw new AppError("This report link has already been processed or is invalid.", 400);
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
              message: "The email address you provided was reported as incorrect by the recipient. Please check for typos and try again.",
            }),
          });
        } catch (wsError) {
          logger.warn("Failed to send WebSocket notification for misdirected email", {
            userUniqueId,
            error: wsError.message
          });
        }
      }
    }
  }

  return {
    status: "success",
    message: "Report processed successfully. The link has been revoked.",
  };
};

module.exports = {
  loginUser,
  verifyUserByOTP,
  handleExistingUser,
  verifyEmailByToken,
  reportMisdirectedEmail,
};
