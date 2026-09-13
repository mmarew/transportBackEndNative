"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { getPlaceholderEmail } = require("../../Utils/GetPlaceholderEmail");
const { getData } = require("../../CRUD/Read/ReadData");
const { usersRoles } = require("../../Utils/ListOfSeedData");

const DELIVERY_CONFIRMATION_STATUSES = ["PENDING", "CONFIRMED", "DISPUTED"];
const DELIVERY_CONFIRMATION_CONDITIONS = ["GOOD", "DAMAGED", "PARTIAL"];

// Post-settle edits to signed evidence are admin-only (role 3 admin / 6 super admin).
const ADMIN_ROLE_IDS = new Set([
  usersRoles.adminRoleId,
  usersRoles.supperAdminRoleId,
]);

// Auto-created receivers follow the take-from-street convention: shipper role, ACTIVE.

// Find-or-create the receiver (e.g. the shipper's employee who received the
// goods). Mirrors the take-from-street identity strategy: the phone number is
// the primary identity — if a user with that phone already exists they are
// reused, otherwise a minimal user row is created (placeholder email, shipper
// role, ACTIVE) so the driver is never blocked while on the road.
const ensureReceiverUser = async (
  { fullName, phoneNumber, email, createdBy },
  executor,
) => {
  const cleanPhone = String(phoneNumber || "").trim().replace(/\s/g, "");
  if (!cleanPhone) {
    throw new AppError(
      "Receiver phone number is required",
      AppError.BAD_REQUEST,
    );
  }

  const existing = await getData({
    tableName: "Users",
    conditions: { phoneNumber: cleanPhone },
    limit: 1,
  });
  if (existing?.length > 0) {
    return existing[0].userUniqueId;
  }

  const userUniqueId = uuidv4();
  const now = currentDate();
  const cleanEmail = (email?.trim() || getPlaceholderEmail(cleanPhone)).toLowerCase();

  await executor.query(
    `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy, isEmailVerified, isPhoneVerified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userUniqueId,
      fullName || null,
      cleanPhone,
      cleanEmail,
      now,
      createdBy,
      false,
      false,
    ],
  );

  return userUniqueId;
};

// Load the receiver (name/phone) for OTP sending and the signed declaration.
const getReceiver = async (executor, receiverUserUniqueId) => {
  const [rows] = await executor.query(
    `SELECT fullName, phoneNumber FROM Users WHERE userUniqueId = ?`,
    [receiverUserUniqueId],
  );
  return rows[0] || null;
};

// Full photo set stored on the confirmation (append-only evidence rows).
const getStoredPhotoUrls = async (executor, deliveryConfirmationUniqueId) => {
  const [rows] = await executor.query(
    `SELECT deliveryConfirmationPhotoUrl
     FROM DeliveryConfirmationPhotos
     WHERE deliveryConfirmationPhotoDeletedAt IS NULL
       AND deliveryConfirmationUniqueId = ?
     ORDER BY deliveryConfirmationPhotoId ASC`,
    [deliveryConfirmationUniqueId],
  );
  return rows.map((row) => row.deliveryConfirmationPhotoUrl);
};


const buildDefaultStatement = (fields) => {
  const receiverName = fields.receiverFullName || "the receiver";
  const quantity = fields.deliveredQuantity ?? "the agreed";
  const unit = fields.quantityUnit ? ` ${fields.quantityUnit}` : "";
  const place =
    fields.latitude !== null &&
    fields.latitude !== undefined &&
    fields.longitude !== null &&
    fields.longitude !== undefined
      ? `at the recorded GPS location (${fields.latitude}, ${fields.longitude})`
      : "at the delivery point";
  const at = fields.confirmedAt || fields.submittedAt || "";
  return `I, ${receiverName}, confirm I received ${quantity}${unit} of goods ${place} on ${at}, in ${fields.condition || "GOOD"} condition, and I have no damage claim against the driver for this delivery.`;
};


module.exports.DELIVERY_CONFIRMATION_STATUSES = DELIVERY_CONFIRMATION_STATUSES;
module.exports.DELIVERY_CONFIRMATION_CONDITIONS = DELIVERY_CONFIRMATION_CONDITIONS;
module.exports.ADMIN_ROLE_IDS = ADMIN_ROLE_IDS;
module.exports.ensureReceiverUser = ensureReceiverUser;
module.exports.getReceiver = getReceiver;
module.exports.getStoredPhotoUrls = getStoredPhotoUrls;
module.exports.buildDefaultStatement = buildDefaultStatement;
