const Config = require("../Utils/Config");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const {
  prepareAndCreateNewBalance,
} = require("./UserBalance.service/UserBalance.post.service");
const {
  getCommissionRateData,
  getCommissionStatusPaidId,
} = require("./FixedData.service");
const { transactionStorage } = require("../Utils/TransactionContext");

const allowedSortFields = {
  commissionId: "c.commissionId",
  commissionAmount: "c.commissionAmount",
  paymentTime: "jd.deliveryDateByDriver",
  driverName: "u.fullName",
  shipperName: "u_pass.fullName",
  commissionStatus: "cs.statusName",
};

function validateCommissionData(data) {
  if (!data.commissionAmount) {
    throw new AppError("Commission amount is required", 400);
  }
  // Additional business logic validation
  if (data.commissionAmount <= 0) {
    throw new AppError("Commission amount must be greater than 0", 400);
  }

  if (data.commissionAmount > 999999.99) {
    throw new AppError("Commission amount exceeds maximum limit", 400);
  }
  return true;
}

async function createCommission(
  { journeyDecisionUniqueId, paymentAmount, commissionCreatedBy },
  connection = null,
) {
  const executor = transactionStorage.getStore() || connection || pool;

  validateCommissionData({ commissionAmount: paymentAmount }); // Basic validation on payment amount

  if (!journeyDecisionUniqueId) {
    throw new AppError("Journey decision unique id is required", 400);
  }
  if (!commissionCreatedBy) {
    throw new AppError("Commission created by is required", 400);
  }

  // Fetch commission rate once (cached)
  const { commissionRateUniqueId, commissionRateValue } =
    await getCommissionRateData();

  if (!commissionRateUniqueId || !commissionRateValue) {
    throw new AppError("Commission rate is not configured properly", 400);
  }

  // Calculate commission amount
  const commissionAmount = paymentAmount * commissionRateValue;
  logger.info("createCommission commissionAmount" + commissionAmount);
  // Validate calculated commission amount
  validateCommissionData({ commissionAmount });

  // Get commission status (cached in FixedData.service)
  const commissionStatusUniqueId = await getCommissionStatusPaidId();

  // 1. Verify journey decision exists
  const [journeyData] = await executor.query(
    `SELECT jd.journeyDecisionUniqueId, jd.journeyStatusId, dr.userUniqueId as driverUniqueId
     FROM JourneyDecisions jd
     JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
     WHERE jd.journeyDecisionUniqueId = ?`,
    [journeyDecisionUniqueId],
  );

  if (journeyData.length === 0) {
    throw new AppError(
      {
        message: "Journey Decision not found",
        code: "JOURNEY_NOT_FOUND",
      },
      404,
    );
  }

  // Check if journey is completed (commission only for completed journeys)
  if (journeyData[0].journeyStatusId !== journeyStatusMap.journeyCompleted) {
    throw new AppError(
      {
        message: "Commissions can only be created for completed journeys",
        code: "INVALID_JOURNEY_STATUS",
        details: `Current status is ${journeyData[0].journeyStatusId}`,
      },
      400,
    );
  }

  // 2. Check for existing commission
  const [existingCommission] = await executor.query(
    `SELECT commissionUniqueId
     FROM Commission
     WHERE journeyDecisionUniqueId = ?
     AND commissionDeletedAt IS NULL`,
    [journeyDecisionUniqueId],
  );

  if (existingCommission.length > 0) {
    throw new AppError(
      {
        message: "Commission already exists for this journey",
        code: "DUPLICATE_COMMISSION",
      },
      409,
    );
  }

  // 3. Verify commission rate exists (double-check the cache)
  const [rateExists] = await executor.query(
    `SELECT commissionRateId, commissionRate AS commissionRateValue FROM CommissionRates WHERE commissionRateUniqueId = ? AND commissionRateDeletedAt IS NULL`,
    [commissionRateUniqueId],
  );

  if (rateExists.length === 0) {
    throw new AppError(
      {
        message: "Active commission rate not found",
        code: "RATE_NOT_FOUND",
      },
      404,
    );
  }

  // 4. Verify commission Status Exists (double-check cache)
  const [statusExists] = await executor.query(
    `SELECT commissionStatusId FROM CommissionStatus WHERE commissionStatusUniqueId = ?`,
    [commissionStatusUniqueId],
  );

  if (statusExists.length === 0) {
    throw new AppError("Invalid Commission Status Unique ID", 400);
  }

  // 5. Create commission
  const commissionUniqueId = uuidv4();
  const values = {
    commissionUniqueId,
    journeyDecisionUniqueId,
    commissionRateUniqueId,
    commissionAmount,
    commissionStatusUniqueId,
    commissionCreatedBy,
    commissionCreatedAt: currentDate(),
  };

  await executor.query(`INSERT INTO Commission SET ?`, [values]);

  // 6. Get created commission with details
  const [commissionData] = await executor.query(
    `SELECT
      c.*,
      cr.commissionRate AS commissionRateValue,
      cs.statusName as commissionStatus
     FROM Commission c
     JOIN CommissionRates cr ON c.commissionRateUniqueId = cr.commissionRateUniqueId
     JOIN CommissionStatus cs ON c.commissionStatusUniqueId = cs.commissionStatusUniqueId
     WHERE c.commissionUniqueId = ?`,
    [commissionUniqueId],
  );

  // Log business event
  logger.application.commissionCreated(commissionData[0], commissionCreatedBy);

  // Deduct commission from driver balance
  const driverUniqueId = journeyData[0].driverUniqueId;

  await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: commissionAmount,
    driverUniqueId: driverUniqueId,
    transactionUniqueId: commissionUniqueId,
    transactionType: "Commission",
    userBalanceCreatedBy: commissionCreatedBy,
  });

  return {
    message: "Commission created successfully",
    data: commissionData[0],
    code: "COMMISSION_CREATED",
  };
}

