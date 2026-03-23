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
  APP_API_URL: (process.env.APP_API_URL || "https://dynamicsroute.tech").replace(/\/+$/, ""),
  SECRET_KEY: process.env.SECRET_KEY,
  API_KEY: process.env.API_KEY,

  // Brand & Support
  BRAND_NAME: process.env.BRAND_NAME || "Dynamics Transport",
  SUPPORT_PHONE_NUMBER: process.env.SUPPORT_PHONE_NUMBER || "+251983222221",

  // Driver Timeouts
  DRIVER_TIMEOUT_CHECK_INTERVAL: process.env.DRIVER_TIMEOUT_CHECK_INTERVAL || "120",
  DRIVER_RESPONSE_TIMEOUT_MINUTES: process.env.DRIVER_RESPONSE_TIMEOUT_MINUTES || "5",

  // System Admin (Initialization)
  SUPER_ADMIN: {
    FULL_NAME: process.env.SUPER_ADMIN_FULL_NAME || "Supper Admin",
    PHONE: process.env.SUPER_ADMIN_PHONE || "+251983222221",
    EMAIL: process.env.SUPER_ADMIN_EMAIL || "supperAdmin@supperAdmin.com",
    TEMP_PASSWORD: process.env.SUPER_ADMIN_TEMP_PASSWORD || "123456",
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
  },

  // Testing (CI/CD)
  TEST: {
    TOKEN: process.env.TEST_TOKEN,
    PHONE: process.env.TEST_PHONE || "+251910185606",
    OTP: process.env.TEST_OTP || 101010,
    ROLE_ID: Number(process.env.TEST_ROLE_ID || 1),
    STATUS_ID: Number(process.env.TEST_STATUS_ID || 1),
    FULL_NAME: process.env.TEST_FULL_NAME || "E2E User",
    USER_ROLE_STATUS_DESC: process.env.TEST_USER_ROLE_STATUS_DESC || "E2E Test Description",
  }
};

module.exports = Config;
