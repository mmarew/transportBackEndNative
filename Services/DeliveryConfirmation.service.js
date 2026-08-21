const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const Config = require("../Utils/Config");
const { compressBase64 } = require("../Utils/compressImage");
const {
  currentDate,
  formatDateTime,
  minutesAgo,
} = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");
const { v4: uuidv4 } = require("uuid");
const { getPlaceholderEmail } = require("../Utils/GetPlaceholderEmail");

const { getData } = require("../CRUD/Read/ReadData");
const { resolveDocumentUrl } = require("../Utils/FTPHandler");
const { sendSms } = require("../Utils/smsSender");
const { usersRoles, journeyStatusMap } = require("../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../Utils/Notifications");
const logger = require("../Utils/logger");

const DELIVERY_CONFIRMATION_STATUSES = ["PENDING", "CONFIRMED", "DISPUTED"];
const DELIVERY_CONFIRMATION_CONDITIONS = ["GOOD", "DAMAGED", "PARTIAL"];

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
  Config.NODE_ENV !== "production" || Config.USE_TEST_OTP === true;
const testOtp = () => String(Config.TEST.OTP || "101010");

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

/**
 * Shipper-initiated proof of delivery (Tier B signature).
 *
 * The shipper submits AND self-confirms directly once the driver has completed
 * the journey ("goods delivered"). No driver evidence is needed — photos are
 * optional and GPS is not captured. The shipper may be off-site and a delegate
 * may be the actual receiver. The receiver of record defaults to the shipper
 * (they receive their own goods).
 *
 * One record per journey is enforced by the UNIQUE `journeyUniqueId`. The
 * SHA-256 settle hash is written at insert so Layer-3 integrity rules apply
 * identically. The `deliveryConfirmationSource` column is set to
 * `'SHIPPER_DIRECT'` to distinguish this from formal POD and receipt-based
 * confirmations.
 *
 * @param {Object} params
 * @param {Object} params.executor - Database executor (connection or pool).
 * @param {Object} params.journey - Journey row with `journeyStatusId`.
 * @param {string} params.journeyUniqueId - UUID of the completed journey.
 * @param {string} params.shipperUserUniqueId - UUID of the shipper submitting.
 * @param {string} [params.explicitReceiverUserUniqueId] - Override receiver.
 * @param {number} [params.deliveredQuantity] - Quantity delivered.
 * @param {string} [params.quantityUnit] - Unit of the delivered quantity.
 * @param {string} [params.condition] - Condition of goods (e.g. GOOD, DAMAGED).
 * @param {string} [params.shipperSignature] - Shipper's signature data.
 * @param {string[]} [params.photoUrls] - Optional proof photos.
 * @param {string} [params.notes] - Free-text notes.
 * @returns {Promise<{message: string, data: Object}>} Confirmation result.
 * @throws {AppError} If journey is not completed or caller is not the shipper.
 */
const createShipperDirectConfirmation = async ({
  executor,
  journey,
  journeyUniqueId,
  shipperUserUniqueId,
  explicitReceiverUserUniqueId,
  deliveredQuantity,
  quantityUnit,
  condition,
  shipperSignature,
  photoUrls,
  notes,
}) => {
  // Compress the shipper's base64 signature before storage
  shipperSignature = await compressBase64(shipperSignature);

  // "Goods delivered" = the driver completed the journey (same rule as settle).
  if (
    !journey ||
    Number(journey.journeyStatusId) !== Number(journeyStatusMap.journeyCompleted)
  ) {
    throw new AppError(
      "Delivery can only be confirmed for a completed journey",
      AppError.BAD_REQUEST,
    );
  }

  // Only the journey's shipper may submit a self-confirmed POD.
  const [journeyRows] = await executor.query(
    `SELECT sr.userUniqueId AS shipperUserUniqueId
     FROM Journey j
     JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
     LIMIT 1`,
    [journeyUniqueId],
  );
  if (
    !journeyRows[0]?.shipperUserUniqueId ||
    journeyRows[0].shipperUserUniqueId !== shipperUserUniqueId
  ) {
    throw new AppError(
      "Only the shipper of this journey can submit proof of delivery directly",
      AppError.FORBIDDEN,
    );
  }
  if (!shipperSignature) {
    throw new AppError(
      "A shipper signature is required to confirm delivery",
      AppError.BAD_REQUEST,
    );
  }

  // Receiver of record defaults to the shipper; an explicit reference is honored.
  const finalReceiverUserUniqueId =
    explicitReceiverUserUniqueId || shipperUserUniqueId;
  const [receiverRows] = await executor.query(
    `SELECT fullName, phoneNumber FROM Users WHERE userUniqueId = ?`,
    [finalReceiverUserUniqueId],
  );
  const receiver = receiverRows[0];
  if (!receiver) {
    throw new AppError("Receiver user not found", AppError.NOT_FOUND);
  }

  const deliveryConfirmationUniqueId = uuidv4();
  const now = currentDate();
  const finalQuantity = deliveredQuantity ?? null;
  const finalUnit = quantityUnit || null;
  const finalCondition = condition || "GOOD";

  const statement = buildDefaultStatement({
    receiverFullName: receiver.fullName,
    deliveredQuantity: finalQuantity,
    quantityUnit: finalUnit,
    condition: finalCondition,
    latitude: null,
    longitude: null,
    confirmedAt: now,
  });

  const hash = sha256(
    buildSignatureHashInput({
      journeyUniqueId,
      receiverSignature: null,
      shipperSignature,
      photoUrls: photoUrls || [],
      deliveredQuantity: finalQuantity,
      quantityUnit: finalUnit,
      condition: finalCondition,
      latitude: null,
      longitude: null,
      confirmedAt: now,
    }),
  );

  const primaryPhotoUrl =
    Array.isArray(photoUrls) && photoUrls.length > 0 ? photoUrls[0] : null;

  await executor.query(
    `INSERT INTO DeliveryConfirmations (
       deliveryConfirmationUniqueId,
       journeyUniqueId,
       receiverUserUniqueId,
       deliveryConfirmationStatus,
       deliveryConfirmationSource,
       deliveryConfirmationDeliveredQuantity,
       deliveryConfirmationQuantityUnit,
       deliveryConfirmationCondition,
       deliveryConfirmationReceiverSignature,
       deliveryConfirmationShipperSignature,
       deliveryConfirmationShipperSignedAt,
       deliveryConfirmationStatement,
       deliveryConfirmationSignatureHash,
       deliveryConfirmationPhotoUrl,
       deliveryConfirmationNotes,
       deliveryConfirmationSubmittedAt,
       deliveryConfirmationCreatedBy,
       confirmedByUserUniqueId,
       deliveryConfirmationConfirmedAt,
       deliveryConfirmationCreatedAt,
       deliveryConfirmationUpdatedAt
     ) VALUES (?, ?, ?, 'CONFIRMED', 'SHIPPER_DIRECT', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      finalReceiverUserUniqueId,
      finalQuantity,
      finalUnit,
      finalCondition,
      shipperSignature,
      now,
      statement,
      hash,
      primaryPhotoUrl,
      notes ?? null,
      now,
      shipperUserUniqueId,
      shipperUserUniqueId,
      now,
      now,
      now,
    ],
  );

  // Optional photos — attribted to the shipper who attached them.
  if (Array.isArray(photoUrls) && photoUrls.length > 0) {
    for (const photoUrl of photoUrls) {
      await executor.query(
        `INSERT INTO DeliveryConfirmationPhotos
           (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl, deliveryConfirmationPhotoAttachedByUserUniqueId)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), deliveryConfirmationUniqueId, photoUrl, shipperUserUniqueId],
      );
    }
  }

  // Best-effort push so the driver's POD gate clears without polling.
  await exports.notifyDriverOfPodConfirmed(
    journeyUniqueId,
    deliveryConfirmationUniqueId,
  );

  return {
    message: "Delivery confirmation created successfully",
    data: {
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      receiverUserUniqueId: finalReceiverUserUniqueId,
      deliveryConfirmationStatus: "CONFIRMED",
      deliveryConfirmationShipperSignature: shipperSignature,
      deliveryConfirmationPhotoUrl: primaryPhotoUrl,
      deliveryConfirmationPhotos: photoUrls || [],
      deliveryConfirmationSubmittedAt: now,
    },
  };
};