async function getAllCommissions(filters = {}) {
  try {
    logger.debug("@filters in getAllCommissions", filters);
    // Build safe WHERE clause
    const conditions = ["c.commissionDeletedAt IS NULL"];
    const values = [];

    // Helper function to add conditions safely
    const addCondition = (field, value, operator = "=") => {
      if (value !== undefined && value !== null && value !== "") {
        conditions.push(`${field} ${operator} ?`);
        values.push(value);
      }
    };

    const addLikeCondition = (field, value) => {
      if (value) {
        conditions.push(`${field} LIKE ?`);
        values.push(`%${value}%`);
      }
    };

    const addRangeCondition = (field, min, max) => {
      if (min !== undefined) {
        conditions.push(`${field} >= ?`);
        values.push(parseFloat(min));
      }
      if (max !== undefined) {
        conditions.push(`${field} <= ?`);
        values.push(parseFloat(max));
      }
    };

    const addDateRangeCondition = (field, start, end) => {
      if (start) {
        conditions.push(`${field} >= ?`);
        values.push(
          new Date(start).toISOString().slice(0, 19).replace("T", " "),
        );
      }
      if (end) {
        conditions.push(`${field} <= ?`);
        values.push(new Date(end).toISOString().slice(0, 19).replace("T", " "));
      }
    };

    // Apply filters
    addCondition("c.commissionUniqueId", filters.commissionUniqueId);
    addCondition("c.paymentUniqueId", filters.paymentUniqueId);
    addCondition("c.journeyDecisionUniqueId", filters.journeyDecisionUniqueId);
    addCondition("c.commissionRateUniqueId", filters.commissionRateUniqueId);
    addCondition("u.userUniqueId", filters.driverUniqueId);
    addCondition("u_pass.userUniqueId", filters.shipperUniqueId);
    addCondition(
      "c.commissionStatusUniqueId",
      filters.commissionStatusUniqueId,
    );

    addLikeCondition("u.fullName", filters.driverName);
    addLikeCondition("u.phoneNumber", filters.driverPhone);
    addLikeCondition("u.email", filters.driverEmail);
    addLikeCondition("u_pass.fullName", filters.shipperName);
    addLikeCondition("u_pass.phoneNumber", filters.shipperPhone);
    addLikeCondition("u_pass.email", filters.shipperEmail);

    addRangeCondition(
      "c.commissionAmount",
      filters.commissionAmountMin,
      filters.commissionAmountMax,
    );
    addDateRangeCondition(
      "jd.deliveryDateByDriver",
      filters.startDate,
      filters.endDate,
    );

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Safe sorting
    const sortField =
      allowedSortFields[filters.sortBy] || allowedSortFields.commissionId;
    const sortOrder =
      filters.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // Pagination
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(filters.limit) || 10), 100);
    const offset = (page - 1) * limit;

    // Get total count and paginated data in single query using SQL_CALC_FOUND_ROWS
    const dataQuery = `
      SELECT SQL_CALC_FOUND_ROWS
        c.*,
        cs.statusName as commissionStatus,
        jd.deliveryDateByDriver as paymentTime,
        jd.shippingCostByDriver as paymentAmount,
        u.fullName as driverName,
        u.phoneNumber as driverPhone,
        u.email as driverEmail,
        u.userUniqueId as driverUniqueId,
        u_pass.fullName as shipperName,
        u_pass.phoneNumber as shipperPhone,
        u_pass.email as shipperEmail,
        u_pass.userUniqueId as shipperUniqueId,
        cr.commissionRate as commissionRateValue,
        NULL as commissionRateName
      FROM Commission c
      left JOIN CommissionStatus cs ON c.commissionStatusUniqueId = cs.commissionStatusUniqueId
      left JOIN JourneyDecisions jd ON c.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      left JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
      left JOIN Users u ON dr.userUniqueId = u.userUniqueId
      left  JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
      JOIN Users u_pass ON sr.userUniqueId = u_pass.userUniqueId
      JOIN CommissionRates cr ON c.commissionRateUniqueId = cr.commissionRateUniqueId
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...values, limit, offset]);

    // Get total count using FOUND_ROWS()
    const [countResult] = await pool.query("SELECT FOUND_ROWS() as total");
    const totalCount = countResult[0]?.total || 0;

    logger.debug("Commission Query Results", {
      type: "COMMISSION_QUERY",
      filterCount: Object.keys(filters).length,
      resultCount: rows.length,
      page: page,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      message: "success",
      data: rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      code: "COMMISSIONS_RETRIEVED",
    };
  } catch (error) {
    logger.application.databaseError(error, "getAllCommissions", filters);
    throw new AppError(
      {
        message: "Failed to retrieve commissions",
        code: "DATABASE_ERROR",
        details: Config.NODE_ENV === "development" ? error.message : undefined,
      },
      500,
    );
  }
}

async function updateCommission(id, data, updatedBy) {
  const fields = [];
  const values = [];

  if (data.commissionStatusUniqueId) {
    fields.push("commissionStatusUniqueId = ?");
    values.push(data.commissionStatusUniqueId);
  }

  if (data.journeyDecisionUniqueId) {
    fields.push("journeyDecisionUniqueId = ?");
    values.push(data.journeyDecisionUniqueId);
  }
  if (data.commissionRateUniqueId) {
    fields.push("commissionRateUniqueId = ?");
    values.push(data.commissionRateUniqueId);
  }
  if (data.commissionAmount) {
    fields.push("commissionAmount = ?");
    values.push(data.commissionAmount);
  }

  if (fields.length === 0) {
    throw new AppError("No fields to update", 400);
  }

  const amountOrDriverChanged =
    data.commissionAmount !== null || data.journeyDecisionUniqueId !== null;

  // If amount or driver (journey) changes, get current commission for UserBalance reversal
  let oldAmount = null;
  let oldDriverUniqueId = null;

  try {
    const executor = transactionStorage.getStore() || pool;
    if (amountOrDriverChanged) {
      const [oldRows] = await executor.query(
        `SELECT c.commissionAmount, dr.userUniqueId AS driverUniqueId
           FROM Commission c
           JOIN JourneyDecisions jd ON c.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
           JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
           WHERE c.commissionUniqueId = ? AND c.commissionDeletedAt IS NULL`,
        [id],
      );
      if (oldRows.length > 0) {
        oldAmount = oldRows[0].commissionAmount;
        oldDriverUniqueId = oldRows[0].driverUniqueId;
      }
    }

    fields.push("commissionUpdatedBy = ?");
    values.push(updatedBy);

    // Add ID for WHERE clause
    values.push(id);

    const sql = `
         UPDATE Commission
         SET ${fields.join(", ")}
         WHERE commissionUniqueId = ? AND commissionDeletedAt IS NULL
       `;

    const [updateResult] = await executor.query(sql, values);

    if (updateResult.affectedRows === 0) {
      throw new AppError("Commission not found or could not be updated", 404);
    }

    // Reconcile UserBalance when amount or driver changes: reverse old, deduct new
    if (
      amountOrDriverChanged &&
      oldAmount !== null &&
      oldDriverUniqueId !== null
    ) {
      const [newRows] = await executor.query(
        `SELECT c.commissionAmount, dr.userUniqueId AS driverUniqueId
           FROM Commission c
           JOIN JourneyDecisions jd ON c.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
           JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
           WHERE c.commissionUniqueId = ? AND c.commissionDeletedAt IS NULL`,
        [id],
      );
      if (newRows.length > 0) {
        const newAmount = newRows[0].commissionAmount;
        const newDriverUniqueId = newRows[0].driverUniqueId;
        // Reversal: add back old amount (undo original deduction). Adjustment: deduct new amount.
        await prepareAndCreateNewBalance({
          addOrDeduct: "add",
          amount: oldAmount,
          driverUniqueId: oldDriverUniqueId,
          transactionUniqueId: id,
          transactionType: "Commission",
          userBalanceAdjustmentType: "reversal",
          userBalanceCreatedBy: updatedBy,
        });
        await prepareAndCreateNewBalance({
          addOrDeduct: "deduct",
          amount: newAmount,
          driverUniqueId: newDriverUniqueId,
          transactionUniqueId: id,
          transactionType: "Commission",
          userBalanceAdjustmentType: "adjustment",
          userBalanceCreatedBy: updatedBy,
        });
      }
    }

    logger.info("Commission Updated", {
      commissionId: id,
      updatedBy,
      updates: data,
    });

    return {
      message: "Commission record updated successfully",
      data: updateResult,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.application.databaseError(error, "Commission update failed", { id });
    throw error;
  }
}

async function deleteCommission(id, deletedBy) {
  // 1. Get commission amount and driver for UserBalance reversal
  const [commissionRows] = await pool.query(
    `SELECT c.commissionAmount, dr.userUniqueId AS driverUniqueId
     FROM Commission c
     JOIN JourneyDecisions jd ON c.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
     JOIN DriverRequest dr ON jd.driverRequestId = dr.driverRequestId
     WHERE c.commissionUniqueId = ? AND c.commissionDeletedAt IS NULL`,
    [id],
  );

  if (commissionRows.length === 0) {
    throw new AppError("Commission not found or already deleted", 404);
  }

  const { commissionAmount, driverUniqueId } = commissionRows[0];

  // 2. Soft-delete commission
  const updateSql = `
    UPDATE Commission
    SET commissionDeletedAt = ?, commissionDeletedBy = ?
    WHERE commissionUniqueId = ? AND commissionDeletedAt IS NULL
  `;
  try {
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(updateSql, [
      currentDate(),
      deletedBy,
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new AppError("Commission not found or already deleted", 404);
    }

    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: commissionAmount,
      driverUniqueId,
      transactionUniqueId: id,
      transactionType: "Commission",
      userBalanceAdjustmentType: "reversal",
      userBalanceCreatedBy: deletedBy,
    });

    logger.info("Commission Deleted", { commissionId: id, deletedBy });

    return {
      message: "success",
      data: `Commission with ID ${id} deleted successfully`,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.application.databaseError(error, updateSql, [deletedBy, id]);
    throw new AppError("Failed to delete commission", 500);
  }
}

module.exports = {
  createCommission,
  getAllCommissions,
  updateCommission,
  deleteCommission,
  validateCommissionData,
};
