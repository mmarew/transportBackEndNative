const nodemailer = require("nodemailer");
const path = require("path");
const logger = require("./logger");
const Config = require("./Config");

/**
 * Sends real emails using Nodemailer.
 * Configured via environment variables for SMTP.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} body - Email body content
 * @returns {Promise<Object>} Status of the operation
 */
const sendEmail = async (to, subject, body, html = null) => {
  try {
    if (!to) {
      logger.warn("Attempted to send email without recipient address");
      return { status: "error", message: "Recipient email is required" };
    }

    // SMTP Configuration from centralized Config
    const { host, port, user, pass } = Config.SMTP;
    const from = Config.SMTP.FROM || `"${Config.BRAND_NAME}" <${user}>`;

    // Fallback if not configured
    if (!host || !user || !pass) {
      logger.warn("📧 [EMAIL LOGGED (NOT CONFIGURED)]", {
        to,
        subject,
        bodyPreview: body.substring(0, 50) + "...",
      });
      return {
        status: "success",
        message: "Email sending is not configured. Logged to console instead.",
      };
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: parseInt(port) === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    // Send the email
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      html: html || body, // Prefer HTML if provided
      attachments: [
        {
          filename: "DynamicsIcon.png",
          path: path.join(__dirname, "../Assets/DynamicsIcon.png"),
          cid: "dynamics_logo",
        },
        {
          filename: "whatsapp_icon.png",
          path: path.join(__dirname, "../Assets/whatsapp_icon.png"),
          cid: "whatsapp_icon",
        },
        {
          filename: "telegram_icon.png",
          path: path.join(__dirname, "../Assets/telegram_icon.png"),
          cid: "telegram_icon",
        },
        {
          filename: "phone_icon.png",
          path: path.join(__dirname, "../Assets/phone_icon.png"),
          cid: "phone_icon",
        },
      ],
    });

    logger.info("📧 [EMAIL SENT]", {
      messageId: info.messageId,
      to,
    });

    return {
      status: "success",
      message: "Email sent successfully",
      messageId: info.messageId,
    };
  } catch (error) {
    logger.error("Error in sendEmail", { error: error.message });
    return { status: "error", message: error.message };
  }
};

module.exports = { sendEmail };
