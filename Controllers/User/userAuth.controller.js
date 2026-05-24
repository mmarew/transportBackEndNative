"use strict";


const Config = require("../../Utils/Config");
// import uuidv4
// import uuidv4


const services = require("../../Services/User.service");

const ServerResponder = require("../../Utils/ServerResponder");

const {
  getOtpMessage,
  
  getSuccessPhoneVerificationHtml,
  getEmailVerificationLinkMessage,
  
  getSuccessEmailVerificationHtml
} = require("../../Utils/MessageTemplates");

const {
  executeInTransaction
} = require("../../Utils/DatabaseTransaction");
const logger = require("../../Utils/logger");




//in create user fullname must be existe for driver roles.


const loginUser = async (req, res, next) => {
  try {
    const payload = req.body && Object.keys(req.body).length ? req.body : req.query;
    const response = await services?.loginUser(payload?.phoneNumber, payload?.roleId !== null ? Number(payload.roleId) : payload?.roleId, payload?.email);

    // Handle deferred SMS and Email after login
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

      // 1. Send SMS (Always OTP for login)
      if (phoneNumber && phoneVerificationOTP) {
        logger.info("Initiating Login SMS Dispatch", {
          phoneNumber
        });
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

      // 2. Send Email (OTP or Link)
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

      // Don't send the raw OTP or tokens back to the client
      delete response.deferredOTP;
    }
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

/**
 * Handles the GET request for email verification via a unique token link.
 *
 * JUNIOR NOTE: This is the endpoint called when a user clicks the button in their email.
 * It doesn't use JSON for responses because it's meant to be viewed in a web browser.
 */
const verifyEmail = async (req, res) => {
  try {
    const {
      token
    } = req.query;
    // Call the service to mark the email as verified and generate fresh tokens
    await services.verifyEmailByToken(token);

    // Render a clean HTML success page (OTP is no longer shown here for security)
    res.send(getSuccessEmailVerificationHtml());
  } catch (error) {
    // Show a user-friendly error page instead of raw JSON
    res.status(error.statusCode || 500).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">❌ Verification Failed</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
        <p style="color: #a0aec0; margin-top: 20px;">Please try logging in again to receive a fresh verification link.</p>
      </div>
    `);
  }
};

/**
 * Handles reporting of misdirected verification emails.
 *
 * JUNIOR NOTE: If Recipient B receives an email meant for User A, clicking this link
 * lets the system know. We immediately kill the token and notify User A via WebSocket
 * so they know they made a typo.
 */

/**
 * Handles reporting of misdirected verification emails.
 *
 * JUNIOR NOTE: If Recipient B receives an email meant for User A, clicking this link
 * lets the system know. We immediately kill the token and notify User A via WebSocket
 * so they know they made a typo.
 */
const reportWrongEmail = async (req, res) => {
  try {
    const {
      token
    } = req.query;
    await services.reportMisdirectedEmail(token);

    // Show a polite "Thank You" page to the person who reported the mistake
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
    res.status(error.statusCode || 500).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">Report Error</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
      </div>
    `);
  }
};

/**
 * Handles the GET request for phone verification via a unique JWT link.
 *
 * JUNIOR NOTE: Just like email verification, this is browser-based.
 * On success, it shows a page explaining that the user MUST log in again
 * with their new number.
 */

/**
 * Handles the GET request for phone verification via a unique JWT link.
 *
 * JUNIOR NOTE: Just like email verification, this is browser-based.
 * On success, it shows a page explaining that the user MUST log in again
 * with their new number.
 */
const verifyPhone = async (req, res, next) => {
  try {
    const token = req.query.token || req.body.token;
    const response = await services.verifyPhoneByToken(token);

    // JUNIOR NOTE: If the request comes from the mobile app (Deep Link),
    // it usually expects JSON so it can use the returned login token immediately.
    // Otherwise, we show a success page for the browser.
    if (req.headers.accept?.includes("application/json") || req.method === "POST") {
      return ServerResponder(res, response);
    }

    // Show the "Phone Verified + Please Login" success page for browser clicks
    res.send(getSuccessPhoneVerificationHtml());
  } catch (error) {
    // If it's an app request, return the error as JSON
    if (req.headers.accept?.includes("application/json") || req.method === "POST") {
      return next(error);
    }
    // Browser error view
    res.status(error.statusCode || 500).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #e53e3e;">📱 Verification Failed</h1>
        <p style="color: #4a5568; font-size: 18px;">${error.message}</p>
        <p style="color: #a0aec0; margin-top: 20px;">Please request a new verification link from your profile settings.</p>
      </div>
    `);
  }
};

module.exports = {
  loginUser,
  verifyUserByOTP,
  verifyEmail,
  reportWrongEmail,
  verifyPhone
};
