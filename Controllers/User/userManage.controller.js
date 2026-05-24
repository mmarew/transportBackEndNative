"use strict";

const path = require("path");
const Config = require("../../Utils/Config");
// import uuidv4
// import uuidv4
const {
  v4: uuidv4
} = require("uuid");
const {
  updateAttachedDocument,
  createAttachedDocument
} = require("../../Services/AttachedDocuments.service");
const services = require("../../Services/User.service");
const {
  uploadToFTP,
  deleteFromFTP
} = require("../../Utils/FTPHandler");
const ServerResponder = require("../../Utils/ServerResponder");
const {
  usersRoles
} = require("../../Utils/ListOfSeedData");
const {
  getOtpMessage,
  getPhoneVerificationLinkMessage,
  
  getEmailVerificationLinkMessage,
  getAdminAssignmentMessage,
  
} = require("../../Utils/MessageTemplates");
const AppError = require("../../Utils/AppError");
const {
  executeInTransaction
} = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");
const {
  getData
} = require("../../CRUD/Read/ReadData");
const {
  getSocket
} = require("../../Utils/WsConnectionStore");
const {
  emitMessage
} = require("../../Utils/WsServerResponder");
const messageTypes = require("../../Utils/MessageTypes");
//in create user fullname must be existe for driver roles.


