"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { getData } = require("../../CRUD/Read/ReadData");
const { uploadSignature } = require("./signature.service");
const { ensureReceiverUser } = require("./helpers");
const { createShipperDirectConfirmation } = require("./create-receipt.service");
const { getDeliveryConfirmations } = require("./read.service");
const { updateDeliveryConfirmation } = require("./update.service");

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
  shipperSignature,
  photoUrls,
  notes,
  latitude,
  longitude,
  status,
}) => {
  try {
    // Compress and upload signature to filesystem
    shipperSignature = await uploadSignature(shipperSignature, "sig_shipper");

    const executor = transactionStorage.getStore() || pool;
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
        deliveryConfirmationSource,
        deliveryConfirmationDeliveredQuantity,
        deliveryConfirmationQuantityUnit,
        deliveryConfirmationCondition,
        deliveryConfirmationDriverSignature,
        deliveryConfirmationDriverSignedAt,
        deliveryConfirmationNotes,
        deliveryConfirmationLatitude,
        deliveryConfirmationLongitude,
        deliveryConfirmationSubmittedAt,
        deliveryConfirmationCreatedBy,
        deliveryConfirmationCreatedAt
      ) VALUES (?, ?, ?, 'PENDING', 'FORMAL_POD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      resolvedReceiverUserUniqueId,
      deliveredQuantity ?? null,
      quantityUnit ?? null,
      condition || "GOOD",
      null,
      null, // driver signature removed — shipper signs only
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
        deliveryConfirmationPhotos: photoUrls || [],
        deliveryConfirmationSubmittedAt: now,
      },
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      // Idempotent create: the journey already has a confirmation. Instead of a
      // 409, hand back the existing record (same shape as GET) with a flag, so
      // submissions/retries never error — the record simply already exists.
      const existingResult = await getDeliveryConfirmations({
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
          const settled = await updateDeliveryConfirmation(
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
