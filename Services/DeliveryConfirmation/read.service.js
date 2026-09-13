"use strict";

const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { resolveDocumentUrl } = require("../../Utils/FTPHandler");

// Get delivery confirmations via filters (id, journey, receiver, status) with pagination
exports.getDeliveryConfirmations = async ({
  deliveryConfirmationUniqueId = "",
  journeyUniqueId = "",
  receiverUserUniqueId = "",
  status = "",
  page = 1,
  limit = 10,
  userUniqueId,
  roleId,
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

  // ── Role-based visibility scoping ────────────────────────────────────────
  // Driver → only their own deliveries; Shipper → only theirs;
  // Admin / SuperAdmin → unfiltered; CompanyAdmin → their company's deliveries.
  const roleIdNum = Number(roleId);
  const adminRoleIds = [
    Number(usersRoles.adminRoleId),
    Number(usersRoles.supperAdminRoleId),
  ];
  if (userUniqueId && !adminRoleIds.includes(roleIdNum)) {
    if (roleIdNum === Number(usersRoles.driverRoleId)) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM Journey j
        JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
        JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
        WHERE j.journeyUniqueId = dc.journeyUniqueId
          AND j.journeyDeletedAt IS NULL
          AND dr.userUniqueId = ?
      )`;
      params.push(userUniqueId);
    } else if (roleIdNum === Number(usersRoles.shipperRoleId)) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM Journey j
        JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
        JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
        WHERE j.journeyUniqueId = dc.journeyUniqueId
          AND j.journeyDeletedAt IS NULL
          AND sr.userUniqueId = ?
      )`;
      params.push(userUniqueId);
    } else if (
      roleIdNum === Number(usersRoles.companyAdminRoleId) ||
      roleIdNum === Number(usersRoles.dispatcherRoleId)
    ) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM Journey j
        JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
        JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
        JOIN CompanyMembership cm ON cm.userUniqueId = ? AND cm.isActive = 1 AND cm.membershipDeletedAt IS NULL
        WHERE j.journeyUniqueId = dc.journeyUniqueId
          AND j.journeyDeletedAt IS NULL
          AND sr.targetCompanyUniqueId = cm.companyUniqueId
      )`;
      params.push(userUniqueId);
    } else {
      whereClause += " AND 1 = 0";
    }
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
      dc.deliveryConfirmationDriverSignature,
      dc.deliveryConfirmationNotes,
      dc.deliveryConfirmationLatitude,
      dc.deliveryConfirmationLongitude,
      dc.deliveryConfirmationSubmittedAt,
      dc.deliveryConfirmationConfirmedAt,
      dc.deliveryConfirmationShipperSignature,
      dc.deliveryConfirmationStatement,
      dc.deliveryConfirmationSignatureHash,
      dc.deliveryConfirmationPreviousHash,
      dc.deliveryConfirmationDriverSignedAt,
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
      // Resolve signature file paths to public URLs
      if (row.deliveryConfirmationDriverSignature) {
        row.deliveryConfirmationDriverSignature = resolveDocumentUrl(
          row.deliveryConfirmationDriverSignature,
        );
      }
      if (row.deliveryConfirmationShipperSignature) {
        row.deliveryConfirmationShipperSignature = resolveDocumentUrl(
          row.deliveryConfirmationShipperSignature,
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