/**
 * Create a receipt-based delivery confirmation (auto-confirmed immediately).
 *
 * Used in two flows:
 * 1. **Receipt submission** (`source='RECEIPT_AUTO'`): driver submits receipt
 *    photos after a completed journey where `isPodRequired=true`. The
 *    confirmation is inserted directly as CONFIRMED — no shipper review.
 * 2. **Auto-confirm on completion** (`source='AUTO_NO_POD'`): when
 *    `isPodRequired=false`, this is called automatically at the end of
 *    `completeJourney` to create a CONFIRMED record without any photos.
 *
 * Idempotent per journey: if a CONFIRMED record already exists for this
 * `journeyUniqueId`, the existing record is returned unchanged.
 *
 * @param {Object} params
 * @param {string} params.journeyUniqueId - UUID of the completed journey.
 * @param {string} params.driverUserUniqueId - UUID of the driver who completed.
 * @param {string[]} [params.photoUrls=[]] - Receipt photo URLs (one per shop).
 * @param {'RECEIPT_AUTO'|'AUTO_NO_POD'} params.source - Confirmation source.
 * @param {string} [params.notes] - Free-text notes.
 * @param {number} [params.latitude] - GPS latitude at submission.
 * @param {number} [params.longitude] - GPS longitude at submission.
 * @param {number} [params.deliveredQuantity] - Quantity delivered.
 * @param {string} [params.quantityUnit] - Unit of the delivered quantity.
 * @param {string} [params.condition] - Condition of goods.
 * @returns {Promise<{message: string, data: Object}>} The confirmation record.
 * @throws {AppError} If journey is not found or not yet completed.
 */
exports.createReceiptConfirmation = async ({
  journeyUniqueId,
  driverUserUniqueId,
  photoUrls = [],
  source, // 'RECEIPT_AUTO' | 'AUTO_NO_POD'
  notes,
  latitude,
  longitude,
  deliveredQuantity,
  quantityUnit,
  condition,
}) => {
  const executor = transactionStorage.getStore() || pool;

  // 1. Validate journey is completed
  const [journeyRows] = await executor.query(
    `SELECT journeyStatusId FROM Journey
     WHERE journeyUniqueId = ? AND journeyDeletedAt IS NULL`,
    [journeyUniqueId],
  );
  if (
    !journeyRows[0] ||
    Number(journeyRows[0].journeyStatusId) !==
      Number(journeyStatusMap.journeyCompleted)
  ) {
    throw new AppError(
      "Delivery can only be confirmed for a completed journey",
      AppError.BAD_REQUEST,
    );
  }

  // 2. Resolve the shipper (receiver of record)
  const [journeyContext] = await executor.query(
    `SELECT sr.userUniqueId AS shipperUserUniqueId
     FROM Journey j
     JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
     LIMIT 1`,
    [journeyUniqueId],
  );
  const receiverUserUniqueId = journeyContext[0]?.shipperUserUniqueId;
  if (!receiverUserUniqueId) {
    throw new AppError("No shipper found for journey", AppError.NOT_FOUND);
  }

  // 3. Idempotent: if a DeliveryConfirmation already exists, return it
  const [existing] = await executor.query(
    `SELECT deliveryConfirmationUniqueId, deliveryConfirmationStatus
     FROM DeliveryConfirmations
     WHERE journeyUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL
     LIMIT 1`,
    [journeyUniqueId],
  );
  if (existing.length > 0) {
    return {
      message: "Delivery confirmation already exists for this journey",
      isExisting: true,
      data: {
        deliveryConfirmationUniqueId:
          existing[0].deliveryConfirmationUniqueId,
      },
    };
  }

  // 4. Build hash input
  const deliveryConfirmationUniqueId = uuidv4();
  const now = currentDate();
  const primaryPhotoUrl =
    photoUrls.length > 0 ? photoUrls[0] : null;

  const hash = sha256(
    buildSignatureHashInput({
      journeyUniqueId,
      receiverSignature: null,
      shipperSignature: null,
      photoUrls,
      deliveredQuantity: deliveredQuantity ?? null,
      quantityUnit: quantityUnit || null,
      condition: condition || "GOOD",
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      confirmedAt: now,
    }),
  );

  // 5. Insert CONFIRMED directly (receipt = proof, no review step)
  await executor.query(
    `INSERT INTO DeliveryConfirmations (
       deliveryConfirmationUniqueId,
       journeyUniqueId,
       receiverUserUniqueId,
       deliveryConfirmationStatus,
       deliveryConfirmationSource,
       deliveryConfirmationDeliveredQuantity,
       deliveryConfirmationQuantityUnit,
       deliveryConfirmationCondition,
       deliveryConfirmationPhotoUrl,
       deliveryConfirmationNotes,
       deliveryConfirmationLatitude,
       deliveryConfirmationLongitude,
       deliveryConfirmationSignatureHash,
       deliveryConfirmationSubmittedAt,
       deliveryConfirmationConfirmedAt,
       deliveryConfirmationCreatedBy,
       confirmedByUserUniqueId,
       deliveryConfirmationCreatedAt,
       deliveryConfirmationUpdatedAt
     ) VALUES (?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      receiverUserUniqueId,
      source,
      deliveredQuantity ?? null,
      quantityUnit || null,
      condition || "GOOD",
      primaryPhotoUrl,
      notes ?? null,
      latitude ?? null,
      longitude ?? null,
      hash,
      now,
      now,
      driverUserUniqueId,
      driverUserUniqueId,
      now,
      now,
    ],
  );

  // 6. Store receipt photos as evidence rows
  if (photoUrls.length > 0) {
    for (const photoUrl of photoUrls) {
      await executor.query(
        `INSERT INTO DeliveryConfirmationPhotos
           (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId,
            deliveryConfirmationPhotoUrl, deliveryConfirmationPhotoAttachedByUserUniqueId)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), deliveryConfirmationUniqueId, photoUrl, driverUserUniqueId],
      );
    }
  }

  // 7. Notify driver that POD is confirmed
  await exports.notifyDriverOfPodConfirmed(
    journeyUniqueId,
    deliveryConfirmationUniqueId,
  );

  return {
    message: "Delivery auto-confirmed via receipt",
    data: {
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      deliveryConfirmationStatus: "CONFIRMED",
      deliveryConfirmationSource: source,
      deliveryConfirmationPhotoUrl: primaryPhotoUrl,
    },
  };
};

