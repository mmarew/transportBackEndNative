const path = require("path");
// import uuidv4
const { v4: uuidv4 } = require("uuid");
const {
  updateAttachedDocument,
  createAttachedDocument,
} = require("../Services/AttachedDocuments.service");
const services = require("../Services/User.service");
const { uploadToFTP } = require("../Utils/FTPHandler");
const ServerResponder = require("../Utils/ServerResponder");
const { usersRoles } = require("../Utils/ListOfSeedData");
const {
  getOtpMessage,
  getEmailVerificationLinkMessage,
  getSuccessEmailVerificationHtml,
} = require("../Utils/MessageTemplates");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const logger = require("../Utils/logger");
//in create user fullname must be existe for driver roles.
const createUser = async (req, res, next) => {
  try {
    const response = await executeInTransaction(async () => {
      // return req?.body
      return await services.createUser(req?.body);
    });
    // Handle deferred SMS and Email after transaction commit
    if (response?.deferredOTP) {
      const { sendSms } = require("../Utils/smsSender");
      const { sendEmail } = require("../Utils/emailSender");
      const { phoneNumber, email, isEmailVerified } = response.data || {};
      const {
        phoneVerificationOTP,
        emailVerificationOTP,
        emailVerificationToken,
      } = response.deferredOTP;

      // 1. Send SMS (Always OTP)
      if (phoneNumber && phoneVerificationOTP) {
        const phoneMsg = getOtpMessage(phoneVerificationOTP, "registration");
        sendSms(phoneNumber, null, phoneMsg.sms).catch((err) => {
          const logger = require("../Utils/logger");
          logger.warn("Deferred SMS sending failed", {
            phoneNumber,
            error: err.message,
          });
        });
      }

      // 2. Send Email (OTP or Link)
      if (email) {
        if (isEmailVerified && emailVerificationOTP) {
          const emailMsg = getOtpMessage(emailVerificationOTP, "registration");
          sendEmail(
            email,
            emailMsg.emailSubject,
            emailMsg.sms,
            emailMsg.emailHtml,
          ).catch((err) => {
            const logger = require("../Utils/logger");
            logger.warn("Deferred Email OTP sending failed", {
              email,
              error: err.message,
            });
          });
        } else if (emailVerificationToken) {
          const baseUrl =
            process.env.APP_API_URL ||
            "https://transport-back-end-native.vercel.app";
          const link = `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`;
          const linkMsg = getEmailVerificationLinkMessage(link);
          logger.debug("Sending Deferred Email Verification Link", {
            to: email,
            subject: linkMsg.emailSubject,
          });
          sendEmail(
            email,
            linkMsg.emailSubject,
            "Verify your email",
            linkMsg.emailHtml,
          ).catch((err) => {
            const logger = require("../Utils/logger");
            logger.warn("Deferred Email Link sending failed", {
              email,
              error: err.message,
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

const loginUser = async (req, res, next) => {
  try {
    const payload =
      req.body && Object.keys(req.body).length ? req.body : req.query;

    const response = await services?.loginUser(
      payload?.phoneNumber,
      payload?.roleId !== null ? Number(payload.roleId) : payload?.roleId,
      payload?.email,
    );
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

/**
 * Handles the HTTP request for OTP verification.
 * Extracts the request payload and offloads the complex validation logic to the Auth Service.
 * Wraps the operation in a database transaction to ensure atomicity when updating verification
 * flags (isPhoneVerified, isEmailVerified) upon successful OTP match.
 *
 * @param {import('express').Request} req - Express request object containing phoneNumber, email, OTP, and roleId.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function for error handling.
 * @returns {Promise<void>} Responds with a JWT token and updated account verification status upon success.
 */
const verifyUserByOTP = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await services.verifyUserByOTP(req);
    });
    ServerResponder(res, result);
  } catch (error) {
    logger.error("Error in verifyUserByOTP", error);
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
    const isAdminOrSuperAdmin =
      roleId === usersRoles.adminRoleId ||
      roleId === usersRoles.supperAdminRoleId;
    if (!isAdminOrSuperAdmin && deletedBy !== userUniqueId) {
      throw new AppError("you can't delete this user", 403);
    }

    const retainFiles =
      req.query?.retainFiles !== "false" && req.query?.retainFiles !== false;
    const response = await executeInTransaction(async () => {
      return await services.deleteUser({
        userUniqueId,
        deletedBy,
        retainFiles,
      });
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const getUserByFilterDetailed = async (req, res, next) => {
  try {
    const userUniqueId = req?.query?.userUniqueId;
    if (userUniqueId === "self") {
      req.query.userUniqueId = req?.user?.userUniqueId;
    }

    // Accept filters via query string, and optional pagination
    const filters = req.query || {};
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    // include role/status information by default (do not expect includeRoles from client)
    const response = await services.getUserByFilterDetailed(
      filters,
      page,
      limit,
    );
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    // self means the user is updating himself,so userUniqueId is the same as ownerUserUniqueId
    const ownerUserUniqueId =
      req?.params?.ownerUserUniqueId === "self"
        ? userUniqueId
        : req?.params?.ownerUserUniqueId;
    const roleId = user?.roleId;
    const body = { ...req.body, userUniqueId: ownerUserUniqueId, roleId };

    const response = await executeInTransaction(async () => {
      // Update user text information
      const textResponse = await services.updateUser(body);

      // Handle file upload if files are provided
      if (req.files && req.files.length > 0) {
        const {
          attachedDocumentUniqueId,
          profilePhotoTypeId,
          ProfilePhotoDescription,
          ProfilePhotoExpirationDate,
        } = body;

        // --- FTP UPLOAD LOGIC ---
        const file = req.files[0];
        const fileExtension = path.extname(file.originalname);
        const uniqueFilename = `${user.userId}_${uuidv4()}${fileExtension}`;

        const fileUrl = await uploadToFTP(file.buffer, uniqueFilename).catch(
          (err) => {
            throw new AppError(
              `User information updated, but failed to upload profile image to server: ${err.message}`,
              500,
            );
          },
        );

        // Validate attachedDocumentUniqueId
        if (
          !attachedDocumentUniqueId ||
          attachedDocumentUniqueId === "undefined" ||
          attachedDocumentUniqueId === "null"
        ) {
          await createAttachedDocument({
            attachedDocumentDescription: ProfilePhotoDescription,
            attachedDocumentName: fileUrl,
            documentTypeId: profilePhotoTypeId,
            documentExpirationDate: ProfilePhotoExpirationDate,
            roleId: user.roleId,
            userUniqueId: ownerUserUniqueId,
          });
        } else {
          await updateAttachedDocument({
            attachedDocumentUniqueId,
            roleId: user.roleId,
            attachedDocumentName: fileUrl,
            attachedDocumentDescription: ProfilePhotoDescription,
            documentExpirationDate: ProfilePhotoExpirationDate,
          });
        }
      }
      return textResponse;
    });

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
        userUniqueId: req?.user?.userUniqueId,
      });
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const response = await services.verifyEmailByToken(token);

    // Send a professional HTML success page with the login OTP
    res.send(getSuccessEmailVerificationHtml(response.data.OTP));
  } catch (error) {
    // If it's an API error, send a nice error page
    res.status(error.statusCode || 500).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">❌ Verification Failed</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
        <p style="color: #a0aec0; margin-top: 20px;">Please try logging in again to receive a fresh verification link.</p>
      </div>
    `);
  }
};

module.exports = {
  createUserByAdminOrSuperAdmin,
  updateUser,
  verifyUserByOTP,
  createUser,
  deleteUser,
  getUserByFilterDetailed,
  loginUser,
  verifyEmail,
};
