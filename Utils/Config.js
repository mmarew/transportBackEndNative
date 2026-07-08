require("dotenv").config();

/**
 * Centralized Configuration for Environment Variables.
 *
 * JUNIOR NOTE: Instead of calling process.env throughout the app, we use this
 * single object. This makes it easier to track which variables are required,
 * set consistent defaults, and update them in one place.
 */

const Config = {
  // Server & Environment
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  APP_API_URL: (
    process.env.APP_API_URL || "https://dynamicsroute.tech"
  ).replace(/\/+$/, ""),
  SECRET_KEY: process.env.SECRET_KEY,
  API_KEY: process.env.API_KEY,

  // Database Configuration
  DB: {
    HOST: process.env.DB_HOST,
    USER: process.env.DB_USER,
    PASSWORD: process.env.DB_PASSWORD,
    DATABASE: process.env.DB_DATABASE,
    PORT: Number(process.env.DB_PORT) || 3306,
    SOCKET_PATH: process.env.DB_SOCKET_PATH,
    CONNECTION_LIMIT:
      Number(process.env.DB_CONNECTION_LIMIT) ||
      (process.env.NODE_ENV === "production" ? 20 : 10),
    SLOW_QUERY_THRESHOLD: Number(process.env.SLOW_QUERY_THRESHOLD) || 100,
    ENABLE_QUERY_LOGGING: process.env.ENABLE_QUERY_LOGGING !== "false",
  },

  // Serverless Environment Detection
  IS_SERVERLESS: !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME
  ),
  VERCEL: process.env.VERCEL,
  AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
  FUNCTION_NAME: process.env.FUNCTION_NAME,

  // Brand & Support
  BRAND_NAME: process.env.BRAND_NAME || "Dynamics Transport",
  SUPPORT_PHONE_NUMBER: process.env.SUPPORT_PHONE_NUMBER || "",

  // Driver Timeouts
  DRIVER_TIMEOUT_CHECK_INTERVAL:
    process.env.DRIVER_TIMEOUT_CHECK_INTERVAL || "120",
  DRIVER_RESPONSE_TIMEOUT_MINUTES:
    process.env.DRIVER_RESPONSE_TIMEOUT_MINUTES || "5",

  // System Admin (Initialization)
  SUPER_ADMIN: {
    FULL_NAME: process.env.SUPER_ADMIN_FULL_NAME,
    PHONE: process.env.SUPER_ADMIN_PHONE,
    EMAIL: process.env.SUPER_ADMIN_EMAIL,
    TEMP_PASSWORD: process.env.SUPER_ADMIN_TEMP_PASSWORD,
    SYSTEM_FULL_NAME: process.env.SYSTEM_FULL_NAME,
    SYSTEM_PHONE: process.env.SYSTEM_PHONE,
    SYSTEM_EMAIL: process.env.SYSTEM_EMAIL,
  },

  // SMS Service (AfroMessage or similar)
  SMS: {
    TOKEN: process.env.SMS_TOKEN,
    BASE_URL: process.env.AFRO_BASE_URL,
    SENDER: process.env.SMS_SENDER || "",
    FROM: process.env.SMS_FROM || "",
    CALLBACK: process.env.SMS_CALLBACK || "",
    OTP_TEMPLATE: process.env.OTP_TEMPLATE || "",
  },

  // Email Service (SMTP)
  SMTP: {
    HOST: process.env.SMTP_HOST,
    PORT: process.env.SMTP_PORT || 587,
    USER: process.env.SMTP_USER,
    PASS: process.env.SMTP_PASS,
    FROM: process.env.SMTP_FROM,
  },

  // Allow test OTP (101010) even in production
  USE_TEST_OTP: process.env.USE_TEST_OTP === "true",

  // Testing (CI/CD)
  TEST: {
    TOKEN: process.env.TEST_TOKEN,
    PHONE: process.env.TEST_PHONE || "",
    OTP: process.env.TEST_OTP || "101010",
    ROLE_ID: Number(process.env.TEST_ROLE_ID || 1),
    STATUS_ID: Number(process.env.TEST_STATUS_ID || 1),
    FULL_NAME: process.env.TEST_FULL_NAME || "",
    USER_ROLE_STATUS_DESC:
      process.env.TEST_USER_ROLE_STATUS_DESC || "",
  },

  // Payment Gateway (SantimPay)
  SANTIMPAY: {
    MERCHANT_ID: process.env.SANTIMPAY_MERCHANT_ID,
    PRIVATE_KEY: process.env.SANTIMPAY_PRIVATE_KEY,
    BASE_URL: process.env.SANTIMPAY_BASE_URL,
    SUCCESS_REDIRECT_URL: process.env.SANTIMPAY_SUCCESS_REDIRECT_URL,
    FAILURE_REDIRECT_URL: process.env.SANTIMPAY_FAILURE_REDIRECT_URL,
    CANCEL_REDIRECT_URL: process.env.SANTIMPAY_CANCEL_REDIRECT_URL,
    WEBHOOK_URL: process.env.SANTIMPAY_WEBHOOK_URL,
  },

  // Firebase Cloud Messaging
  FIREBASE: {
    SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON,
    SERVICE_ACCOUNT_B64: process.env.FCM_SERVICE_ACCOUNT_B64,
  },

  // Redis / Upstash
  REDIS: {
    URL: process.env.UPSTASH_REDIS_URL,
    PASSWORD: process.env.REDIS_PASSWORD,
  },
};

module.exports = Config;