/**
 * Submit receipt photos for a receipt-required journey.
 *
 * Validates:
 * 1. At least one photo is provided (receipt = photo evidence).
 * 2. The journey exists, is completed (status 9), and `isPodRequired=true`.
 * 3. The caller (`driverUserUniqueId`) is the driver assigned to this journey.
 *
 * On success, delegates to {@link createReceiptConfirmation} with
 * `source='RECEIPT_AUTO'` which inserts a CONFIRMED record directly.
 * Idempotent — returns the existing confirmation if one already exists.
 *
 * @param {Object} params
 * @param {string} params.journeyUniqueId - UUID of the completed journey.
 * @param {string} params.driverUserUniqueId - UUID of the submitting driver.
 * @param {string[]} params.photoUrls - Receipt photo URLs (at least one).
 * @param {string} [params.notes] - Free-text notes.
 * @param {number} [params.latitude] - GPS latitude at submission.
 * @param {number} [params.longitude] - GPS longitude at submission.
 * @param {number} [params.deliveredQuantity] - Quantity delivered.
 * @param {string} [params.quantityUnit] - Unit of the delivered quantity.
 * @param {string} [params.condition] - Condition of goods.
 * @returns {Promise<{message: string, data: Object}>} Confirmation result.
 * @throws {AppError} 400 if photos missing, journey incomplete, or not required.
 * @throws {AppError} 403 if caller is not the journey's driver.
 * @throws {AppError} 404 if journey not found.
 */
exports.submitReceiptPhotos = async ({
  journeyUniqueId,
  driverUserUniqueId,
  photoUrls,
  notes,
  latitude,
  longitude,
  deliveredQuantity,
  quantityUnit,
  condition,
}) => {
  const executor = transactionStorage.getStore() || pool;

  // 1. Validate photos are provided (receipt = photo evidence)
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    throw new AppError(
      "At least one receipt photo is required",
      AppError.BAD_REQUEST,
    );
  }

  // 2. Validate the journey exists, is completed, and isPodRequired=true
  const [journeyRows] = await executor.query(
    `SELECT j.journeyStatusId,
            sr.isPodRequired,
            sr.userUniqueId AS shipperUserUniqueId
     FROM Journey j
     JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
     LIMIT 1`,
    [journeyUniqueId],
  );
  const journey = journeyRows[0];
  if (!journey) {
    throw new AppError("Journey not found", AppError.NOT_FOUND);
  }
  if (
    Number(journey.journeyStatusId) !==
    Number(journeyStatusMap.journeyCompleted)
  ) {
    throw new AppError(
      "Receipts can only be submitted for a completed journey",
      AppError.BAD_REQUEST,
    );
  }
  if (!journey.isPodRequired) {
    throw new AppError(
      "This journey does not require proof of delivery receipts",
      AppError.BAD_REQUEST,
    );
  }

  // 3. Verify the caller is the driver of this journey
  const [driverRows] = await executor.query(
    `SELECT dr.userUniqueId
     FROM JourneyDecisions jd
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     WHERE jd.journeyDecisionUniqueId = ?`,
    [journeyUniqueId],
  );
  if (driverRows[0]?.userUniqueId !== driverUserUniqueId) {
    throw new AppError(
      "Only the journey driver can submit receipts",
      AppError.FORBIDDEN,
    );
  }

  // 4. Delegate to createReceiptConfirmation
  return await exports.createReceiptConfirmation({
    journeyUniqueId,
    driverUserUniqueId,
    photoUrls,
    source: "RECEIPT_AUTO",
    notes,
    latitude,
    longitude,
    deliveredQuantity,
    quantityUnit,
    condition,
  });
};