//in create user fullname must be existe for driver roles.
const createUser = async (req, res, next) => {
  try {
    const response = await executeInTransaction(async () => {
      // return req?.body
      return await services.createUser({
        ...req?.body,
        requestedFrom: "user"
      });
    });
    // Handle deferred SMS and Email after transaction commit
    if (response?.deferredOTP) {
      const {
        sendSms
      } = require("../../Utils/smsSender");
      const {
        sendEmail
      } = require("../../Utils/emailSender");
      const {
        phoneNumber,
        email,
        isEmailVerified
      } = response.data || {};
      const {
        phoneVerificationOTP,
        emailVerificationOTP,
        emailVerificationToken
      } = response.deferredOTP;
      // 1. Send SMS (Always OTP)
      if (phoneNumber && phoneVerificationOTP) {
        const phoneMsg = getOtpMessage(phoneVerificationOTP, "registration");
        sendSms(phoneNumber, null, phoneMsg.sms).catch(err => {
          const logger = require("../../Utils/logger");
          logger.warn("Deferred SMS sending failed", {
            phoneNumber,
            error: err.message
          });
        });
      }

      // 2. Send Email (OTP or Link)
      if (email) {
        if (isEmailVerified && emailVerificationOTP) {
          const emailMsg = getOtpMessage(emailVerificationOTP, "registration");
          sendEmail(email, emailMsg.emailSubject, emailMsg.sms, emailMsg.emailHtml).catch(err => {
            const logger = require("../../Utils/logger");
            logger.warn("Deferred Email OTP sending failed", {
              email,
              error: err.message
            });
          });
        } else if (emailVerificationToken) {
          const baseUrl = Config.APP_API_URL;
          const link = `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`;
          const linkMsg = getEmailVerificationLinkMessage(link);
          logger.debug("Sending Deferred Email Verification Link", {
            to: email,
            subject: linkMsg.emailSubject
          });
          sendEmail(email, linkMsg.emailSubject, "Verify your email", linkMsg.emailHtml).catch(err => {
            const logger = require("../../Utils/logger");
            logger.warn("Deferred Email Link sending failed", {
              email,
              error: err.message
            });
          });
        }
      }

      // Don't send the raw OTP or tokens back to the client
      delete response.deferredOTP;
    }
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = req.user;
    const deletedBy = user?.userUniqueId;
    const roleId = user.roleId;
    let userUniqueId = req.params?.userUniqueId;
    if (userUniqueId === "self") {
      userUniqueId = deletedBy;
    }

    // User must be admin, super admin, or deleting their own account
    const isAdminOrSuperAdmin = roleId === usersRoles.adminRoleId || roleId === usersRoles.supperAdminRoleId;
    if (!isAdminOrSuperAdmin && deletedBy !== userUniqueId) {
      throw new AppError("you can't delete this user", 403);
    }
    const retainFiles = req.query?.retainFiles !== "false" && req.query?.retainFiles !== false;
    const response = await executeInTransaction(async () => {
      return await services.deleteUser({
        userUniqueId,
        deletedBy,
        retainFiles
      });
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueIdFromToken = user?.userUniqueId;
    const roleIdFromToken = user?.roleId;
    // self means the user is updating himself,so userUniqueId is the same as ownerUserUniqueId
    let ownerUserUniqueId = req?.params?.ownerUserUniqueId;
    let targetRoleId = req.body.roleId;
    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = userUniqueIdFromToken;
      targetRoleId = user.roleId;
    }

    // Determine the target roleId (used for both JWT and AttachedDocuments)

    const body = {
      roleIdFromToken,
      userUniqueIdFromToken,
      ...req.body,
      userUniqueId: ownerUserUniqueId,
      roleId: targetRoleId
    };

    // Handle file upload outside the transaction to prevent holding DB connections during network I/O
    let fileMetadata = null;
    if (req.files && req.files.length > 0) {
      const {
        profilePhotoTypeId = 4,
        ProfilePhotoDescription = "Profile Photo",
        ProfilePhotoExpirationDate
      } = body;
      const file = req.files[0];
      const fileExtension = path.extname(file.originalname);
      // Use userId from token for naming
      const uniqueFilename = `${user.userId}_${uuidv4()}${fileExtension}`;
      try {
        const fileUrl = await uploadToFTP(file.buffer, uniqueFilename);
        fileMetadata = {
          fileUrl,
          profilePhotoTypeId,
          ProfilePhotoDescription,
          ProfilePhotoExpirationDate
        };
      } catch (err) {
        throw new AppError(`Failed to upload profile image to server: ${err.message}`, 500);
      }
    }
    let oldFileUrl = null;
    const response = await executeInTransaction(async () => {
      // 1. Update user text information
      const textResponse = await services.updateUser(body);

      // 2. Handle file record updates (Inside Transaction)
      if (fileMetadata) {
        const {
          fileUrl,
          profilePhotoTypeId,
          ProfilePhotoDescription,
          ProfilePhotoExpirationDate
        } = fileMetadata;

        // Get attached document to see if it exists
        const existingDocs = await getData({
          tableName: "AttachedDocuments",
          conditions: {
            userUniqueId: ownerUserUniqueId,
            documentTypeId: profilePhotoTypeId
          }
        });
        const attachedDocumentUniqueId = existingDocs?.[0]?.attachedDocumentUniqueId;
        if (!attachedDocumentUniqueId) {
          await createAttachedDocument({
            attachedDocumentDescription: ProfilePhotoDescription,
            attachedDocumentName: fileUrl,
            documentTypeId: profilePhotoTypeId,
            documentExpirationDate: ProfilePhotoExpirationDate,
            roleId: targetRoleId,
            userUniqueId: ownerUserUniqueId
          });
        } else {
          // Store the old file URL for cleanup after successful transaction
          oldFileUrl = existingDocs[0].attachedDocumentName;
          await updateAttachedDocument({
            attachedDocumentUniqueId,
            roleId: targetRoleId,
            attachedDocumentName: fileUrl,
            attachedDocumentDescription: ProfilePhotoDescription,
            documentExpirationDate: ProfilePhotoExpirationDate
          });
        }
      }
      return textResponse;
    });

    // Cleanup: Delete the old file from disk after successful update
    if (oldFileUrl) {
      deleteFromFTP(oldFileUrl).catch(err => {
        logger.warn("Failed to delete stale profile image", {
          oldFileUrl,
          error: err.message
        });
      });
    }
    // Handle deferred SMS and Email after transaction commit
    if (response?.deferredOTP) {
      const {
        sendSms
      } = require("../../Utils/smsSender");
      const {
        sendEmail
      } = require("../../Utils/emailSender");
      const {
        phoneVerificationOTP,
        emailVerificationOTP,
        emailVerificationToken,
        forceLogout
      } = response.deferredOTP;

      // 1. Send SMS (OTP or Link)
      if (phoneVerificationOTP) {
        const targetPhone = body.phoneNumber || user.phoneNumber;
        if (targetPhone) {
          if (forceLogout) {
            // JUNIOR NOTE: If forceLogout is true, we send a link instead of a raw code.
            // We also send a WebSocket "Logout" message to the OLD number to kill any active apps.
            const verificationToken = services.generatePhoneVerificationToken(user.userUniqueId, targetPhone);
            // JUNIOR NOTE: We use a custom protocol (dynamics://) so the mobile OS
            // opens the app directly instead of the system browser.
            const link = `dynamics://verify?token=${verificationToken}`;
            const linkMsg = getPhoneVerificationLinkMessage(link, phoneVerificationOTP, "update");
            sendSms(targetPhone, linkMsg.sms).catch(err => {
              logger.warn("Phone Verification Link SMS failed on update", {
                phoneNumber: targetPhone,
                error: err.message
              });
            });

            // WebSocket Session Revocation
            const oldPhone = user.phoneNumber;
            const roleId = Number(req.user.roleId);
            let userType = "shipper";
            if (roleId === usersRoles.driverRoleId) {
              userType = "driver";
            } else if (roleId === usersRoles.adminRoleId) {
              userType = "admin";
            } else if (roleId === usersRoles.supperAdminRoleId) {
              userType = "admin";
            }
            const socketId = await getSocket(userType, oldPhone.replace(/\+/g, ""));
            if (socketId) {
              emitMessage({
                socketId,
                eventName: "messages",
                messageDetails: JSON.stringify({
                  messageTypes: messageTypes.force_logout_phone_change
                })
              });
            }

            // Security: Kill the current session response token
            delete response.token;
            response.data = "Phone number updated. For security, your session has been revoked. Please check your NEW number for a verification link and log in again.";
          } else {
            // Standard OTP Flow (for registration or non-critical changes)
            const phoneMsg = getOtpMessage(phoneVerificationOTP, "update");
            sendSms(targetPhone, phoneMsg.sms).catch(err => {
              logger.warn("Deferred SMS sending failed on update", {
                phoneNumber: targetPhone,
                error: err.message
              });
            });
          }
        }
      }

      // 2. Send Email (OTP or Link)
      if (emailVerificationOTP || emailVerificationToken) {
        const targetEmail = body.email || user.email;
        if (targetEmail) {
          if (emailVerificationOTP) {
            const emailMsg = getOtpMessage(emailVerificationOTP, "update");
            sendEmail(targetEmail, emailMsg.emailSubject, emailMsg.sms, emailMsg.emailHtml).catch(err => {
              logger.warn("Deferred Email OTP sending failed on update", {
                email: targetEmail,
                error: err.message
              });
            });
          } else if (emailVerificationToken) {
            const link = `${Config.APP_API_URL}/api/user/verify-email?token=${emailVerificationToken}`;
            const linkMsg = getEmailVerificationLinkMessage(link, "update");
            sendEmail(targetEmail, linkMsg.emailSubject, "Verify your email", linkMsg.emailHtml).catch(err => {
              logger.warn("Deferred Email Link sending failed on update", {
                email: targetEmail,
                error: err.message
              });
            });
          }
        }
      }

      // Don't send the raw OTP or tokens back to the client
      delete response.deferredOTP;
    }

    // FINAL SECURITY CHECK: If the phone is NOT verified, we must NOT return a fresh session token.
    // This ensures that "forceLogout" on phone change persists until verification is complete.
    const isUnverified = response.data?.isPhoneVerified === false || response.data?.isPhoneVerified === 0 || response.data?.isPhoneVerified === "0";
    if (response.token && isUnverified) {
      delete response.token;
      response.data = "Update successful. However, your phone is NOT verified. For security, your session remains revoked. Please verify your phone to receive a new session token.";
    } else {
      // If verified or no token was generated, we can return the standard success message if data is still the user object
      if (typeof response.data === "object") {
        response.data = "User updated successfully";
      }
    }
    return ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const createUserByAdminOrSuperAdmin = async (req, res, next) => {
  try {
    const response = await executeInTransaction(async () => {
      return await services.createUserByAdminOrSuperAdmin({
        body: req.body,
        userUniqueId: req?.user?.userUniqueId
      });
    });

    // Handle deferred SMS and Email after admin creation
    if (response?.deferredOTP) {
      const {
        sendSms
      } = require("../../Utils/smsSender");
      const {
        sendEmail
      } = require("../../Utils/emailSender");
      const {
        phoneNumber,
        email,
        isEmailVerified
      } = response.data || {};
      const {
        roleId
      } = req.body;
      const {
        phoneVerificationOTP,
        emailVerificationToken
      } = response.deferredOTP;

      // 1. Send SMS (Admin Assignment Message)
      if (phoneNumber && phoneVerificationOTP) {
        const roleNameMap = {
          [usersRoles.shipperRoleId]: "Shipper",
          [usersRoles.driverRoleId]: "Driver",
          [usersRoles.adminRoleId]: "Admin",
          [usersRoles.vehicleOwnerRoleId]: "Vehicle Owner",
          [usersRoles.systemRoleId]: "System",
          [usersRoles.supperAdminRoleId]: "Supper Admin"
        };
        const roleName = roleNameMap[roleId] || "Admin";
        const assignmentMsg = getAdminAssignmentMessage(phoneVerificationOTP, roleName);
        sendSms(phoneNumber, null, assignmentMsg.sms).catch(err => {
          logger.warn("Deferred Admin-Created SMS failed", {
            phoneNumber,
            error: err.message
          });
        });
      }

      // 2. Send Email (Admin Assignment or Link)
      if (email) {
        if (isEmailVerified) {
          const roleNameMap = {
            [usersRoles.shipperRoleId]: "Shipper",
            [usersRoles.driverRoleId]: "Driver",
            [usersRoles.adminRoleId]: "Admin",
            [usersRoles.vehicleOwnerRoleId]: "Vehicle Owner",
            [usersRoles.systemRoleId]: "System",
            [usersRoles.supperAdminRoleId]: "Supper Admin"
          };
          const roleName = roleNameMap[roleId] || "Admin";
          const assignmentMsg = getAdminAssignmentMessage(phoneVerificationOTP, roleName);
          sendEmail(email, assignmentMsg.emailSubject, assignmentMsg.sms, assignmentMsg.emailHtml).catch(err => {
            logger.warn("Deferred Admin-Created Email OTP failed", {
              email,
              error: err.message
            });
          });
        } else if (emailVerificationToken) {
          const baseUrl = Config.APP_API_URL;
          const link = `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`;
          const linkMsg = getEmailVerificationLinkMessage(link);
          sendEmail(email, linkMsg.emailSubject, "Verify your email", linkMsg.emailHtml).catch(err => {
            logger.warn("Deferred Admin-Created Email Link failed", {
              email,
              error: err.message
            });
          });
        }
      }

      // Don't send the raw OTP or tokens back to the client
      delete response.deferredOTP;
    }
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

/**
 * Handles the GET request for email verification via a unique token link.
 *
 * JUNIOR NOTE: This is the endpoint called when a user clicks the button in their email.
 * It doesn't use JSON for responses because it's meant to be viewed in a web browser.
 */

module.exports = {
  createUser,
  deleteUser,
  updateUser,
  createUserByAdminOrSuperAdmin
};
