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
  return jwt.sign({
    userUniqueId,
    phoneNumber,
    purpose: "phone_verification"
  }, Config.SECRET_KEY, {
    expiresIn: "15m"
  });
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

/**
 * Verifies a user's phone number using a JWT token.
 *
 * JUNIOR NOTE: This function decodes the token, checks the user identity,
 * and marks them as verified. Unlike email verification, we don't send
 * a new login token here because the user was forced to logout for security.
 *
 * @param {string} token - The signed JWT from the SMS link.
 */
const verifyPhoneByToken = async token => {
  if (!token) {
    throw new AppError("Verification token is required", 400);
  }
  try {
    const decoded = jwt.verify(token, Config.SECRET_KEY);
    if (decoded.purpose !== "phone_verification") {
      throw new AppError("Invalid token purpose", 400);
    }
    const {
      userUniqueId,
      phoneNumber
    } = decoded;

    // 1. Mark as verified in the main Users table
    await updateData({
      tableName: "Users",
      updateValues: {
        isPhoneVerified: true
      },
      conditions: {
        userUniqueId
      }
    });

    // 2. Clear out any old OTPs for this user
    await updateData({
      tableName: "usersCredential",
      updateValues: {
        phoneVerificationOTP: null
      },
      conditions: {
        userUniqueId
      }
    });

    // 3. Get Full User Data for JWT (Industry UX - Auto Login)
    // JUNIOR NOTE: To log the user in automatically after verification, we need
    // to fetch their role and identity to generate a fresh security token (JWT).
    const userDataRows = await performJoinSelect({
      tableName: "Users",
      joinConditions: [{
        tableName: "UserRole",
        on: "Users.userUniqueId = UserRole.userUniqueId"
      }],
      conditions: {
        "Users.userUniqueId": userUniqueId
      }
    });
    if (!userDataRows || userDataRows.length === 0) {
      throw new AppError("User not found after verification", 404);
    }
    const userData = userDataRows[0];
    const {
      token: loginToken
    } = createJWT(userData);
    return {
      message: "success",
      data: {
        phoneNumber,
        isPhoneVerified: true,
        user: userData
      },
      token: loginToken
    };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Verification link has expired. Please try again.", 400);
    }
    throw new AppError("Invalid verification link.", 400);
  }
};

module.exports = {
  generatePhoneVerificationToken,
  verifyPhoneByToken
};