// Create a new delivery confirmation (one per journey)
exports.createDeliveryConfirmation = async ({
  journeyUniqueId,
  receiverUserUniqueId,
  receiverPhoneNumber,
  receiverFullName,
  receiverEmail,
  createdBy,
  roleId,
  deliveredQuantity,
  quantityUnit,
  condition,
  receiverSignature,
  shipperSignature,
  photoUrls,
  notes,
  latitude,
  longitude,
  status,
}) => {
  try {
    // Compress base64 signatures before storage
    receiverSignature = await compressBase64(receiverSignature);
    shipperSignature = await compressBase64(shipperSignature);

    const executor = transactionStorage.getStore() || pool;
    const primaryPhotoUrl =
      Array.isArray(photoUrls) && photoUrls.length > 0 ? photoUrls[0] : null;

    // Verify the journey exists
    const journeyRows = await getData({
      tableName: "Journey",
      conditions: { journeyUniqueId },
    });
    if (!journeyRows || journeyRows.length === 0) {
      throw new AppError("Journey not found", AppError.NOT_FOUND);
    }
    const journey = journeyRows[0];

    // Shipper-initiated POD that skips the PENDING stage and settles directly.
    if (status === "CONFIRMED") {
      return await createShipperDirectConfirmation({
        executor,
        journey,
        journeyUniqueId,
        shipperUserUniqueId: createdBy,
        explicitReceiverUserUniqueId: receiverUserUniqueId,
        deliveredQuantity,
        quantityUnit,
        condition,
        shipperSignature,
        photoUrls,
        notes,
      });
    }

    // The on-road proof must include at least one photo at submission time —
    // evidence is captured with the POD, not after. The settle-time check
    // remains as a backstop for legacy PENDING rows without a photo.
    if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
      throw new AppError(
        "At least one proof photo is required to submit a delivery confirmation",
        AppError.BAD_REQUEST,
      );
    }

    // Same policy for GPS: the delivery point is captured at submission (the
    // driver's device), so settle never asks the shipper for it.
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      throw new AppError(
        "GPS coordinates are required to submit a delivery confirmation",
        AppError.BAD_REQUEST,
      );
    }

    // Resolve the receiver: reuse an existing userUniqueId OR find-or-create
    // from phone + full name (same identity strategy as take-from-street).
    let resolvedReceiverUserUniqueId = receiverUserUniqueId;
    if (!resolvedReceiverUserUniqueId) {
      resolvedReceiverUserUniqueId = await ensureReceiverUser(
        {
          fullName: receiverFullName,
          phoneNumber: receiverPhoneNumber,
          email: receiverEmail,
          createdBy,
        },
        executor,
      );
    } else {
      const receiver = await getData({
        tableName: "Users",
        conditions: { userUniqueId: resolvedReceiverUserUniqueId },
      });
      if (!receiver || receiver.length === 0) {
        throw new AppError("Receiver user not found", AppError.NOT_FOUND);
      }
    }

    const deliveryConfirmationUniqueId = uuidv4();
    const now = currentDate();
    const sql = `
      INSERT INTO DeliveryConfirmations (
        deliveryConfirmationUniqueId,
        journeyUniqueId,
        receiverUserUniqueId,
        deliveryConfirmationStatus,
        deliveryConfirmationDeliveredQuantity,
        deliveryConfirmationQuantityUnit,
        deliveryConfirmationCondition,
        deliveryConfirmationReceiverSignature,
        deliveryConfirmationReceiverSignedAt,
        deliveryConfirmationPhotoUrl,
        deliveryConfirmationNotes,
        deliveryConfirmationLatitude,
        deliveryConfirmationLongitude,
        deliveryConfirmationSubmittedAt,
        deliveryConfirmationCreatedBy,
        deliveryConfirmationCreatedAt
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      resolvedReceiverUserUniqueId,
      deliveredQuantity ?? null,
      quantityUnit ?? null,
      condition || "GOOD",
      receiverSignature ?? null,
      receiverSignature ? now : null, // timestamp the on-road signature at create too
      primaryPhotoUrl,
      notes ?? null,
      latitude ?? null,
      longitude ?? null,
      now,
      createdBy,
      now,
    ];

    await executor.query(sql, values);

    // Store the full photo set as evidence rows (append-only, soft-deletable).
    // Each photo is attributed to the user who attached it — a delegate (or the
    // driver) may have captured the photos, not the shipper themselves.
    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      for (const photoUrl of photoUrls) {
        await executor.query(
          `INSERT INTO DeliveryConfirmationPhotos
             (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl, deliveryConfirmationPhotoAttachedByUserUniqueId)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), deliveryConfirmationUniqueId, photoUrl, createdBy],
        );
      }
    }

    return {
      message: "Delivery confirmation created successfully",
      data: {
        deliveryConfirmationUniqueId,
        journeyUniqueId,
        receiverUserUniqueId: resolvedReceiverUserUniqueId,
        deliveryConfirmationStatus: "PENDING",
        deliveryConfirmationPhotoUrl: primaryPhotoUrl,
        deliveryConfirmationPhotos: photoUrls || [],
        deliveryConfirmationSubmittedAt: now,
      },
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      // Idempotent create: the journey already has a confirmation. Instead of a
      // 409, hand back the existing record (same shape as GET) with a flag, so
      // submissions/retries never error — the record simply already exists.
      const existingResult = await module.exports.getDeliveryConfirmations({
        journeyUniqueId,
      });
      const existing = existingResult?.data?.[0];
      if (existing) {
        // Shipper self-confirm on top of a driver-created PENDING record: settle
        // the existing record with the shipper's signature so one action closes
        // the loop ("if the driver created it, let the shipper update it").
        if (
          status === "CONFIRMED" &&
          existing.deliveryConfirmationStatus === "PENDING"
        ) {
          const settled = await module.exports.updateDeliveryConfirmation(
            existing.deliveryConfirmationUniqueId,
            {
              status: "CONFIRMED",
              shipperSignature,
              deliveredQuantity,
              quantityUnit,
              condition,
              photoUrls,
              notes,
              latitude,
              longitude,
            },
            createdBy,
            roleId,
          );
          return {
            message:
              "Driver's pending delivery confirmation confirmed by the shipper",
            isExisting: true,
            data: settled.data,
          };
        }
        return {
          message: "A delivery confirmation already exists for this journey",
          isExisting: true,
          data: existing,
        };
      }
      throw new AppError(
        "A delivery confirmation already exists for this journey",
        AppError.CONFLICT,
      );
    }
    throw new AppError(
      error.message || "Unable to create delivery confirmation",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Get delivery confirmations via filters (id, journey, receiver, status) with pagination
exports.getDeliveryConfirmations = async ({
  deliveryConfirmationUniqueId = "",
  journeyUniqueId = "",
  receiverUserUniqueId = "",
  status = "",
  page = 1,
  limit = 10,
}) => {
  const offset = (page - 1) * limit;

  let whereClause = "WHERE dc.deliveryConfirmationDeletedAt IS NULL";
  const params = [];

  if (deliveryConfirmationUniqueId) {
    whereClause += " AND dc.deliveryConfirmationUniqueId = ?";
    params.push(deliveryConfirmationUniqueId);
  }
  if (journeyUniqueId) {
    whereClause += " AND dc.journeyUniqueId = ?";
    params.push(journeyUniqueId);
  }
  if (receiverUserUniqueId) {
    whereClause += " AND dc.receiverUserUniqueId = ?";
    params.push(receiverUserUniqueId);
  }
  if (status) {
    whereClause += " AND dc.deliveryConfirmationStatus = ?";
    params.push(status);
  }

  const joinClause = `
    LEFT JOIN Users r ON dc.receiverUserUniqueId = r.userUniqueId
    LEFT JOIN Users c ON dc.confirmedByUserUniqueId = c.userUniqueId
  `;

  const executor = transactionStorage.getStore() || pool;

  const countSql = `SELECT COUNT(*) as total FROM DeliveryConfirmations dc ${joinClause} ${whereClause}`;
  const [countResult] = await executor.query(countSql, params);
  const total = countResult[0].total;

  const dataSql = `
    SELECT
      dc.deliveryConfirmationUniqueId,
      dc.journeyUniqueId,
      dc.receiverUserUniqueId,
      dc.confirmedByUserUniqueId,
      dc.deliveryConfirmationStatus,
      dc.deliveryConfirmationDeliveredQuantity,
      dc.deliveryConfirmationQuantityUnit,
      dc.deliveryConfirmationCondition,
      dc.deliveryConfirmationReceiverSignature,
      dc.deliveryConfirmationPhotoUrl,
      dc.deliveryConfirmationNotes,
      dc.deliveryConfirmationLatitude,
      dc.deliveryConfirmationLongitude,
      dc.deliveryConfirmationSubmittedAt,
      dc.deliveryConfirmationConfirmedAt,
      dc.deliveryConfirmationShipperSignature,
      dc.deliveryConfirmationStatement,
      dc.deliveryConfirmationSignatureHash,
      dc.deliveryConfirmationPreviousHash,
      dc.deliveryConfirmationReceiverSignedAt,
      dc.deliveryConfirmationShipperSignedAt,
      dc.deliveryConfirmationOtpVerifiedAt,
      r.fullName AS receiverFullName,
      r.phoneNumber AS receiverPhoneNumber,
      c.fullName AS confirmedByFullName
      -- NOTE: deliveryConfirmationOtpHash / OtpExpiresAt / OtpAttempts are
      -- deliberately NOT exposed here — they are authentication artifacts.
    FROM DeliveryConfirmations dc
    ${joinClause}
    ${whereClause}
    ORDER BY dc.deliveryConfirmationId DESC
    LIMIT ? OFFSET ?
  `;

  const dataParams = [
    ...params,
    Number.parseInt(limit),
    Number.parseInt(offset),
  ];
  const [result] = await executor.query(dataSql, dataParams);

  // Attach the full photo set (append-only evidence) with attribution (who
  // attached each photo — the driver, the shipper, or a delegate) and resolve
  // stored relative paths to public URLs — same convention as AttachedDocuments.
  if (result.length > 0) {
    const [photoRows] = await executor.query(
      `SELECT p.deliveryConfirmationUniqueId,
              p.deliveryConfirmationPhotoUrl,
              p.deliveryConfirmationPhotoAttachedByUserUniqueId,
              p.deliveryConfirmationPhotoCreatedAt,
              u.fullName AS attachedByFullName,
              u.phoneNumber AS attachedByPhoneNumber
       FROM DeliveryConfirmationPhotos p
       LEFT JOIN Users u ON u.userUniqueId = p.deliveryConfirmationPhotoAttachedByUserUniqueId
       WHERE p.deliveryConfirmationPhotoDeletedAt IS NULL
         AND p.deliveryConfirmationUniqueId IN (?)
       ORDER BY p.deliveryConfirmationPhotoId ASC`,
      [result.map((row) => row.deliveryConfirmationUniqueId)],
    );
    const photoDetailsByConfirmation = {};
    for (const photo of photoRows) {
      const detailsList =
        photoDetailsByConfirmation[photo.deliveryConfirmationUniqueId] ||
        (photoDetailsByConfirmation[photo.deliveryConfirmationUniqueId] = []);
      detailsList.push({
        url: resolveDocumentUrl(photo.deliveryConfirmationPhotoUrl),
        attachedByUserUniqueId: photo.deliveryConfirmationPhotoAttachedByUserUniqueId || null,
        attachedByFullName: photo.attachedByFullName || null,
        attachedByPhoneNumber: photo.attachedByPhoneNumber || null,
        attachedAt: photo.deliveryConfirmationPhotoCreatedAt || null,
      });
    }
    for (const row of result) {
      row.deliveryConfirmationPhotos =
        (photoDetailsByConfirmation[row.deliveryConfirmationUniqueId] || []).map(
          (photo) => photo.url,
        );
      row.deliveryConfirmationPhotoDetails =
        photoDetailsByConfirmation[row.deliveryConfirmationUniqueId] || [];
      if (row.deliveryConfirmationPhotoUrl) {
        row.deliveryConfirmationPhotoUrl = resolveDocumentUrl(
          row.deliveryConfirmationPhotoUrl,
        );
      }
    }
  }

  if (deliveryConfirmationUniqueId) {
    if (result.length === 0) {
      throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
    }
    return {
      message: "Delivery confirmation fetched successfully",
      data: result[0],
    };
  }

  return {
    message: "Delivery confirmations fetched successfully",
    data: result,
    pagination: {
      currentPage: Number.parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit: Number.parseInt(limit),
    },
  };
};

// ── Helpers: tamper hash, OTP, statements ────────────────────────────────────

// Canonical hash input — exactly what the admin verification tool recomputes to
// detect tampering. `|`-separated, photo URLs sorted so order never matters.
const buildSignatureHashInput = (fields) => {
  const sortedPhotos = [...(fields.photoUrls || [])].sort();
  return [
    fields.journeyUniqueId,
    fields.receiverSignature || "",
    fields.shipperSignature || "",
    sortedPhotos.join(","),
    fields.deliveredQuantity ?? "",
    fields.quantityUnit || "",
    fields.condition || "",
    fields.latitude ?? "",
    fields.longitude ?? "",
    fields.confirmedAt || "",
  ].join("|");
};

const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");

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
      throw new AppError(
        "OTP already verified for this delivery confirmation",
        AppError.BAD_REQUEST,
      );
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

// Update a delivery confirmation (partial update — only sets provided fields).
//
// State machine (see docs/proof-of-delivery-pod.md §4.2):
//   PENDING  → CONFIRMED (settle: evidence + signature + GPS required; hash written once)
//   PENDING  → DISPUTED  (dispute recorded with who/when)
//   CONFIRMED → anything blocked; signed fields immutable unless admin (amendment → new hash)
//   DISPUTED → CONFIRMED admin-only re-settle (new hash; previous hash preserved)
exports.updateDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  updates,
  updatedBy,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const isAdmin = ADMIN_ROLE_IDS.has(Number(roleId));
  const now = currentDate();const {
    status,
    deliveredQuantity,
    quantityUnit,
    condition,
    receiverSignature,
    shipperSignature,
    statement,
    photoUrls,
    notes,
    latitude,
    longitude,
    otpCode,
  } = updates;

  // Compress base64 signatures before storage
  const compressedReceiver = await compressBase64(receiverSignature);
  const compressedShipper = await compressBase64(shipperSignature);


  if (status !== undefined && !DELIVERY_CONFIRMATION_STATUSES.includes(status)) {
    throw new AppError(
      `Invalid status. Must be one of: ${DELIVERY_CONFIRMATION_STATUSES.join(", ")}`,
      AppError.BAD_REQUEST,
    );
  }

  // Load the current row — needed for the state machine, immutability and OTP.
  const [currentRows] = await executor.query(
    `SELECT * FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = currentRows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }

  const currentStatus = current.deliveryConfirmationStatus;
  const isSettling = status === "CONFIRMED" && currentStatus !== "CONFIRMED";
  const signedFieldsChanged =
    deliveredQuantity !== undefined ||
    quantityUnit !== undefined ||
    condition !== undefined ||
    receiverSignature !== undefined ||
    shipperSignature !== undefined ||
    statement !== undefined ||
    (Array.isArray(photoUrls) && photoUrls.length > 0) ||
    latitude !== undefined ||
    longitude !== undefined;

  // ── State machine guards (pure checks, before any DB write) ──────────────
  if (status !== undefined && status !== currentStatus) {
    if (currentStatus === "CONFIRMED") {
      throw new AppError(
        "A confirmed delivery confirmation cannot change status",
        AppError.FORBIDDEN,
      );
    }
    if (currentStatus === "DISPUTED") {
      if (status !== "CONFIRMED") {
        throw new AppError(
          "A disputed delivery confirmation can only be re-settled to CONFIRMED",
          AppError.FORBIDDEN,
        );
      }
      if (!isAdmin) {
        throw new AppError(
          "Only an admin can re-settle a disputed delivery confirmation",
          AppError.FORBIDDEN,
        );
      }
    }
  }

  if (currentStatus === "CONFIRMED" && signedFieldsChanged && !isAdmin) {
    throw new AppError(
      "Signed delivery evidence cannot be changed after confirmation",
      AppError.FORBIDDEN,
    );
  }

  // ── Settle-time evidence validation (PENDING/DISPUTED → CONFIRMED) ───────
  let finalReceiverSignature = receiverSignature ?? current.deliveryConfirmationReceiverSignature;
  let finalShipperSignature = shipperSignature ?? current.deliveryConfirmationShipperSignature;
  let finalStatement = null;
  if (isSettling) {
    const finalQuantity = deliveredQuantity ?? current.deliveryConfirmationDeliveredQuantity;
    const finalUnit = quantityUnit ?? current.deliveryConfirmationQuantityUnit;
    const finalCondition = condition ?? current.deliveryConfirmationCondition;
    const finalLat = latitude ?? current.deliveryConfirmationLatitude;
    const finalLng = longitude ?? current.deliveryConfirmationLongitude;

    if (!finalReceiverSignature && !finalShipperSignature) {
      throw new AppError(
        "A receiver or shipper signature is required to confirm delivery",
        AppError.BAD_REQUEST,
      );
    }

    // Delivery can only be confirmed for a completed journey.
    const [journeyRows] = await executor.query(
      `SELECT journeyStatusId FROM Journey
       WHERE journeyUniqueId = ? AND journeyDeletedAt IS NULL`,
      [current.journeyUniqueId],
    );
    const journey = journeyRows[0];
    if (!journey) {
      throw new AppError("Journey not found", AppError.NOT_FOUND);
    }
    if (Number(journey.journeyStatusId) !== Number(journeyStatusMap.journeyCompleted)) {
      throw new AppError(
        "Delivery can only be confirmed for a completed journey",
        AppError.BAD_REQUEST,
      );
    }

    // Snapshot the declaration text the signer saw (client-provided or default).
    const receiver = await getReceiver(executor, current.receiverUserUniqueId);
    finalStatement =
      statement ||
      buildDefaultStatement({
        receiverFullName: receiver?.fullName,
        deliveredQuantity: finalQuantity,
        quantityUnit: finalUnit,
        condition: finalCondition,
        latitude: finalLat,
        longitude: finalLng,
        confirmedAt: now,
      });
  }

  // ── Tier A: consume the OTP only after all validations passed ────────────
  if (otpCode) {
    await verifyOtpCode(executor, current, otpCode, now);
  }

  // ── Build the UPDATE ──────────────────────────────────────────────────────
  const setParts = [];
  const values = [];

  if (status !== undefined) {
    setParts.push("deliveryConfirmationStatus = ?");
    values.push(status);
  }
  if (deliveredQuantity !== undefined) {
    setParts.push("deliveryConfirmationDeliveredQuantity = ?");
    values.push(deliveredQuantity);
  }
  if (quantityUnit !== undefined) {
    setParts.push("deliveryConfirmationQuantityUnit = ?");
    values.push(quantityUnit);
  }
  if (condition !== undefined) {
    if (!DELIVERY_CONFIRMATION_CONDITIONS.includes(condition)) {
      throw new AppError(
        `Invalid condition. Must be one of: ${DELIVERY_CONFIRMATION_CONDITIONS.join(", ")}`,
        AppError.BAD_REQUEST,
      );
    }
    setParts.push("deliveryConfirmationCondition = ?");
    values.push(condition);
  }
  if (receiverSignature !== undefined) {
    setParts.push("deliveryConfirmationReceiverSignature = ?");
    values.push(compressedReceiver);
    // Timestamp the on-road receiver signature once (never overwritten).
    setParts.push(
      "deliveryConfirmationReceiverSignedAt = COALESCE(deliveryConfirmationReceiverSignedAt, ?)",
    );
    values.push(now);
  }
  if (shipperSignature !== undefined) {
    setParts.push("deliveryConfirmationShipperSignature = ?");
    values.push(compressedShipper);
  }
  if (photoUrls !== undefined) {
    // Photos are append-only evidence: new uploads extend the set, and the
    // primary/cover photo (first captured) is never overwritten.
    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      setParts.push(
        "deliveryConfirmationPhotoUrl = COALESCE(deliveryConfirmationPhotoUrl, ?)",
      );
      values.push(photoUrls[0]);
    }
  }
  if (notes !== undefined) {
    setParts.push("deliveryConfirmationNotes = ?");
    values.push(notes);
  }
  if (latitude !== undefined) {
    setParts.push("deliveryConfirmationLatitude = ?");
    values.push(latitude);
  }
  if (longitude !== undefined) {
    setParts.push("deliveryConfirmationLongitude = ?");
    values.push(longitude);
  }

  // When settling (CONFIRMED/DISPUTED), record who settled it and when.
  if (status === "CONFIRMED" || status === "DISPUTED") {
    setParts.push("confirmedByUserUniqueId = ?");
    values.push(updatedBy);
    setParts.push("deliveryConfirmationConfirmedAt = ?");
    values.push(now);
    if (status === "CONFIRMED") {
      setParts.push("deliveryConfirmationShipperSignedAt = ?");
      values.push(now);
      setParts.push("deliveryConfirmationStatement = ?");
      values.push(finalStatement);
    }
  }

  // Immutable SHA-256 snapshot: written once at settle; admin amendments to a
  // CONFIRMED record recompute it and move the previous hash into the audit column.
  const isAmendment =
    currentStatus === "CONFIRMED" && isAdmin && signedFieldsChanged;
  if (isSettling || isAmendment) {
    const confirmedAt =
      status === "CONFIRMED" && currentStatus !== "CONFIRMED"
        ? now
        : current.deliveryConfirmationConfirmedAt || now;
    const storedPhotos = await getStoredPhotoUrls(executor, deliveryConfirmationUniqueId);
    const allPhotos = [...storedPhotos, ...(Array.isArray(photoUrls) ? photoUrls : [])];
    const hash = sha256(
      buildSignatureHashInput({
        journeyUniqueId: current.journeyUniqueId,
        receiverSignature: finalReceiverSignature,
        shipperSignature: finalShipperSignature,
        photoUrls: allPhotos,
        deliveredQuantity:
          deliveredQuantity ?? current.deliveryConfirmationDeliveredQuantity,
        quantityUnit: quantityUnit ?? current.deliveryConfirmationQuantityUnit,
        condition: condition ?? current.deliveryConfirmationCondition,
        latitude: latitude ?? current.deliveryConfirmationLatitude,
        longitude: longitude ?? current.deliveryConfirmationLongitude,
        confirmedAt,
      }),
    );
    if (current.deliveryConfirmationSignatureHash) {
      setParts.push("deliveryConfirmationPreviousHash = ?");
      values.push(current.deliveryConfirmationSignatureHash);
    }
    setParts.push("deliveryConfirmationSignatureHash = ?");
    values.push(hash);
  }

  if (setParts.length === 0 && !otpCode) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  if (setParts.length > 0) {
    setParts.push("deliveryConfirmationUpdatedBy = ?");
    values.push(updatedBy);
    setParts.push("deliveryConfirmationUpdatedAt = ?");
    values.push(now);
    values.push(deliveryConfirmationUniqueId);

    const sql = `UPDATE DeliveryConfirmations SET ${setParts.join(", ")} WHERE deliveryConfirmationUniqueId = ?`;
    const [result] = await executor.query(sql, values);

    if (result.affectedRows === 0) {
      throw new AppError(
        "Failed to update delivery confirmation",
        AppError.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Append any newly uploaded photos to the evidence set — attributed to the
  // user who attached them (the delegating shipper, reviewer, or driver).
  if (Array.isArray(photoUrls) && photoUrls.length > 0) {
    for (const photoUrl of photoUrls) {
      await executor.query(
        `INSERT INTO DeliveryConfirmationPhotos
           (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl, deliveryConfirmationPhotoAttachedByUserUniqueId)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), deliveryConfirmationUniqueId, photoUrl, updatedBy],
      );
    }
  }

  return {
    message: "Delivery confirmation updated successfully",
    data: { deliveryConfirmationUniqueId, ...updates },
  };
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

