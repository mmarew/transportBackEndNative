const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");
const { v4: uuidv4 } = require("uuid");
const { getPlaceholderEmail } = require("../Utils/GetPlaceholderEmail");

const { getData } = require("../CRUD/Read/ReadData");

const DELIVERY_CONFIRMATION_STATUSES = ["PENDING", "CONFIRMED", "DISPUTED"];
const DELIVERY_CONFIRMATION_CONDITIONS = ["GOOD", "DAMAGED", "PARTIAL"];

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
  photoUrl,
  notes,
  latitude,
  longitude,
}) => {
  try {
    const executor = transactionStorage.getStore() || pool;

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
        deliveryConfirmationPhotoUrl,
        deliveryConfirmationNotes,
        deliveryConfirmationLatitude,
        deliveryConfirmationLongitude,
        deliveryConfirmationSubmittedAt,
        deliveryConfirmationCreatedBy,
        deliveryConfirmationCreatedAt
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      resolvedReceiverUserUniqueId,
      deliveredQuantity ?? null,
      quantityUnit ?? null,
      condition || "GOOD",
      receiverSignature ?? null,
      photoUrl ?? null,
      notes ?? null,
      latitude ?? null,
      longitude ?? null,
      now,
      createdBy,
      now,
    ];

    await executor.query(sql, values);

    return {
      message: "Delivery confirmation created successfully",
      data: {
        deliveryConfirmationUniqueId,
        journeyUniqueId,
        receiverUserUniqueId: resolvedReceiverUserUniqueId,
        deliveryConfirmationStatus: "PENDING",
        deliveryConfirmationPhotoUrl: photoUrl ?? null,
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
      r.fullName AS receiverFullName,
      r.phoneNumber AS receiverPhoneNumber,
      c.fullName AS confirmedByFullName
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

// Update a delivery confirmation (partial update — only sets provided fields).
// Setting status to CONFIRMED or DISPUTED settles the confirmation.
exports.updateDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  updates,
  updatedBy,
) => {
  const setParts = [];
  const values = [];

  const {
    status,
    deliveredQuantity,
    quantityUnit,
    condition,
    receiverSignature,
    photoUrl,
    notes,
    latitude,
    longitude,
  } = updates;

  if (status !== undefined) {
    if (!DELIVERY_CONFIRMATION_STATUSES.includes(status)) {
      throw new AppError(
        `Invalid status. Must be one of: ${DELIVERY_CONFIRMATION_STATUSES.join(", ")}`,
        AppError.BAD_REQUEST,
      );
    }
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
  }
  if (photoUrl !== undefined) {
    setParts.push("deliveryConfirmationPhotoUrl = ?");
    values.push(photoUrl);
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

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // When settling (CONFIRMED/DISPUTED), record who confirmed it and when.
  if (status === "CONFIRMED" || status === "DISPUTED") {
    setParts.push("confirmedByUserUniqueId = ?");
    values.push(updatedBy);
    setParts.push("deliveryConfirmationConfirmedAt = ?");
    values.push(currentDate());
  }

  setParts.push("deliveryConfirmationUpdatedBy = ?");
  values.push(updatedBy);
  setParts.push("deliveryConfirmationUpdatedAt = ?");
  values.push(currentDate());
  values.push(deliveryConfirmationUniqueId);

  const sql = `UPDATE DeliveryConfirmations SET ${setParts.join(", ")} WHERE deliveryConfirmationUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError(
      "Failed to update delivery confirmation",
      AppError.INTERNAL_SERVER_ERROR,
    );
  }

  return {
    message: "Delivery confirmation updated successfully",
    data: { deliveryConfirmationUniqueId, ...updates },
  };
};

// Delete a delivery confirmation (soft delete)
exports.deleteDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  deletedBy,
) => {
  const sql = `
    UPDATE DeliveryConfirmations
    SET deliveryConfirmationDeletedBy = ?, deliveryConfirmationDeletedAt = ?
    WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL
  `;
  const values = [deletedBy, currentDate(), deliveryConfirmationUniqueId];
  const executor = transactionStorage.getStore() || pool;
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
