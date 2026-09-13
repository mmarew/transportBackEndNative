"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { buildDefaultStatement } = require("./helpers");
const {
  uploadSignature,
  buildSignatureHashInput,
  sha256,
} = require("./signature.service");
const { notifyDriverOfPodConfirmed } = require("./notify.service");

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
  // Compress and upload the shipper's signature to filesystem
  shipperSignature = await uploadSignature(shipperSignature, "sig_shipper");

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
      driverSignature: "",
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
       deliveryConfirmationDriverSignature,
       deliveryConfirmationShipperSignature,
       deliveryConfirmationShipperSignedAt,
       deliveryConfirmationStatement,
       deliveryConfirmationSignatureHash,
       deliveryConfirmationNotes,
       deliveryConfirmationSubmittedAt,
       deliveryConfirmationCreatedBy,
       confirmedByUserUniqueId,
       deliveryConfirmationConfirmedAt,
       deliveryConfirmationCreatedAt,
       deliveryConfirmationUpdatedAt
     ) VALUES (?, ?, ?, 'CONFIRMED', 'SHIPPER_DIRECT', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  await notifyDriverOfPodConfirmed(
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

  const hash = sha256(
    buildSignatureHashInput({
      journeyUniqueId,
      driverSignature: "",
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
     ) VALUES (?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      receiverUserUniqueId,
      source,
      deliveredQuantity ?? null,
      quantityUnit || null,
      condition || "GOOD",
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
  await notifyDriverOfPodConfirmed(
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
     FROM Journey j
     JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     WHERE j.journeyUniqueId = ?`,
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

module.exports.createShipperDirectConfirmation = createShipperDirectConfirmation;