// Delete a delivery confirmation (soft delete). Settled (CONFIRMED) records are
// evidence and can only be deleted by an admin (roleId ∈ {3, 6}); the soft-delete
// columns record who and when.
exports.deleteDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  deletedBy,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const isAdmin = ADMIN_ROLE_IDS.has(Number(roleId));

  const [rows] = await executor.query(
    `SELECT deliveryConfirmationStatus FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = rows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }
  if (current.deliveryConfirmationStatus === "CONFIRMED" && !isAdmin) {
    throw new AppError(
      "A confirmed delivery confirmation cannot be deleted",
      AppError.FORBIDDEN,
    );
  }

  const sql = `
    UPDATE DeliveryConfirmations
    SET deliveryConfirmationDeletedBy = ?, deliveryConfirmationDeletedAt = ?
    WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL
  `;
  const values = [deletedBy, currentDate(), deliveryConfirmationUniqueId];
  const [result] = await executor.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: `Delivery confirmation ${deliveryConfirmationUniqueId} deleted successfully`,
      data: null,
    };
  }
  throw new AppError(
    "Failed to delete delivery confirmation",
    AppError.INTERNAL_SERVER_ERROR,
  );
};

// Admin tool (docs §10): recompute the settle hash from the stored fields and
// compare with the stored hash. `legacy: true` marks rows settled before the
// hash feature existed (stored hash is NULL).
exports.verifyDeliveryConfirmationHash = async (
  deliveryConfirmationUniqueId,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  if (!ADMIN_ROLE_IDS.has(Number(roleId))) {
    throw new AppError(
      "Only an admin can verify a delivery confirmation hash",
      AppError.FORBIDDEN,
    );
  }

  const [rows] = await executor.query(
    `SELECT * FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = rows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }

  if (!current.deliveryConfirmationSignatureHash) {
    return {
      message: "Delivery confirmation hash verification",
      data: {
        deliveryConfirmationUniqueId,
        valid: null,
        legacy: true,
        storedHash: null,
        computedHash: null,
      },
    };
  }

  const storedPhotos = await getStoredPhotoUrls(executor, deliveryConfirmationUniqueId);
  const computedHash = sha256(
    buildSignatureHashInput({
      journeyUniqueId: current.journeyUniqueId,
      receiverSignature: current.deliveryConfirmationReceiverSignature,
      shipperSignature: current.deliveryConfirmationShipperSignature,
      photoUrls: storedPhotos,
      deliveredQuantity: current.deliveryConfirmationDeliveredQuantity,
      quantityUnit: current.deliveryConfirmationQuantityUnit,
      condition: current.deliveryConfirmationCondition,
      latitude: current.deliveryConfirmationLatitude,
      longitude: current.deliveryConfirmationLongitude,
      confirmedAt: current.deliveryConfirmationConfirmedAt,
    }),
  );

  return {
    message: "Delivery confirmation hash verification",
    data: {
      deliveryConfirmationUniqueId,
      valid: computedHash === current.deliveryConfirmationSignatureHash,
      legacy: false,
      storedHash: current.deliveryConfirmationSignatureHash,
      computedHash,
    },
  };
};

