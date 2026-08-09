"use strict";

const Config = require("../../Utils/Config");

const services = require("../../Services/User.service");
const ServerResponder = require("../../Utils/ServerResponder");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const {
  getOtpMessage,
  getSuccessPhoneVerificationHtml,
  getEmailVerificationLinkMessage,
  getSuccessEmailVerificationHtml,
  getAdminAssignmentMessage
} = require("../../Utils/MessageTemplates");

const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");
const { HTTP_STATUS } = require("../../Utils/Constants");
const AppError = require("../../Utils/AppError");

const createUser = async (req, res, next) => {
  try {
    const response = await executeInTransaction(async () => {
      return await services.createUser({
        ...req?.body,
        requestedFrom: "user"
      });
    });
    // Handle deferred SMS and Email after transaction commit
    if (response?.deferredOTP) {
      const { sendSms } = require("../../Utils/smsSender");
      const { sendEmail } = require("../../Utils/emailSender");
      const { phoneNumber, email, isEmailVerified } = response.data || {};
      const { phoneVerificationOTP, emailVerificationOTP, emailVerificationToken } = response.deferredOTP;
      
      // 1. Send SMS (Always OTP)
      if (phoneNumber && phoneVerificationOTP) {
        const phoneMsg = getOtpMessage(phoneVerificationOTP, "registration");
        sendSms(phoneNumber, null, phoneMsg.sms).catch(err => {
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
            logger.warn("Deferred Email Link sending failed", {
              email,
              error: err.message
            });
          });
        }
      }

      delete response.deferredOTP;
    }
    ServerResponder(res, response);
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

    if (response?.deferredOTP) {
      const { sendSms } = require("../../Utils/smsSender");
      const { sendEmail } = require("../../Utils/emailSender");
      const { phoneNumber, email, isEmailVerified } = response.data || {};
      const { roleId } = req.body;
      const { phoneVerificationOTP, emailVerificationToken } = response.deferredOTP;

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

      delete response.deferredOTP;
    }
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const payload = req.body && Object.keys(req.body).length ? req.body : req.query;
    const response = await services?.loginUser(payload?.phoneNumber, payload?.roleId !== null ? Number(payload.roleId) : payload?.roleId, payload?.email);

    if (response?.deferredOTP) {
      const { sendSms } = require("../../Utils/smsSender");
      const { sendEmail } = require("../../Utils/emailSender");
      const { phoneNumber, email, isEmailVerified } = response.data || {};
      const { phoneVerificationOTP, emailVerificationOTP, emailVerificationToken } = response.deferredOTP;

      if (phoneNumber && phoneVerificationOTP) {
        logger.info("Initiating Login SMS Dispatch", { phoneNumber });
        const phoneMsg = getOtpMessage(phoneVerificationOTP, "login");
        sendSms(phoneNumber, null, phoneMsg.sms).then(res => {
          logger.info("Login SMS successfully dispatched", {
            phoneNumber,
            response: res
          });
          return res;
        }).catch(err => {
          logger.warn("Deferred Login SMS sending failed", {
            phoneNumber,
            error: err.message
          });
        });
      }

      if (email) {
        if (isEmailVerified && emailVerificationOTP) {
          const emailMsg = getOtpMessage(emailVerificationOTP, "login");
          sendEmail(email, emailMsg.emailSubject, emailMsg.sms, emailMsg.emailHtml).catch(err => {
            logger.warn("Deferred Login Email OTP sending failed", {
              email,
              error: err.message
            });
          });
        } else if (emailVerificationToken) {
          const baseUrl = Config.APP_API_URL;
          const link = `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`;
          const linkMsg = getEmailVerificationLinkMessage(link);
          sendEmail(email, linkMsg.emailSubject, "Verify your email", linkMsg.emailHtml).catch(err => {
            logger.warn("Deferred Login Email Link sending failed", {
              email,
              error: err.message
            });
          });
        }
      }

      delete response.deferredOTP;
    }
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

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

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    await services.verifyEmailByToken(token);
    res.send(getSuccessEmailVerificationHtml());
  } catch (error) {
    res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">❌ Verification Failed</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
        <p style="color: #a0aec0; margin-top: 20px;">Please try logging in again to receive a fresh verification link.</p>
      </div>
    `);
  }
};

const reportWrongEmail = async (req, res) => {
  try {
    const { token } = req.query;
    await services.reportMisdirectedEmail(token);
    res.send(`
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="font-size: 48px; margin-bottom: 20px;">🙏</div>
        <h2 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 24px;">Thank You!</h2>
        <p style="color: #4a5568; margin: 0; font-size: 16px; line-height: 1.6;">
          We have received your report. The verification link has been revoked and the sender has been notified of the mistake. 
          You will not receive any further automated messages regarding this account.
        </p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 13px; color: #718096;">
          &copy; 2026 Dynamics Transport. All rights reserved.
        </div>
      </div>
    `);
  } catch (error) {
    res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">Report Error</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
      </div>
    `);
  }
};

const verifyPhone = async (req, res, next) => {
  try {
    const token = req.query.token || req.body?.token;
    const response = await services.verifyPhoneByToken(token);

    if (req.headers.accept?.includes("application/json") || req.method === "POST") {
      return ServerResponder(res, response);
    }

    res.send(getSuccessPhoneVerificationHtml());
  } catch (error) {
    if (req.headers.accept?.includes("application/json") || req.method === "POST") {
      return next(error);
    }
    res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">📱 Verification Failed</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
        <p style="color: #a0aec0; margin-top: 20px;">Please request a new verification link from your profile settings.</p>
      </div>
    `);
  }
};

/**
 * TEST/DEV ONLY — guarded by Config.EXPOSE_VERIFICATION_LINKS.
 * Returns fresh real email/phone verification links for the authenticated user
 * so out-of-app link flows can be exercised by the E2E suite.
 */
const getVerificationLinks = async (req, res, next) => {
  try {
    if (!Config.EXPOSE_VERIFICATION_LINKS) {
      return next(new AppError("Not found", AppError.NOT_FOUND));
    }
    const links = await services.getVerificationLinks(req.user.userUniqueId);
    return ServerResponder(res, {
      message: "Verification links generated",
      data: links,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createUser,
  createUserByAdminOrSuperAdmin,
  loginUser,
  verifyUserByOTP,
  verifyEmail,
  reportWrongEmail,
  verifyPhone,
  getVerificationLinks
};
