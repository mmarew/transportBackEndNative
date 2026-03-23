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
  // Support both positional arguments and a single options object
  if (typeof to === "object" && to !== null) {
    const options = to;
    to = options.to;
    subject = options.subject;
    body = options.text || options.body;
    html = options.html;
  }

  try {
    if (!to) {
      logger.warn("Attempted to send email without recipient address");
      return { status: "error", message: "Recipient email is required" };
    }

    // SMTP Configuration from centralized Config
    const { HOST, PORT, USER, PASS, FROM } = Config.SMTP;
    console.log(
      "Config.SMTP",
      Config.SMTP,
      " Config.BRAND_NAME",
      Config.BRAND_NAME,
    );
    const from = FROM || `"${Config.BRAND_NAME}" <${USER}>`;

    // Fallback if not configured
    if (!HOST || !USER || !PASS) {
      const bodyPreview =
        body && typeof body === "string"
          ? body.substring(0, 50) + "..."
          : "No body content provided";

      logger.warn("📧 [EMAIL LOGGED (NOT CONFIGURED)]", {
        to,
        subject,
        bodyPreview,
      });
      return {
        status: "success",
        message: "Email sending is not configured. Logged to console instead.",
      };
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: parseInt(PORT) === 465, // true for 465, false for other ports
      auth: {
        user: USER,
        pass: PASS,
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
