"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const Config = require("../../Utils/Config");
const {
  currentDate,
  formatDateTime,
  minutesAgo,
} = require("../../Utils/CurrentDate");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { sendSms } = require("../../Utils/smsSender");
const logger = require("../../Utils/logger");
const { getReceiver } = require("./helpers");

// Tier A OTP policy (see docs/proof-of-delivery-pod.md §4): bcrypt-hashed OTP,
// short expiry, and a hard attempt cap so a 6-digit code can't be brute-forced.
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_HOURLY_CAP = 5; // per-phone requests per rolling hour
const OTP_WINDOW_MINUTES = 60;

// TEST/DEV OTP bypass: when the SMS gateway isn't configured/paid (dev), use the
// configured test code (default 101010) instead of the provider so the Tier-A
// flow stays testable offline. Enabled whenever not production, or explicitly via
// USE_TEST_OTP=true. Mirrors the login OTP fallback (Services/User/auth/otp.service.js).
const isTestOtpEnabled = () =>
  Config.TEST_OTP_ENABLED;
const testOtp = () => String(Config.TEST.OTP || "101010");


const otpExpiry = (now) => {
  const base = new Date(String(now).replace(" ", "T") + "Z");
  return formatDateTime(new Date(base.getTime() + OTP_TTL_MINUTES * 60000));
};

// Verify a Tier-A OTP before it is used to bind the receiver signature. OTP is
// bcrypt-hashed (not plain SHA-256 — 6-digit codes are offline-brute-forceable),
// expires after OTP_TTL_MINUTES, and is capped at OTP_MAX_ATTEMPTS failures.
const verifyOtpCode = async (executor, current, otpCode, now) => {
  const hasStoredOtp = Boolean(current.deliveryConfirmationOtpHash);
  const isTestOtp = isTestOtpEnabled() && String(otpCode) === testOtp();

  // Dev/test convenience: the configured test code (101010) is accepted even
  // when no OTP was requested yet (there's no SMS in dev), so the create → sign
  // flow works without an explicit request-sign-otp call. Production still
  // requires a real, previously-requested OTP hash.
  if (!hasStoredOtp && !isTestOtp) {
    throw new AppError(
      "No OTP has been requested for this delivery confirmation",
      AppError.BAD_REQUEST,
    );
  }
  if (hasStoredOtp) {
    if (current.deliveryConfirmationOtpVerifiedAt) {
      // Already verified — treat as success for idempotent retries.
      return;
    }
    if (
      current.deliveryConfirmationOtpExpiresAt &&
      current.deliveryConfirmationOtpExpiresAt < now
    ) {
      throw new AppError("OTP has expired", AppError.GONE);
    }
    if ((current.deliveryConfirmationOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      throw new AppError(
        "Too many invalid OTP attempts; request a new code",
        AppError.BAD_REQUEST,
      );
    }
  }

  const valid =
    isTestOtp ||
    // Dev/test fallback: accept the configured test code (101010) even when the
    // stored hash is for an earlier random code — keeps the dev flow moving.
    // Doesn't consume an attempt.
    (hasStoredOtp &&
      (await bcrypt.compare(
        String(otpCode),
        current.deliveryConfirmationOtpHash,
      )));
  if (!valid) {
    await executor.query(
      `UPDATE DeliveryConfirmations
       SET deliveryConfirmationOtpAttempts = ?
       WHERE deliveryConfirmationUniqueId = ?`,
      [(current.deliveryConfirmationOtpAttempts || 0) + 1, current.deliveryConfirmationUniqueId],
    );
    throw new AppError("Invalid OTP code", AppError.BAD_REQUEST);
  }

  await executor.query(
    `UPDATE DeliveryConfirmations
     SET deliveryConfirmationOtpVerifiedAt = ?
     WHERE deliveryConfirmationUniqueId = ?`,
    [now, current.deliveryConfirmationUniqueId],
  );
};

// Tier A: send a time-limited OTP to the receiver's phone so the on-road
// signature can be bound to the receiver's identity. Only while PENDING, and at
// most one active code at a time (resend blocked until it expires) — keeps SMS
// volume bounded.
exports.requestSignOtp = async (deliveryConfirmationUniqueId) => {
  const executor = transactionStorage.getStore() || pool;

  const [rows] = await executor.query(
    `SELECT * FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = rows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }
  if (current.deliveryConfirmationStatus !== "PENDING") {
    throw new AppError(
      "OTP signing is only available while the confirmation is PENDING",
      AppError.BAD_REQUEST,
    );
  }

  const now = currentDate();
  if (
    current.deliveryConfirmationOtpExpiresAt &&
    !current.deliveryConfirmationOtpVerifiedAt &&
    current.deliveryConfirmationOtpExpiresAt > now
  ) {
    throw new AppError(
      "An OTP is already active; wait for it to expire before requesting another",
      AppError.TOO_MANY_REQUESTS,
    );
  }

  // Per-phone hourly cap (the phone is fixed per confirmation): count requests
  // in a rolling 60-minute window, resetting when the window expires.
  let otpRequestCount = current.deliveryConfirmationOtpRequestCount || 0;
  let otpWindowStartAt = current.deliveryConfirmationOtpWindowStartAt || null;
  if (!otpWindowStartAt || otpWindowStartAt <= minutesAgo(OTP_WINDOW_MINUTES)) {
    otpWindowStartAt = now;
    otpRequestCount = 0;
  }
  if (otpRequestCount >= OTP_HOURLY_CAP) {
    throw new AppError(
      "Too many OTP requests; try again later",
      AppError.TOO_MANY_REQUESTS,
    );
  }
  otpRequestCount += 1;

  const receiver = await getReceiver(executor, current.receiverUserUniqueId);
  const receiverPhone = receiver?.phoneNumber;
  if (!receiverPhone) {
    throw new AppError(
      "The receiver has no phone number to send the OTP to",
      AppError.BAD_REQUEST,
    );
  }

  const useTestOtp = isTestOtpEnabled();
  // DEV stage: SMS gateway isn't configured/paid — use the fixed test code instead
  // of hitting the provider (send + accept both use 101010).
  const otp = useTestOtp
    ? testOtp()
    : String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = otpExpiry(now);

  await executor.query(
    `UPDATE DeliveryConfirmations
     SET deliveryConfirmationOtpHash = ?,
         deliveryConfirmationOtpExpiresAt = ?,
         deliveryConfirmationOtpAttempts = 0,
         deliveryConfirmationOtpVerifiedAt = NULL,
         deliveryConfirmationOtpRequestCount = ?,
         deliveryConfirmationOtpWindowStartAt = ?
     WHERE deliveryConfirmationUniqueId = ?`,
    [
      otpHash,
      expiresAt,
      otpRequestCount,
      otpWindowStartAt,
      deliveryConfirmationUniqueId,
    ],
  );

  if (useTestOtp) {
    logger.info("DEV mode: SMS skipped, test OTP issued", {
      receiverPhone,
      otp,
    });
  } else {
    await sendSms(receiverPhone, otp);
  }

  return {
    message: "OTP sent to the receiver",
    data: {
      deliveryConfirmationUniqueId,
      otpExpiresAt: expiresAt,
    },
  };
};


module.exports.isTestOtpEnabled = isTestOtpEnabled;
module.exports.testOtp = testOtp;
module.exports.otpExpiry = otpExpiry;
module.exports.verifyOtpCode = verifyOtpCode;