// After a POD is submitted, notify the journey's shipper via WebSocket AND FCM
// so they can review & sign without polling. Best-effort: failures are logged,
// never thrown.
exports.notifyShipperOfPodSubmit = async (
  journeyUniqueId,
  deliveryConfirmationUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT sr.userUniqueId AS shipperUserUniqueId,
              sr.shipperRequestId,
              u.phoneNumber AS shipperPhoneNumber
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       LEFT JOIN Users u ON u.userUniqueId = sr.userUniqueId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [journeyUniqueId],
    );
    const shipperUserUniqueId = rows[0]?.shipperUserUniqueId;
    if (!shipperUserUniqueId) {
      logger.warn("POD shipper notification skipped: no shipper for journey", {
        journeyUniqueId,
      });
      return { message: "No shipper found for journey; skipping notification" };
    }

    // Real-time WebSocket push → the shipper app opens the POD review screen.
    const phoneNumber = rows[0]?.shipperPhoneNumber;
    if (phoneNumber) {
      const wsResult = await sendSocketIONotificationToShipper({
        phoneNumber,
        message: {
          message: "POD submitted.",
          data: {
            journeyUniqueId,
            deliveryConfirmationUniqueId,
            shipperRequestId: rows[0]?.shipperRequestId,
          },
        },
      });
      if (wsResult?.status !== "success") {
        logger.warn("POD WS push skipped for shipper", {
          journeyUniqueId,
          reason: wsResult?.data || wsResult?.message,
        });
      }
    }

    return await sendFCMNotificationToUser({
      userUniqueId: shipperUserUniqueId,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Proof of delivery submitted",
        body: "A driver has submitted proof of delivery. Review and sign it.",
      },
      data: { journeyUniqueId },
    });
  } catch (error) {
    logger.warn("POD shipper notification failed", {
      journeyUniqueId,
      error: error.message,
    });
    return { message: "Notification skipped" };
  }
};

