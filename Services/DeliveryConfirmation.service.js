const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
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
const logger = require("../Utils/logger");

const DELIVERY_CONFIRMATION_STATUSES = ["PENDING", "CONFIRMED", "DISPUTED"];
const DELIVERY_CONFIRMATION_CONDITIONS = ["GOOD", "DAMAGED", "PARTIAL"];

// Tier A OTP policy (see docs/proof-of-delivery-pod.md §4): bcrypt-hashed OTP,
// short expiry, and a hard attempt cap so a 6-digit code can't be brute-forced.
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_HOURLY_CAP = 5; // per-phone requests per rolling hour
const OTP_WINDOW_MINUTES = 60;

// Post-settle edits to signed evidence are admin-only (role 3 admin / 6 super admin).
const ADMIN_ROLE_IDS = new Set([
  usersRoles.adminRoleId,
  usersRoles.supperAdminRoleId,
]);

// Auto-created receivers follow the take-from-street convention: shipper role, ACTIVE.
const RECEIVER_DEFAULT_ROLE_ID = 1;
const RECEIVER_DEFAULT_STATUS_ID = 1;

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

// Create a new delivery confirmation (one per journey)
exports.createDeliveryConfirmation = async ({
  journeyUniqueId,
  receiverUserUniqueId,
  receiverPhoneNumber,
  receiverFullName,
  receiverEmail,
  createdBy,
  deliveredQuantity,
  quantityUnit,
  condition,
  receiverSignature,
  photoUrls,
  notes,
  latitude,
  longitude,
}) => {
  try {
    const executor = transactionStorage.getStore() || pool;
    const primaryPhotoUrl =
      Array.isArray(photoUrls) && photoUrls.length > 0 ? photoUrls[0] : null;

    // Verify the journey exists
    const journey = await getData({
      tableName: "Journey",
      conditions: { journeyUniqueId },
    });
    if (!journey || journey.length === 0) {
      throw new AppError("Journey not found", AppError.NOT_FOUND);
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
    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      for (const photoUrl of photoUrls) {
        await executor.query(
          `INSERT INTO DeliveryConfirmationPhotos
             (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl)
           VALUES (?, ?, ?)`,
          [uuidv4(), deliveryConfirmationUniqueId, photoUrl],
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

  // Attach the full photo set (append-only evidence) and resolve stored relative
  // paths to public URLs — same convention as AttachedDocuments (read.service.js).
  if (result.length > 0) {
    const [photoRows] = await executor.query(
      `SELECT deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl
       FROM DeliveryConfirmationPhotos
       WHERE deliveryConfirmationPhotoDeletedAt IS NULL
         AND deliveryConfirmationUniqueId IN (?)
       ORDER BY deliveryConfirmationPhotoId ASC`,
      [result.map((row) => row.deliveryConfirmationUniqueId)],
    );
    const photosByConfirmation = {};
    for (const photo of photoRows) {
      const list =
        photosByConfirmation[photo.deliveryConfirmationUniqueId] ||
        (photosByConfirmation[photo.deliveryConfirmationUniqueId] = []);
      list.push(resolveDocumentUrl(photo.deliveryConfirmationPhotoUrl));
    }
    for (const row of result) {
      row.deliveryConfirmationPhotos =
        photosByConfirmation[row.deliveryConfirmationUniqueId] || [];
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
  if (!current.deliveryConfirmationOtpHash) {
    throw new AppError(
      "No OTP has been requested for this delivery confirmation",
      AppError.BAD_REQUEST,
    );
  }
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

  const valid = await bcrypt.compare(
    String(otpCode),
    current.deliveryConfirmationOtpHash,
  );
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
  const now = currentDate();

  const {
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
    const hasPhoto =
      (Array.isArray(photoUrls) && photoUrls.length > 0) ||
      Boolean(current.deliveryConfirmationPhotoUrl);
    if (!hasPhoto) {
      throw new AppError(
        "At least one proof photo is required to confirm delivery",
        AppError.BAD_REQUEST,
      );
    }
    if (finalLat === null || finalLat === undefined || finalLng === null || finalLng === undefined) {
      throw new AppError(
        "GPS coordinates are required to confirm delivery",
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
    values.push(receiverSignature);
    // Timestamp the on-road receiver signature once (never overwritten).
    setParts.push(
      "deliveryConfirmationReceiverSignedAt = COALESCE(deliveryConfirmationReceiverSignedAt, ?)",
    );
    values.push(now);
  }
  if (shipperSignature !== undefined) {
    setParts.push("deliveryConfirmationShipperSignature = ?");
    values.push(shipperSignature);
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

  // Append any newly uploaded photos to the evidence set.
  if (Array.isArray(photoUrls) && photoUrls.length > 0) {
    for (const photoUrl of photoUrls) {
      await executor.query(
        `INSERT INTO DeliveryConfirmationPhotos
           (deliveryConfirmationPhotoUniqueId, deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl)
         VALUES (?, ?, ?)`,
        [uuidv4(), deliveryConfirmationUniqueId, photoUrl],
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

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
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

  await sendSms(receiverPhone, otp);

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

// After a POD is submitted, notify the journey's shipper via FCM so they can
// review & sign without polling. Best-effort: failures are logged, never thrown.
exports.notifyShipperOfPodSubmit = async (journeyUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT sr.userUniqueId AS shipperUserUniqueId
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
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
