"use strict";

const Config = require("../../Utils/Config");
const jwt = require("jsonwebtoken");
const generateOTP = require("../../Utils/GenerateOTP");
const createJWT = require("../../Utils/CreateJWT");
const {
  currentDate,
  addHours
} = require("../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const verifyPassword = require("../../Utils/VerifyPassword");
const logger = require("../../Utils/logger");
const {
  usersRoles
} = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const {
  sendSocketIONotificationToAdmin
} = require("../../Utils/Notifications");
const {
  getData,
  performJoinSelect
} = require("../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../CRUD/Update/Data.update");
const {
  insertData
} = require("../../CRUD/Create/CreateData");
const {
  v4: uuidv4
} = require("uuid");
const {
  getSocket
} = require("../../Utils/WsConnectionStore");
const {
  emitMessage
} = require("../../Utils/WsServerResponder");
const messageTypes = require("../../Utils/MessageTypes");
const {
  driversDocumentVehicleRequirement
} = require("../RoleDocumentRequirements");

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
const verifyEmailByToken = async token => {
  if (!token) {
    throw new AppError("Invalid or missing token", 400);
  }
  const [credential] = await getData({
    tableName: "usersCredential",
    conditions: {
      emailVerificationToken: token
    }
  });
  if (!credential) {
    throw new AppError("Verification link is invalid or has expired.", 400);
  }
  // Use the EAT string from currentDate() and parse it as a local date (without "Z")
  // to ensure it is on the same scale as the database values.
  const now = new Date(currentDate().replace(" ", "T"));
  const expiry = typeof credential.emailVerificationExpiresAt === "string" ? new Date(credential.emailVerificationExpiresAt.replace(" ", "T")) : new Date(credential.emailVerificationExpiresAt);
  if (now > expiry) {
    throw new AppError("Verification link has expired. Please log in again to receive a new one.", 400);
  }
  const userUniqueId = credential.userUniqueId;

  // Mark as verified in the main Users table
  await updateData({
    tableName: "Users",
    updateValues: {
      isEmailVerified: true
    },
    conditions: {
      userUniqueId
    }
  });

  // Fetch the user to get their email and phone verification status
  const [userRow] = await getData({
    tableName: "Users",
    conditions: {
      userUniqueId
    }
  });
  const isPhoneVerified = !!userRow?.isPhoneVerified;
  const credentialUpdateValues = {
    emailVerificationToken: null,
    emailVerificationExpiresAt: null
  };
  await updateData({
    tableName: "usersCredential",
    updateValues: credentialUpdateValues,
    conditions: {
      userUniqueId
    }
  });

  // BROADCAST: Send updated token via WebSocket to any active connections
  // JUNIOR NOTE: This is the "Magic" part. We find out if the user is currently
  // online (using their phone number). If they are, we calculate a new security
  // token (JWT) and send it over the websocket. The app receives this and
  // automatically unlocks verified features.
  try {
    const userRoles = await getData({
      tableName: "UserRole",
      conditions: {
        userUniqueId
      }
    });
    if (userRow.phoneNumber && userRoles.length > 0) {
      const cleanedPhone = userRow.phoneNumber.replace(/\//g, "").replace(/\+/g, "");
      for (const ur of userRoles) {
        const roleId = Number(ur.roleId);
        let userType = "shipper";
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
            isEmailVerified: true
          });
          emitMessage({
            socketId,
            eventName: "messages",
            messageDetails: JSON.stringify({
              messageTypes: messageTypes.email_verified_token_update,
              token: tokenData.token,
              userType
            })
          });
        }
      }
    }
  } catch (wsError) {
    logger.warn("Failed to broadcast updated token after email verification", {
      userUniqueId,
      error: wsError.message
    });
  }

  //let users get the status immediately as they are verified
  return {
    message: "success",
    data: {
      phoneVerified: isPhoneVerified,
      emailVerified: true
    }
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

/**
 * Handles reporting of misdirected verification emails.
 *
 * JUNIOR NOTE: This is a "Disavowal" flow. If someone receives an email they didn't
 * request, we let them revoke the link. This prevents malicious sign-ups and
 * notifies the original requester (via WebSocket) that their email was rejected.
 *
 * @param {string} token - The token to revoke.
 */
const reportMisdirectedEmail = async token => {
  if (!token) {
    throw new AppError("Token is required.", 400);
  }

  // Find the credential by token
  const [credential] = await getData({
    tableName: "usersCredential",
    conditions: {
      emailVerificationToken: token
    }
  });
  if (!credential) {
    throw new AppError("This report link has already been processed or is invalid.", 400);
  }
  const {
    userUniqueId
  } = credential;

  // 1. Immediately revoke the token to stop further attempts
  await updateData({
    tableName: "usersCredential",
    updateValues: {
      emailVerificationToken: null,
      emailVerificationExpiresAt: null
    },
    conditions: {
      userUniqueId
    }
  });

  // 2. Notify the originator via WebSocket if they are online
  const [user] = await getData({
    tableName: "users",
    conditions: {
      userUniqueId
    }
  });
  if (user && user.phoneNumber) {
    const cleanedPhone = user.phoneNumber.replace(/\+/g, "");
    const roles = ["shipper", "driver", "admin"];
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
              message: "The email address you provided was reported as incorrect by the recipient. Please check for typos and try again."
            })
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
    message: "Report processed successfully. The link has been revoked."
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

module.exports = {
  verifyEmailByToken,
  reportMisdirectedEmail
};
