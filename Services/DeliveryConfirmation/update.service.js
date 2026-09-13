"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const {
  ADMIN_ROLE_IDS,
  DELIVERY_CONFIRMATION_STATUSES,
  DELIVERY_CONFIRMATION_CONDITIONS,
  getReceiver,
  buildDefaultStatement,
  getStoredPhotoUrls,
} = require("./helpers");
const {
  uploadSignature,
  buildSignatureHashInput,
  sha256,
} = require("./signature.service");
const { verifyOtpCode } = require("./otp.service");
const { notifyShipperOfPodConfirmed } = require("./notify.service");

// Update a delivery confirmation (partial update — only sets provided fields).
//
// State machine (see docs/proof-of-delivery-pod.md §4.2):
//   PENDING  → CONFIRMED (settle: evidence + signature + GPS required; hash written once)
//   PENDING  → DISPUTED  (dispute recorded with who/when)
//   CONFIRMED → anything blocked; signed fields immutable unless admin (amendment → new hash)
//   DISPUTED → CONFIRMED admin-only re-settle (new hash; previous hash preserved)
//
// Driver late evidence: when the record is already CONFIRMED (e.g. the shipper
// self-confirmed first via SHIPPER_DIRECT), the journey's driver may still
// submit — idempotent success; only photos/notes are appended (attributed to the
// driver) and the hash is recomputed with the previous hash preserved. Fields
// the shipper signed (quantity, condition, signature, statement, GPS) are never
// overwritten by the driver.
exports.updateDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  updates,
  updatedBy,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const isAdmin = ADMIN_ROLE_IDS.has(Number(roleId));
  const now = currentDate();
  let {
    status,
    deliveredQuantity,
    quantityUnit,
    condition,
    shipperSignature,
    statement,
    photoUrls,
    notes,
    latitude,
    longitude,
    otpCode,
  } = updates;

  // Compress and upload signature to filesystem
  const uploadedShipper = await uploadSignature(shipperSignature, "sig_shipper");


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

  // ── Driver late evidence (record already CONFIRMED) ───────────────────────
  // If the shipper confirmed first (e.g. SHIPPER_DIRECT), the driver's later
  // POD submission must not fail: the journey's driver gets an idempotent
  // success — photos/notes are appended, while every field the shipper signed
  // is ignored (never overwritten).
  let isDriverLateEvidence = false;
  if (currentStatus === "CONFIRMED" && !isAdmin) {
    const [driverRows] = await executor.query(
      `SELECT dr.userUniqueId
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [current.journeyUniqueId],
    );
    if (driverRows[0]?.userUniqueId === updatedBy) {
      isDriverLateEvidence = true;
      status = undefined;
      deliveredQuantity = undefined;
      quantityUnit = undefined;
      condition = undefined;
      shipperSignature = undefined;
      statement = undefined;
      latitude = undefined;
      longitude = undefined;
      const hasAppendableEvidence =
        (Array.isArray(photoUrls) && photoUrls.length > 0) || notes !== undefined;
      if (!hasAppendableEvidence) {
        return {
          message: "Delivery already confirmed",
          data: {
            deliveryConfirmationUniqueId,
            deliveryConfirmationStatus: currentStatus,
            alreadyConfirmed: true,
          },
        };
      }
    }
  }

  const isSettling = status === "CONFIRMED" && currentStatus !== "CONFIRMED";
  const signedFieldsChanged =
    deliveredQuantity !== undefined ||
    quantityUnit !== undefined ||
    condition !== undefined ||
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
      // Allow admin OR the journey's driver to re-settle
      if (!isAdmin) {
        const [driverRows] = await executor.query(
          `SELECT dr.userUniqueId
           FROM Journey j
           JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
           LIMIT 1`,
          [current.journeyUniqueId],
        );
        if (driverRows[0]?.userUniqueId !== updatedBy) {
          throw new AppError(
            "Only an admin or the journey driver can re-settle a disputed delivery confirmation",
            AppError.FORBIDDEN,
          );
        }
      }
    }
  }

  if (currentStatus === "CONFIRMED" && signedFieldsChanged && !isAdmin && !isDriverLateEvidence) {
    throw new AppError(
      "Signed delivery evidence cannot be changed after confirmation",
      AppError.FORBIDDEN,
    );
  }

  // ── Settle authorization (PENDING → CONFIRMED) ────────────────────────────
  // Only an admin OR the actual receiver (the party who received the goods)
  // may settle a PENDING confirmation. The journey driver cannot self-confirm
  // their own delivery — the carrier attesting to delivery without the
  // receiver's agreement would defeat the proof-of-delivery guarantee.
  if (isSettling && currentStatus === "PENDING" && !isAdmin && current.receiverUserUniqueId !== updatedBy) {
    throw new AppError(
      "Only an admin or the receiver can confirm delivery",
      AppError.FORBIDDEN,
    );
  }

  // ── Settle-time evidence validation (PENDING/DISPUTED → CONFIRMED) ───────
  let finalShipperSignature = shipperSignature ?? current.deliveryConfirmationShipperSignature;
  let finalStatement = null;
  if (isSettling) {
    const finalQuantity = deliveredQuantity ?? current.deliveryConfirmationDeliveredQuantity;
    const finalUnit = quantityUnit ?? current.deliveryConfirmationQuantityUnit;
    const finalCondition = condition ?? current.deliveryConfirmationCondition;
    const finalLat = latitude ?? current.deliveryConfirmationLatitude;
    const finalLng = longitude ?? current.deliveryConfirmationLongitude;

    if (!finalShipperSignature) {
      throw new AppError(
        "A shipper signature is required to confirm delivery",
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
  if (shipperSignature !== undefined) {
    setParts.push("deliveryConfirmationShipperSignature = ?");
    values.push(uploadedShipper);
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
    currentStatus === "CONFIRMED" && (isAdmin || isDriverLateEvidence) && signedFieldsChanged;
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
        driverSignature: "",
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

  // Best-effort push so the shipper's POD view updates without polling.
  if (isSettling) {
    await notifyShipperOfPodConfirmed(
      current.journeyUniqueId,
      deliveryConfirmationUniqueId,
    );
  }

  if (isDriverLateEvidence) {
    return {
      message: "Delivery already confirmed; driver evidence attached",
      data: {
        deliveryConfirmationUniqueId,
        deliveryConfirmationStatus: currentStatus,
        alreadyConfirmed: true,
        deliveryConfirmationPhotos: photoUrls || [],
        deliveryConfirmationNotes: notes ?? current.deliveryConfirmationNotes,
      },
    };
  }

  return {
    message: "Delivery confirmation updated successfully",
    data: { deliveryConfirmationUniqueId, ...updates },
  };
};