// Notify the driver that the shipper confirmed the POD directly (no driver
// evidence was needed), so their POD gate clears immediately instead of on the
// next app open / poll. Best-effort — never fails the create request.
exports.notifyDriverOfPodConfirmed = async (
  journeyUniqueId,
  deliveryConfirmationUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT dr.userUniqueId AS driverUserUniqueId,
              u.phoneNumber AS driverPhoneNumber
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       LEFT JOIN Users u ON u.userUniqueId = dr.userUniqueId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [journeyUniqueId],
    );
    const driverUserUniqueId = rows[0]?.driverUserUniqueId;
    if (!driverUserUniqueId) {
      logger.warn("POD driver notification skipped: no driver for journey", {
        journeyUniqueId,
      });
      return { message: "No driver found for journey; skipping notification" };
    }

    // Real-time WebSocket push → the driver app clears the POD gate.
    const phoneNumber = rows[0]?.driverPhoneNumber;
    if (phoneNumber) {
      const wsResult = await sendSocketIONotificationToDriver({
        phoneNumber,
        message: {
          message: "POD confirmed.",
          data: {
            journeyUniqueId,
            deliveryConfirmationUniqueId,
          },
        },
      });
      if (wsResult?.status !== "success") {
        logger.warn("POD WS push skipped for driver", {
          journeyUniqueId,
          reason: wsResult?.data || wsResult?.message,
        });
      }
    }

    return await sendFCMNotificationToUser({
      userUniqueId: driverUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: {
        title: "Proof of delivery confirmed",
        body: "The shipper has confirmed delivery of your journey's goods. You're free for new trips.",
      },
      data: { journeyUniqueId },
    });
  } catch (error) {
    logger.warn("POD driver notification failed", {
      journeyUniqueId,
      error: error.message,
    });
    return { message: "Notification skipped" };
  }
};
