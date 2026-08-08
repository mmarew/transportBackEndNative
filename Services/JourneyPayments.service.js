const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { PAGINATION } = require("../Utils/Constants");

// Create a new journey payment
exports.createJourneyPayment = async ({
  journeyDecisionUniqueId,
  amount,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  user,
}) => {
  // Check if payment already exists for this journey decision
  const existedPayment = await getData({
    tableName: "JourneyPayments",
    conditions: { journeyDecisionUniqueId },
  });

  if (existedPayment.length > 0) {
    throw new AppError("Payment already exists for this journey", AppError.BAD_REQUEST);
  }

  // Verify journey decision exists
  const executor = transactionStorage.getStore() || pool;
  const [journeyExists] = await executor.query(
    `SELECT * FROM JourneyDecisions WHERE journeyDecisionUniqueId = ?`,
    [journeyDecisionUniqueId],
  );

  if (journeyExists.length === 0) {
    throw new AppError("Journey decision not found", AppError.NOT_FOUND);
  }

  // Create payment
  const paymentUniqueId = uuidv4();
  const now = currentDate();
  const sql = `INSERT INTO JourneyPayments 
      (paymentUniqueId, journeyDecisionUniqueId, amount, paymentMethodUniqueId, paymentStatusUniqueId, paymentTime, journeyPaymentCreatedBy, journeyPaymentCreatedAt) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [
    paymentUniqueId,
    journeyDecisionUniqueId,
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    now,
    user?.userUniqueId || "system",
    now,
  ];

  await executor.query(sql, values);

  return {
    paymentUniqueId,
    journeyDecisionUniqueId,
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
  };
};

// Get all journey payments with pagination and filtering
exports.getAllJourneyPayments = async ({
  page = 1,
  limit = 10,
  sortBy = "paymentTime",
  sortOrder = "DESC",
  journeyDecisionUniqueId,
  paymentMethodUniqueId,
  paymentStatusUniqueId,
  amountMin,
  amountMax,
  paymentTimeFrom,
  paymentTimeTo,
  driverUniqueId,
  shipperUniqueId,
} = {}) => {
  // Validate pagination
  const validatedPage = Math.max(1, parseInt(page));
  const validatedLimit = Math.max(1, Math.min(parseInt(limit), PAGINATION.MAX_PAGE_SIZE));
  const offset = (validatedPage - 1) * validatedLimit;

  // Build WHERE clause
  const conditions = [];
  const values = [];

  if (journeyDecisionUniqueId) {
    conditions.push("jp.journeyDecisionUniqueId = ?");
    values.push(journeyDecisionUniqueId);
  }

  if (paymentMethodUniqueId) {
    conditions.push("jp.paymentMethodUniqueId = ?");
    values.push(paymentMethodUniqueId);
  }

  if (paymentStatusUniqueId) {
    conditions.push("jp.paymentStatusUniqueId = ?");
    values.push(paymentStatusUniqueId);
  }

  if (amountMin !== undefined) {
    conditions.push("jp.amount >= ?");
    values.push(parseFloat(amountMin));
  }

  if (amountMax !== undefined) {
    conditions.push("jp.amount <= ?");
    values.push(parseFloat(amountMax));
  }

  if (paymentTimeFrom) {
    conditions.push("jp.paymentTime >= ?");
    values.push(paymentTimeFrom);
  }

  if (paymentTimeTo) {
    conditions.push("jp.paymentTime <= ?");
    values.push(paymentTimeTo);
  }

  // Filter by driver or shipper (requires JOIN)
  if (driverUniqueId) {
    conditions.push("dr.userUniqueId = ?");
    values.push(driverUniqueId);
  }

  if (shipperUniqueId) {
    conditions.push("sr.userUniqueId = ?");
    values.push(shipperUniqueId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Validate sortBy to prevent SQL injection
  const allowedSortFields = [
    "paymentId",
    "amount",
    "paymentTime",
    "journeyDecisionUniqueId",
  ];
  const validSortBy = allowedSortFields.includes(sortBy)
    ? `jp.${sortBy}`
    : "jp.paymentTime";
  const validSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  // Get total count
  const countQuery = `
      SELECT COUNT(*) as total 
      FROM JourneyPayments jp
      LEFT JOIN JourneyDecisions jd ON jp.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      LEFT JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      ${whereClause}
    `;
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countQuery, values);
  const totalCount = countResult[0].total;

  // Get paginated data with driver/shipper info
  // Actually, checking previous view_file, it was sr.shipperRequestId
  const correctedDataQuery = `
      SELECT 
        jp.*,
        dr.userUniqueId as driverUniqueId,
        sr.userUniqueId as shipperUniqueId,
        jd.shippingCostByDriver,
        pm.paymentMethod,
        ps.paymentStatus
      FROM JourneyPayments jp
      LEFT JOIN JourneyDecisions jd ON jp.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      LEFT JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      LEFT JOIN PaymentMethod pm ON jp.paymentMethodUniqueId = pm.paymentMethodUniqueId
      LEFT JOIN PaymentStatus ps ON jp.paymentStatusUniqueId = ps.paymentStatusUniqueId
      ${whereClause}
      ORDER BY ${validSortBy} ${validSortOrder}
      LIMIT ? OFFSET ?
    `;

  const [rows] = await executor.query(correctedDataQuery, [
    ...values,
    validatedLimit,
    offset,
  ]);

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalCount / validatedLimit);

  return {
    message: "Journey payments fetched successfully",
    data: rows,
    pagination: {
      currentPage: validatedPage,
      totalPages,
      totalItems: totalCount,
      limit: validatedLimit,
    },
  };
};

// Get a specific journey payment by ID
exports.getJourneyPaymentById = async (paymentUniqueId) => {
  const sql = `
      SELECT 
        jp.*,
        dr.userUniqueId as driverUniqueId,
        sr.userUniqueId as shipperUniqueId,
        jd.shippingCostByDriver,
        pm.paymentMethod,
        ps.paymentStatus
      FROM JourneyPayments jp
      LEFT JOIN JourneyDecisions jd ON jp.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      LEFT JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      LEFT JOIN PaymentMethod pm ON jp.paymentMethodUniqueId = pm.paymentMethodUniqueId
      LEFT JOIN PaymentStatus ps ON jp.paymentStatusUniqueId = ps.paymentStatusUniqueId
      WHERE jp.paymentUniqueId = ?
    `;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [paymentUniqueId]);

  if (result.length === 0) {
    throw new AppError("Payment not found", AppError.NOT_FOUND);
  }

  return result[0];
};

// Update a specific journey payment by ID
exports.updateJourneyPayment = async (data) => {
  const {
    paymentUniqueId,
    amount,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
    user,
  } = data;

  const setParts = [];
  const values = [];

  // Build dynamic SET clause based on provided fields
  if (amount !== undefined) {
    setParts.push("amount = ?");
    values.push(amount);
  }
  if (paymentMethodUniqueId !== undefined) {
    setParts.push("paymentMethodUniqueId = ?");
    values.push(paymentMethodUniqueId);
  }
  if (paymentStatusUniqueId !== undefined) {
    setParts.push("paymentStatusUniqueId = ?");
    values.push(paymentStatusUniqueId);
  }

  // Check if any fields were provided to update
  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // Always update audit fields
  setParts.push("journeyPaymentUpdatedBy = ?");
  values.push(user?.userUniqueId);
  setParts.push("journeyPaymentUpdatedAt = ?");
  values.push(currentDate());

  values.push(paymentUniqueId);
  const sql = `UPDATE JourneyPayments SET ${setParts.join(", ")} WHERE paymentUniqueId = ? AND journeyPaymentDeletedAt IS NULL`;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update payment or payment not found", AppError.NOT_FOUND);
  }

  return {
    paymentUniqueId,
    ...(amount !== undefined && { amount }),
    ...(paymentMethodUniqueId !== undefined && { paymentMethodUniqueId }),
    ...(paymentStatusUniqueId !== undefined && { paymentStatusUniqueId }),
  };
};

// Delete a specific journey payment by ID
exports.deleteJourneyPayment = async (paymentUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `DELETE FROM JourneyPayments WHERE paymentUniqueId = ?`;
  const [result] = await executor.query(sql, [paymentUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete payment or payment not found", AppError.NOT_FOUND);
  }

  return `Payment ${paymentUniqueId} deleted successfully`;
};
